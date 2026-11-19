/**
 * Vectorizer Engine
 * Converts raster line art into clean, smooth, animatable SVG vector strokes.
 * Implements:
 * 1. Zhang-Suen Morphological Skeletonization (1-pixel thinning)
 * 2. Topological Graph Path Tracing (chains, branches, loops)
 * 3. Distance-transform stroke width estimation
 * 4. Ramer-Douglas-Peucker (RDP) path simplification
 * 5. Smooth Bezier Curve Fitting (Catmull-Rom & Schneider cubics)
 * 6. Semantic portrait layer classification (Hair, Eyes, Nose, Mouth, Face, Torso)
 */

export class Vectorizer {
  /**
   * Main entry point: Vectorizes a binary raster image into a set of stroke paths.
   * @param {Uint8Array} binaryMap - 0 = line (black), 255 = background (white)
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {Object} options - Vectorization settings
   */
  static vectorize(binaryMap, width, height, options = {}) {
    const {
      simplification = 1.8,    // RDP epsilon in pixels
      minStrokeLength = 8,    // Discard tiny noise specks
      bezierSmoothing = true, // Fit cubic beziers
      strokeColor = '#1e293b',// Default line color
      defaultStrokeWidth = 2.5
    } = options;

    // 1. Convert binary map to 1/0 skeleton representation (1 = line, 0 = bg)
    const grid = new Uint8Array(width * height);
    for (let i = 0; i < binaryMap.length; i++) {
      grid[i] = binaryMap[i] === 0 ? 1 : 0;
    }

    // 2. Estimate line widths before skeletonization using fast distance approximation
    const widthMap = this.computeLineWidths(grid, width, height);

    // 3. Zhang-Suen Skeletonization
    const skeleton = this.zhangSuenThinning(grid, width, height);

    // 4. Trace continuous paths from skeleton
    const rawPaths = this.traceSkeleton(skeleton, width, height, widthMap);

    // 5. Simplify and fit curves
    const vectorPaths = [];
    let pathCounter = 0;

    for (const raw of rawPaths) {
      if (raw.points.length < 2) continue;

      // Calculate path arc length
      let totalLength = 0;
      for (let i = 0; i < raw.points.length - 1; i++) {
        totalLength += Math.hypot(
          raw.points[i + 1].x - raw.points[i].x,
          raw.points[i + 1].y - raw.points[i].y
        );
      }

      if (totalLength < minStrokeLength) continue;

      // Simplify points with RDP
      const simplifiedPoints = this.simplifyRDP(raw.points, simplification);
      if (simplifiedPoints.length < 2) continue;

      // Generate SVG path string (Bezier or Polyline)
      let d = '';
      if (bezierSmoothing && simplifiedPoints.length >= 3) {
        d = this.pointsToBezierPath(simplifiedPoints, raw.isClosed);
      } else {
        d = this.pointsToPolylinePath(simplifiedPoints, raw.isClosed);
      }

      // Calculate bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pt of simplifiedPoints) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }

      const assignedWidth = Math.max(1, Math.min(12, raw.avgWidth || defaultStrokeWidth));

      vectorPaths.push({
        id: `path_${++pathCounter}`,
        d,
        points: simplifiedPoints,
        isClosed: raw.isClosed,
        length: Math.round(totalLength * 10) / 10,
        strokeWidth: Math.round(assignedWidth * 10) / 10,
        strokeColor,
        strokeCap: 'round',
        strokeJoin: 'round',
        opacity: 1,
        bbox: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
        centroid: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      });
    }

    // 6. Semantic layer classification based on human facial anatomy layout
    this.classifyLayers(vectorPaths, width, height);

    return {
      paths: vectorPaths,
      width,
      height
    };
  }

  /**
   * Estimates line thickness at each point by measuring orthogonal distance to white pixels.
   */
  static computeLineWidths(grid, width, height) {
    const widthMap = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y * width + x] === 1) {
          // Raycast horizontal & vertical
          let horiz = 1;
          while (x - horiz >= 0 && grid[y * width + (x - horiz)] === 1) horiz++;
          let horizR = 1;
          while (x + horizR < width && grid[y * width + (x + horizR)] === 1) horizR++;

          let vertT = 1;
          while (y - vertT >= 0 && grid[(y - vertT) * width + x] === 1) vertT++;
          let vertB = 1;
          while (y + vertB < height && grid[(y + vertB) * width + x] === 1) vertB++;

          const hSpan = (horiz - 1) + (horizR - 1) + 1;
          const vSpan = (vertT - 1) + (vertB - 1) + 1;
          widthMap[y * width + x] = Math.min(hSpan, vSpan);
        }
      }
    }
    return widthMap;
  }

  /**
   * Zhang-Suen Thinning Algorithm.
   * Reduces binary strokes to a 1-pixel wide skeleton.
   */
  static zhangSuenThinning(binaryGrid, width, height) {
    const grid = new Uint8Array(binaryGrid);

    // Only interior foreground pixels can be removed; track them in a shrinking candidate list
    let candidates = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (grid[idx] === 1) candidates.push(idx);
      }
    }
    candidates = Int32Array.from(candidates);
    const toDelete = new Int32Array(candidates.length);
    const w = width;

    let hasChanged = true;
    let iter = 0;
    const maxIter = 100;

    while (hasChanged && iter < maxIter) {
      hasChanged = false;
      iter++;

      for (let pass = 0; pass < 2; pass++) {
        let count = 0;
        for (let c = 0; c < candidates.length; c++) {
          const idx = candidates[c];
          if (grid[idx] !== 1) continue;

          // Neighbours clockwise from north: P2..P9
          const p2 = grid[idx - w], p3 = grid[idx - w + 1], p4 = grid[idx + 1], p5 = grid[idx + w + 1];
          const p6 = grid[idx + w], p7 = grid[idx + w - 1], p8 = grid[idx - 1], p9 = grid[idx - w - 1];

          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;

          // Number of 0 -> 1 transitions around the ring
          const a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) +
                    (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (a !== 1) continue;

          if (pass === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          }
          toDelete[count++] = idx;
        }

        for (let i = 0; i < count; i++) grid[toDelete[i]] = 0;
        if (count > 0) hasChanged = true;
      }

      // Drop removed pixels from the candidate list
      let kept = 0;
      for (let c = 0; c < candidates.length; c++) {
        if (grid[candidates[c]] === 1) candidates[kept++] = candidates[c];
      }
      candidates = candidates.subarray(0, kept);
    }

    return grid;
  }

  /**
   * Traces skeleton pixels into ordered polylines.
   */
  static traceSkeleton(skeleton, width, height, widthMap) {
    const visited = new Uint8Array(width * height);
    const paths = [];

    // Helper: count 8-neighbors of a pixel
    function countNeighbors(x, y) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (skeleton[ny * width + nx] === 1) count++;
          }
        }
      }
      return count;
    }

    // Helper: get unvisited neighbors
    function getNextUnvisited(x, y) {
      const result = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = ny * width + nx;
            if (skeleton[idx] === 1 && !visited[idx]) {
              result.push({ x: nx, y: ny, idx });
            }
          }
        }
      }
      return result;
    }

    // Pass 1: Start tracing from endpoints (pixels with 1 neighbor)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (skeleton[idx] === 1 && !visited[idx]) {
          const neighbors = countNeighbors(x, y);
          if (neighbors === 1) {
            const stroke = this.walkPath(x, y, skeleton, visited, width, height, widthMap, false);
            if (stroke.points.length >= 2) {
              paths.push(stroke);
            }
          }
        }
      }
    }

    // Pass 2: Trace remaining unvisited points (junctions & closed loops)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (skeleton[idx] === 1 && !visited[idx]) {
          const stroke = this.walkPath(x, y, skeleton, visited, width, height, widthMap, true);
          if (stroke.points.length >= 2) {
            paths.push(stroke);
          }
        }
      }
    }

    return paths;
  }

  /**
   * Walks along contiguous skeleton pixels to extract a single chain.
   */
  static walkPath(startX, startY, skeleton, visited, width, height, widthMap, allowLoop) {
    const points = [{ x: startX, y: startY }];
    let currX = startX;
    let currY = startY;
    let totalW = widthMap ? widthMap[startY * width + startX] : 2;
    let countW = 1;

    visited[startY * width + startX] = 1;
    let isClosed = false;

    while (true) {
      let bestNext = null;
      let minCrossings = Infinity;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = currX + dx;
          const ny = currY + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          const nIdx = ny * width + nx;
          if (skeleton[nIdx] === 1) {
            if (!visited[nIdx]) {
              bestNext = { x: nx, y: ny, idx: nIdx };
              break;
            } else if (allowLoop && points.length > 4 && nx === startX && ny === startY) {
              isClosed = true;
              break;
            }
          }
        }
        if (bestNext || isClosed) break;
      }

      if (isClosed) {
        points.push({ x: startX, y: startY });
        break;
      }

      if (!bestNext) break;

      visited[bestNext.idx] = 1;
      points.push({ x: bestNext.x, y: bestNext.y });
      if (widthMap) {
        totalW += widthMap[bestNext.idx];
        countW++;
      }
      currX = bestNext.x;
      currY = bestNext.y;
    }

    return {
      points,
      isClosed,
      avgWidth: countW > 0 ? (totalW / countW) : 2.5
    };
  }

  /**
   * Ramer-Douglas-Peucker (RDP) algorithm for polyline decimation.
   */
  static simplifyRDP(points, epsilon) {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIdx = 0;
    const endIdx = points.length - 1;

    const p1 = points[0];
    const p2 = points[endIdx];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lineLenSq = dx * dx + dy * dy;

    for (let i = 1; i < endIdx; i++) {
      const p = points[i];
      let dist = 0;

      if (lineLenSq === 0) {
        dist = Math.hypot(p.x - p1.x, p.y - p1.y);
      } else {
        const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lineLenSq));
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        dist = Math.hypot(p.x - projX, p.y - projY);
      }

      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.simplifyRDP(points.slice(0, maxIdx + 1), epsilon);
      const right = this.simplifyRDP(points.slice(maxIdx), epsilon);
      return left.slice(0, -1).concat(right);
    } else {
      return [p1, p2];
    }
  }

  /**
   * Converts simplified points to smooth cubic Bezier path string.
   * Uses Catmull-Rom spline formulation converted to Cubic Bezier control points.
   */
  static pointsToBezierPath(points, isClosed) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    if (points.length === 2) {
      return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
    }

    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    const n = points.length;

    for (let i = 0; i < n - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[0];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = (i + 2 < n) ? points[i + 2] : (isClosed ? points[(i + 2) % n] : p2);

      // Catmull-Rom to Cubic Bezier conversion factor: tension / 3 = 1/6
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    if (isClosed) {
      d += ' Z';
    }

    return d;
  }

  /**
   * Polyline path generator
   */
  static pointsToPolylinePath(points, isClosed) {
    if (points.length === 0) return '';
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
    }
    if (isClosed) d += ' Z';
    return d;
  }

  /**
   * Classifies vector paths into semantic layers:
   * - hair
   * - eyes
   * - nose
   * - mouth
   * - face (jaw/ears)
   * - torso (neck/shoulders/clothing)
   */
  static classifyLayers(paths, imgW, imgH) {
    const centerX = imgW * 0.5;
    const centerY = imgH * 0.5;

    for (const p of paths) {
      const { bbox, centroid } = p;
      const normY = centroid.y / imgH;
      const normX = centroid.x / imgW;
      const relDistFromCenter = Math.abs(normX - 0.5);

      // High arches or upper third strokes -> Hair
      if (normY < 0.28) {
        p.layerId = 'hair';
      }
      // Eyes & Brows region: normY roughly between 0.28 and 0.48
      else if (normY >= 0.28 && normY < 0.48 && bbox.width < imgW * 0.45 && bbox.height < imgH * 0.3) {
        p.layerId = 'eyes';
      }
      // Nose region: normY between 0.45 and 0.65 and centered horizontally
      else if (normY >= 0.45 && normY < 0.65 && relDistFromCenter < 0.2 && bbox.width < imgW * 0.25) {
        p.layerId = 'nose';
      }
      // Mouth region: normY between 0.63 and 0.78 and centered horizontally
      else if (normY >= 0.63 && normY < 0.78 && relDistFromCenter < 0.25 && bbox.height < imgH * 0.2) {
        p.layerId = 'mouth';
      }
      // Lower body / clothing: normY >= 0.78
      else if (normY >= 0.78) {
        p.layerId = 'torso';
      }
      // Outer peripheral strokes that arch around: hair or face contour
      else if (relDistFromCenter > 0.35 || normY < 0.35) {
        p.layerId = 'hair';
      }
      // Everything else in the central region is face/jaw
      else {
        p.layerId = 'face';
      }
    }
  }
}
