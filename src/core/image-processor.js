/**
 * Image Processing Engine
 * High-performance canvas filters for extracting clean line art from portrait photos.
 * Implements XDoG (Extended Difference of Gaussians), Canny/Sobel, Adaptive Sketch, and Morphological Cleanup.
 */

export class ImageProcessor {
  /**
   * Resizes an image or canvas maintaining aspect ratio to fit within maxDimension.
   */
  static resizeToFit(imageSource, maxDimension = 800) {
    const origW = imageSource.naturalWidth || imageSource.width || imageSource.videoWidth;
    const origH = imageSource.naturalHeight || imageSource.height || imageSource.videoHeight;

    let targetW = origW;
    let targetH = origH;

    if (origW > maxDimension || origH > maxDimension) {
      if (origW >= origH) {
        targetW = maxDimension;
        targetH = Math.round((origH * maxDimension) / origW);
      } else {
        targetH = maxDimension;
        targetW = Math.round((origW * maxDimension) / origH);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imageSource, 0, 0, targetW, targetH);

    return {
      canvas,
      ctx,
      width: targetW,
      height: targetH,
      imageData: ctx.getImageData(0, 0, targetW, targetH)
    };
  }

  /**
   * Converts ImageData to 1-channel grayscale float array [0..1].
   */
  static toGrayscaleFloat(imageData) {
    const { data, width, height } = imageData;
    const gray = new Float32Array(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      // Rec. 709 luminance
      gray[j] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255.0;
    }
    return gray;
  }

  /**
   * Creates a 1D normalized Gaussian kernel.
   */
  static makeGaussianKernel(sigma) {
    if (sigma <= 0.05) return new Float32Array([1.0]);
    const radius = Math.ceil(sigma * 3);
    const size = 2 * radius + 1;
    const kernel = new Float32Array(size);
    const twoSigmaSq = 2 * sigma * sigma;
    const norm = 1 / (Math.sqrt(2 * Math.PI) * sigma);

    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const v = norm * Math.exp(-(i * i) / twoSigmaSq);
      kernel[i + radius] = v;
      sum += v;
    }
    // Normalize kernel
    for (let i = 0; i < size; i++) {
      kernel[i] /= sum;
    }
    return kernel;
  }

  /**
   * Fast separable Gaussian blur on Float32Array [0..1]
   */
  static gaussianBlur(src, width, height, sigma) {
    if (sigma <= 0.1) return new Float32Array(src);

    const kernel = this.makeGaussianKernel(sigma);
    const radius = Math.floor(kernel.length / 2);
    const temp = new Float32Array(width * height);
    const dst = new Float32Array(width * height);

    // Horizontal pass (clamped taps only near the left/right edges)
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        let acc = 0;
        if (x >= radius && x < width - radius) {
          const base = rowOffset + x - radius;
          for (let k = 0; k < kernel.length; k++) acc += src[base + k] * kernel[k];
        } else {
          for (let k = -radius; k <= radius; k++) {
            const px = Math.min(Math.max(x + k, 0), width - 1);
            acc += src[rowOffset + px] * kernel[k + radius];
          }
        }
        temp[rowOffset + x] = acc;
      }
    }

    // Vertical pass, row-major so memory access stays sequential
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let k = -radius; k <= radius; k++) {
        const py = Math.min(Math.max(y + k, 0), height - 1) * width;
        const w = kernel[k + radius];
        for (let x = 0; x < width; x++) dst[rowOffset + x] += temp[py + x] * w;
      }
    }

    return dst;
  }

  /**
   * Extended Difference of Gaussians (XDoG)
   * Formula: D(x, y) = (1 + p) * G_sigma1(x, y) - p * G_sigma2(x, y)
   * T(D) = 1 if D >= epsilon, else 1 + tanh(phi * (D - epsilon))
   * Produces pristine hand-drawn manga/comic line art from portrait photographs.
   */
  static xdog(gray, width, height, options = {}, cache = null) {
    const {
      sigma = 1.0,           // Base scale
      k = 1.6,               // Scale multiplier for secondary Gaussian
      p = 25.0,              // Edge sharpening / weighting parameter (gamma)
      epsilon = 0.72,        // Threshold cutoff
      phi = 12.0,            // Soft threshold transition steepness
      invert = false         // Invert lines (true: white on black, false: black on white)
    } = options;

    // Blurs only depend on sigma/k, so slider changes to p / epsilon reuse them
    const key = `xdog:${sigma}:${k}`;
    if (!cache || cache.key !== key) {
      const g1 = this.gaussianBlur(gray, width, height, sigma);
      const g2 = this.gaussianBlur(gray, width, height, sigma * k);
      if (cache) Object.assign(cache, { key, g1, g2 });
      else cache = { g1, g2 };
    }
    const { g1, g2 } = cache;

    const len = width * height;
    const output = new Uint8Array(len); // 0 = black line, 255 = white background

    for (let i = 0; i < len; i++) {
      // Difference of Gaussians with gamma weight
      const diff = (1.0 + p) * g1[i] - p * g2[i];

      let val;
      if (diff >= epsilon) {
        val = 1.0;
      } else {
        val = 1.0 + Math.tanh(phi * (diff - epsilon));
      }

      // Clamp [0..1]
      val = Math.max(0.0, Math.min(1.0, val));

      // Binarize: only fully saturated responses count as line pixels
      const isLine = val < 1 / 510;
      output[i] = isLine !== invert ? 0 : 255;
    }

    return output;
  }

  /**
   * Canny / Sobel Edge Detector
   */
  static cannyEdge(gray, width, height, options = {}, cache = null) {
    const {
      sigma = 1.2,
      lowThreshold = 0.08,
      highThreshold = 0.22,
      invert = false
    } = options;

    const key = `canny:${sigma}`;
    let nms;
    if (cache && cache.key === key) {
      nms = cache.nms;
    } else {
      nms = this.cannyNms(gray, width, height, sigma);
      if (cache) Object.assign(cache, { key, nms });
    }
    return this.cannyHysteresis(nms, width, height, lowThreshold, highThreshold, invert);
  }

  /** Gaussian smoothing + Sobel gradients + non-maximum suppression. */
  static cannyNms(gray, width, height, sigma) {
    const smooth = this.gaussianBlur(gray, width, height, sigma);
    const gradX = new Float32Array(width * height);
    const gradY = new Float32Array(width * height);
    const magnitude = new Float32Array(width * height);
    const direction = new Float32Array(width * height);

    // Sobel kernels
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gx =
          -smooth[(y - 1) * width + (x - 1)] + smooth[(y - 1) * width + (x + 1)] +
          -2 * smooth[y * width + (x - 1)] + 2 * smooth[y * width + (x + 1)] +
          -smooth[(y + 1) * width + (x - 1)] + smooth[(y + 1) * width + (x + 1)];

        const gy =
          -smooth[(y - 1) * width + (x - 1)] - 2 * smooth[(y - 1) * width + x] - smooth[(y - 1) * width + (x + 1)] +
          smooth[(y + 1) * width + (x - 1)] + 2 * smooth[(y + 1) * width + x] + smooth[(y + 1) * width + (x + 1)];

        gradX[idx] = gx;
        gradY[idx] = gy;
        magnitude[idx] = Math.hypot(gx, gy);
        direction[idx] = Math.atan2(gy, gx);
      }
    }

    // Non-maximum suppression
    const nms = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const mag = magnitude[idx];
        let angle = direction[idx] * (180 / Math.PI);
        if (angle < 0) angle += 180;

        let q = 0, r = 0;
        if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle <= 180)) {
          q = magnitude[y * width + (x + 1)];
          r = magnitude[y * width + (x - 1)];
        } else if (angle >= 22.5 && angle < 67.5) {
          q = magnitude[(y + 1) * width + (x - 1)];
          r = magnitude[(y - 1) * width + (x + 1)];
        } else if (angle >= 67.5 && angle < 112.5) {
          q = magnitude[(y + 1) * width + x];
          r = magnitude[(y - 1) * width + x];
        } else if (angle >= 112.5 && angle < 157.5) {
          q = magnitude[(y - 1) * width + (x - 1)];
          r = magnitude[(y + 1) * width + (x + 1)];
        }

        if (mag >= q && mag >= r) {
          nms[idx] = mag;
        } else {
          nms[idx] = 0;
        }
      }
    }

    return nms;
  }

  static cannyHysteresis(nms, width, height, lowThreshold, highThreshold, invert) {
    // Hysteresis thresholding
    const output = new Uint8Array(width * height);
    // Initialize with 255 (white background)
    output.fill(255);

    const strong = 1;
    const weak = 2;
    const edgeType = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      if (nms[i] >= highThreshold) {
        edgeType[i] = strong;
      } else if (nms[i] >= lowThreshold) {
        edgeType[i] = weak;
      }
    }

    // Edge tracking by hysteresis
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (edgeType[idx] === strong) {
          output[idx] = 0; // Black line
        } else if (edgeType[idx] === weak) {
          // Check 8-connected neighbors for strong edge
          let hasStrong = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (edgeType[(y + dy) * width + (x + dx)] === strong) {
                hasStrong = true;
                break;
              }
            }
            if (hasStrong) break;
          }
          if (hasStrong) {
            output[idx] = 0; // Black line
          }
        }
      }
    }

    if (invert) {
      for (let i = 0; i < output.length; i++) {
        output[i] = 255 - output[i];
      }
    }

    return output;
  }

  /**
   * Adaptive Pencil Sketch Filter (Local thresholding + crosshatch look)
   */
  static pencilSketch(gray, width, height, options = {}, cache = null) {
    const {
      windowSize = 9,
      offset = 0.04,
      invert = false
    } = options;

    const key = `pencil:${windowSize}`;
    let blur;
    if (cache && cache.key === key) {
      blur = cache.blur;
    } else {
      blur = this.gaussianBlur(gray, width, height, windowSize / 3);
      if (cache) Object.assign(cache, { key, blur });
    }
    const output = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      const isLine = gray[i] < (blur[i] - offset);
      output[i] = isLine ? 0 : 255;
    }

    if (invert) {
      for (let i = 0; i < output.length; i++) {
        output[i] = 255 - output[i];
      }
    }

    return output;
  }

  /**
   * Morphological cleanup: remove small speckle islands and noise dots.
   * Cleans isolated black dots smaller than minArea.
   */
  static cleanSpeckles(binaryMap, width, height, minArea = 8) {
    const len = width * height;
    const visited = new Uint8Array(len);
    const cleaned = new Uint8Array(binaryMap);

    // Queue for BFS
    const queue = new Int32Array(len);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        // 0 is black (line/foreground)
        if (cleaned[idx] === 0 && !visited[idx]) {
          let head = 0;
          let tail = 0;
          queue[tail++] = idx;
          visited[idx] = 1;

          const component = [idx];

          while (head < tail) {
            const curr = queue[head++];
            const cx = curr % width;
            const cy = Math.floor(curr / width);

            // 4-neighborhood
            const neighbors = [
              cx > 0 ? curr - 1 : -1,
              cx < width - 1 ? curr + 1 : -1,
              cy > 0 ? curr - width : -1,
              cy < height - 1 ? curr + width : -1
            ];

            for (const n of neighbors) {
              if (n !== -1 && cleaned[n] === 0 && !visited[n]) {
                visited[n] = 1;
                queue[tail++] = n;
                component.push(n);
              }
            }
          }

          // If component is smaller than minArea, erase it to white (255)
          if (component.length < minArea) {
            for (let c = 0; c < component.length; c++) {
              cleaned[component[c]] = 255;
            }
          }
        }
      }
    }

    return cleaned;
  }

  /**
   * Morphological Dilation (expands dark lines)
   */
  static dilateLines(binaryMap, width, height, radius = 1) {
    if (radius <= 0) return binaryMap;
    const output = new Uint8Array(binaryMap);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (binaryMap[y * width + x] === 0) {
          for (let dy = -radius; dy <= radius; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              output[ny * width + nx] = 0;
            }
          }
        }
      }
    }
    return output;
  }

  /**
   * Morphological Erosion (thins dark lines)
   */
  static erodeLines(binaryMap, width, height, radius = 1) {
    if (radius <= 0) return binaryMap;
    const output = new Uint8Array(width * height);
    output.fill(255);

    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        let allDark = true;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (binaryMap[(y + dy) * width + (x + dx)] !== 0) {
              allDark = false;
              break;
            }
          }
          if (!allDark) break;
        }
        if (allDark) {
          output[y * width + x] = 0;
        }
      }
    }
    return output;
  }

  /**
   * Converts a binary mask (0 = black, 255 = white) to an ImageData for rendering onto canvas.
   */
  static binaryToImageData(binaryMap, width, height, strokeColor = [20, 20, 20], bgColor = [255, 255, 255, 255]) {
    const imgData = new ImageData(width, height);
    const { data } = imgData;

    for (let i = 0, j = 0; i < binaryMap.length; i++, j += 4) {
      if (binaryMap[i] === 0) {
        // Line stroke
        data[j] = strokeColor[0];
        data[j + 1] = strokeColor[1];
        data[j + 2] = strokeColor[2];
        data[j + 3] = 255;
      } else {
        // Background
        data[j] = bgColor[0];
        data[j + 1] = bgColor[1];
        data[j + 2] = bgColor[2];
        data[j + 3] = bgColor[3] !== undefined ? bgColor[3] : 255;
      }
    }

    return imgData;
  }
}
