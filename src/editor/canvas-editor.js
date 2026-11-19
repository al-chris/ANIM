/**
 * Canvas & SVG Vector Editor
 * Provides interactive viewport navigation (Pan/Zoom/Split), stroke selection & transformation,
 * freehand brush drawing, vertex/node editing, eraser, layer pivot placement, and undo/redo.
 */

import { Vectorizer } from '../core/vectorizer.js';

export class CanvasEditor {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.layerManager = options.layerManager;
    this.historyManager = options.historyManager;

    // Dimensions
    this.width = 800;
    this.height = 800;

    // Viewport transform
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    // View display modes: 'vector', 'overlay', 'split', 'raster' (underlay only, used for the edge preview)
    this.viewMode = 'overlay';
    this.overlayOpacity = 0.35;
    this.splitPos = 0.5; // Split ratio 0..1

    // Data
    this.paths = [];
    this.selectedPathIds = new Set();
    this.sourceImage = null; // HTMLImageElement or Canvas for underlay

    // Active tool: 'select', 'brush', 'eraser', 'node', 'pivot', 'pan'
    this.activeTool = 'select';
    // When false (outside the Vector Studio step) the canvas only pans & zooms
    this.interactive = true;
    this.spaceHeld = false;

    // Brush settings
    this.brushWidth = 3;
    this.brushColor = '#0f172a';
    this.brushSmoothing = 2.0;

    // State tracking
    this.isMouseDown = false;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.currentStrokePoints = [];
    this.activeTransform = null; // { type: 'move'|'scale'|'rotate', startX, startY, origPaths }
    this.activeNodeDrag = null;  // { pathId, pointIndex, startX, startY }

    this.listeners = new Set();

    this.setupDOM();
    this.bindEvents();
    this.render();
  }

  setupDOM() {
    this.container.classList.add('canvas-editor-container');
    this.container.innerHTML = `
      <div class="editor-viewport" tabindex="0">
        <div class="canvas-world">
          <canvas class="underlay-canvas"></canvas>
          <svg class="vector-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#38bdf8" flood-opacity="0.8"/>
              </filter>
            </defs>
            <g class="layers-root"></g>
            <g class="gizmo-root"></g>
          </svg>
          <div class="split-divider" style="display: none;">
            <div class="split-handle"></div>
          </div>
        </div>
      </div>
    `;

    this.viewport = this.container.querySelector('.editor-viewport');
    this.world = this.container.querySelector('.canvas-world');
    this.underlayCanvas = this.container.querySelector('.underlay-canvas');
    this.underlayCtx = this.underlayCanvas.getContext('2d');
    this.svg = this.container.querySelector('.vector-svg');
    this.layersRoot = this.container.querySelector('.layers-root');
    this.gizmoRoot = this.container.querySelector('.gizmo-root');
    this.splitDivider = this.container.querySelector('.split-divider');

    this.updateDimensions(this.width, this.height);

    // Keep the artwork fitted while the layout settles or the window resizes,
    // until the user zooms or pans manually
    this.userAdjustedView = false;
    new ResizeObserver(() => {
      if (!this.userAdjustedView) this.centerViewport();
    }).observe(this.viewport);
  }

  updateDimensions(w, h) {
    this.width = w;
    this.height = h;
    this.world.style.width = `${w}px`;
    this.world.style.height = `${h}px`;
    this.underlayCanvas.width = w;
    this.underlayCanvas.height = h;
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.centerViewport();
  }

  centerViewport() {
    this.userAdjustedView = false;
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width && rect.height) {
      const padding = 40;
      const fitZoom = Math.min(
        (rect.width - padding * 2) / this.width,
        (rect.height - padding * 2) / this.height,
        1.2
      );
      this.zoom = Math.max(0.2, fitZoom);
      this.panX = (rect.width - this.width * this.zoom) / 2;
      this.panY = (rect.height - this.height * this.zoom) / 2;
      this.applyTransform();
    }
  }

  applyTransform() {
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.notifyView();
  }

  setSourceImage(imgOrCanvas) {
    this.sourceImage = imgOrCanvas;
    this.drawUnderlay();
  }

  drawUnderlay() {
    if (!this.underlayCtx) return;
    this.underlayCtx.clearRect(0, 0, this.width, this.height);

    this.svg.style.visibility = this.viewMode === 'raster' ? 'hidden' : 'visible';
    this.svg.style.clipPath = 'none';
    this.underlayCanvas.style.clipPath = 'none';
    this.splitDivider.style.display = 'none';

    if (!this.sourceImage || this.viewMode === 'vector') {
      this.underlayCanvas.style.display = 'none';
      return;
    }

    this.underlayCanvas.style.display = 'block';

    if (this.viewMode === 'raster') {
      this.underlayCanvas.style.opacity = 1.0;
      this.underlayCtx.drawImage(this.sourceImage, 0, 0, this.width, this.height);
    } else if (this.viewMode === 'overlay') {
      this.underlayCanvas.style.opacity = this.overlayOpacity;
      this.underlayCtx.drawImage(this.sourceImage, 0, 0, this.width, this.height);
      this.splitDivider.style.display = 'none';
      this.svg.style.clipPath = 'none';
      this.underlayCanvas.style.clipPath = 'none';
    } else if (this.viewMode === 'split') {
      this.underlayCanvas.style.opacity = 1.0;
      this.underlayCtx.drawImage(this.sourceImage, 0, 0, this.width, this.height);
      this.splitDivider.style.display = 'block';
      const splitPx = this.width * this.splitPos;
      this.splitDivider.style.left = `${splitPx}px`;

      // Photo on left, SVG on right
      this.underlayCanvas.style.clipPath = `polygon(0 0, ${splitPx}px 0, ${splitPx}px 100%, 0 100%)`;
      this.svg.style.clipPath = `polygon(${splitPx}px 0, 100% 0, 100% 100%, ${splitPx}px 100%)`;
    }
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.drawUnderlay();
  }

  setInteractive(interactive) {
    this.interactive = interactive;
    // Selection boxes, nodes and pivot crosshairs only make sense while editing
    this.gizmoRoot.style.display = interactive ? '' : 'none';
    if (!interactive) {
      this.cancelActiveGesture();
      this.clearSelection();
      this.viewport.style.cursor = 'grab';
    } else {
      this.setTool(this.activeTool);
    }
  }

  cancelActiveGesture() {
    if (this.previewStrokePath) {
      this.previewStrokePath.remove();
      this.previewStrokePath = null;
    }
    this.isMouseDown = false;
    this.activeTransform = null;
    this.activeNodeDrag = null;
  }

  /** Paths on hidden or locked layers can't be picked or edited. */
  isPathEditable(p) {
    const layer = this.layerManager?.getLayer(p.layerId);
    return !layer || (layer.visible && !layer.locked);
  }

  setOverlayOpacity(val) {
    this.overlayOpacity = val;
    this.drawUnderlay();
  }

  setSplitPos(pos) {
    this.splitPos = Math.max(0.05, Math.min(0.95, pos));
    this.drawUnderlay();
  }

  setTool(tool) {
    this.activeTool = tool;
    this.viewport.style.cursor =
      tool === 'pan' ? 'grab' :
      tool === 'brush' ? 'crosshair' :
      tool === 'eraser' ? 'cell' :
      tool === 'node' ? 'pointer' :
      tool === 'pivot' ? 'crosshair' : 'default';
    this.renderGizmos();
    this.notifySelection();
  }

  setPaths(newPaths) {
    this.paths = newPaths;
    this.selectedPathIds.clear();
    this.render();
    this.notifySelection();
  }

  addPath(pathObj) {
    this.paths.push(pathObj);
    this.render();
    this.notifySelection();
  }

  removePaths(pathIds) {
    const idSet = new Set(pathIds);
    const removed = this.paths.filter(p => idSet.has(p.id));
    this.paths = this.paths.filter(p => !idSet.has(p.id));
    pathIds.forEach(id => this.selectedPathIds.delete(id));
    this.render();
    this.notifySelection();
    return removed;
  }

  selectPath(id, multi = false) {
    if (!multi) {
      this.selectedPathIds.clear();
    }
    if (this.selectedPathIds.has(id)) {
      this.selectedPathIds.delete(id);
    } else {
      this.selectedPathIds.add(id);
    }
    this.renderGizmos();
    this.notifySelection();
  }

  selectAll() {
    this.selectedPathIds = new Set(this.paths.map(p => p.id));
    this.renderGizmos();
    this.notifySelection();
  }

  clearSelection() {
    this.selectedPathIds.clear();
    this.renderGizmos();
    this.notifySelection();
  }

  getSelectedPaths() {
    return this.paths.filter(p => this.selectedPathIds.has(p.id));
  }

  // Convert client viewport coordinates to SVG world coordinates
  screenToWorld(clientX, clientY) {
    const rect = this.viewport.getBoundingClientRect();
    const vx = clientX - rect.left - this.panX;
    const vy = clientY - rect.top - this.panY;
    return {
      x: vx / this.zoom,
      y: vy / this.zoom
    };
  }

  bindEvents() {
    // Zoom with wheel
    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.max(0.15, Math.min(8.0, this.zoom * delta));

      // Zoom towards mouse pointer
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this.userAdjustedView = true;

      this.applyTransform();
    }, { passive: false });

    // Pointer events
    this.viewport.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));

    // Editing shortcuts (undo, delete, duplicate...) are handled globally by the app

    // Hold Space to pan with the left mouse button
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || this.spaceHeld) return;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
      this.spaceHeld = true;
      if (!this.isPanning) this.viewport.style.cursor = 'grab';
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'Space') return;
      this.spaceHeld = false;
      if (!this.isPanning) {
        if (this.interactive) this.setTool(this.activeTool);
        else this.viewport.style.cursor = 'grab';
      }
    });

    // Handle Split divider dragging
    this.splitDivider.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const onMove = (me) => {
        const rect = this.world.getBoundingClientRect();
        const ratio = (me.clientX - rect.left) / (rect.width || 1);
        this.setSplitPos(ratio);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  onPointerDown(e) {
    // Middle mouse, held Space, Pan tool, or any drag outside the studio step = pan
    if (e.button === 1 || this.spaceHeld || this.activeTool === 'pan' || (!this.interactive && e.button === 0)) {
      e.preventDefault();
      this.isPanning = true;
      this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
      this.viewport.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return; // Only left click

    this.isMouseDown = true;
    const worldPos = this.screenToWorld(e.clientX, e.clientY);

    if (this.activeTool === 'brush') {
      this.startBrushStroke(worldPos);
    } else if (this.activeTool === 'eraser') {
      this.startEraser(worldPos);
    } else if (this.activeTool === 'pivot') {
      this.setPivotAt(worldPos);
    } else if (this.activeTool === 'node') {
      this.checkNodeClick(worldPos);
    } else if (this.activeTool === 'select') {
      this.checkSelectionClick(worldPos, e.shiftKey);
    }
  }

  onPointerMove(e) {
    if (this.isPanning) {
      this.panX = e.clientX - this.panStart.x;
      this.panY = e.clientY - this.panStart.y;
      this.userAdjustedView = true;
      this.applyTransform();
      return;
    }

    if (!this.isMouseDown) return;

    const worldPos = this.screenToWorld(e.clientX, e.clientY);

    if (this.activeTool === 'brush') {
      this.continueBrushStroke(worldPos);
    } else if (this.activeTool === 'eraser') {
      this.continueEraser(worldPos);
    } else if (this.activeTool === 'select' && this.activeTransform) {
      this.updateTransform(worldPos);
    } else if (this.activeTool === 'node' && this.activeNodeDrag) {
      this.updateNodeDrag(worldPos);
    }
  }

  onPointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      if (this.spaceHeld || !this.interactive) this.viewport.style.cursor = 'grab';
      else this.setTool(this.activeTool);
      return;
    }

    if (!this.isMouseDown) return;
    this.isMouseDown = false;

    if (this.activeTool === 'brush') {
      this.finishBrushStroke();
    } else if (this.activeTool === 'eraser') {
      this.finishEraser();
    } else if (this.activeTool === 'select' && this.activeTransform) {
      this.finishTransform();
    } else if (this.activeTool === 'node' && this.activeNodeDrag) {
      this.finishNodeDrag();
    }
  }

  // --- Brush Drawing ---
  startBrushStroke(pt) {
    this.currentStrokePoints = [pt];
    this.previewStrokePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.previewStrokePath.setAttribute('fill', 'none');
    this.previewStrokePath.setAttribute('stroke', this.brushColor);
    this.previewStrokePath.setAttribute('stroke-width', this.brushWidth);
    this.previewStrokePath.setAttribute('stroke-linecap', 'round');
    this.previewStrokePath.setAttribute('stroke-linejoin', 'round');
    this.previewStrokePath.setAttribute('d', `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`);
    this.gizmoRoot.appendChild(this.previewStrokePath);
  }

  continueBrushStroke(pt) {
    const last = this.currentStrokePoints[this.currentStrokePoints.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 2) {
      this.currentStrokePoints.push(pt);
      const d = Vectorizer.pointsToBezierPath(this.currentStrokePoints, false);
      if (this.previewStrokePath) {
        this.previewStrokePath.setAttribute('d', d);
      }
    }
  }

  finishBrushStroke() {
    if (this.previewStrokePath) {
      this.previewStrokePath.remove();
      this.previewStrokePath = null;
    }

    if (this.currentStrokePoints.length < 2) return;

    const targetLayer = this.layerManager?.getActiveLayer();
    if (targetLayer && (targetLayer.locked || !targetLayer.visible)) {
      this.currentStrokePoints = [];
      this.notifyWarning(`Layer "${targetLayer.name}" is locked or hidden. Pick another layer to draw on.`);
      return;
    }

    // Simplify points
    const simplified = Vectorizer.simplifyRDP(this.currentStrokePoints, this.brushSmoothing);
    if (simplified.length < 2) return;

    const d = Vectorizer.pointsToBezierPath(simplified, false);
    let totalLen = 0;
    for (let i = 0; i < simplified.length - 1; i++) {
      totalLen += Math.hypot(simplified[i + 1].x - simplified[i].x, simplified[i + 1].y - simplified[i].y);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of simplified) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const activeLayer = this.layerManager?.getActiveLayer();
    const newPath = {
      id: `brush_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      d,
      points: simplified,
      isClosed: false,
      length: Math.round(totalLen * 10) / 10,
      strokeWidth: this.brushWidth,
      strokeColor: this.brushColor,
      strokeCap: 'round',
      strokeJoin: 'round',
      opacity: 1,
      layerId: activeLayer ? activeLayer.id : 'custom',
      bbox: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
      centroid: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
    };

    this.paths.push(newPath);
    this.render();

    // Register undo
    this.historyManager?.push({
      undo: () => {
        this.paths = this.paths.filter(p => p.id !== newPath.id);
        this.render();
      },
      redo: () => {
        this.paths.push(newPath);
        this.render();
      },
      description: 'Draw brush stroke'
    });

    this.currentStrokePoints = [];
    this.notifySelection();
  }

  // --- Eraser ---
  startEraser(pt) {
    this.eraserGesture = `erase_${Date.now()}`;
    this.eraseAt(pt);
  }

  continueEraser(pt) {
    this.eraseAt(pt);
  }

  finishEraser() {}

  eraseAt(pt, radius = 12) {
    // Find strokes intersecting with radius
    const toDelete = [];
    for (const p of this.paths) {
      if (!this.isPathEditable(p)) continue;
      for (const v of p.points) {
        if (Math.hypot(v.x - pt.x, v.y - pt.y) <= radius) {
          toDelete.push(p.id);
          break;
        }
      }
    }

    if (toDelete.length > 0) {
      const deletedPaths = this.removePaths(toDelete);
      // One undo step per eraser drag
      const top = this.historyManager?.peek();
      if (top && top.mergeKey === this.eraserGesture) {
        top.deletedPaths.push(...deletedPaths);
        top.description = `Erase ${top.deletedPaths.length} stroke(s)`;
        return;
      }
      const action = {
        mergeKey: this.eraserGesture,
        deletedPaths,
        undo: () => {
          this.paths.push(...action.deletedPaths);
          this.render();
        },
        redo: () => {
          this.removePaths(action.deletedPaths.map(p => p.id));
        },
        description: `Erase ${deletedPaths.length} stroke(s)`
      };
      this.historyManager?.push(action);
    }
  }

  // --- Rigging Pivot Tool ---
  setPivotAt(pt) {
    const activeLayer = this.layerManager?.getActiveLayer();
    if (!activeLayer) return;

    const normX = Math.max(0, Math.min(1, pt.x / this.width));
    const normY = Math.max(0, Math.min(1, pt.y / this.height));

    const oldPivot = { ...activeLayer.pivot };
    activeLayer.pivot = { x: normX, y: normY };
    this.layerManager.notify();
    this.renderGizmos();

    this.historyManager?.push({
      undo: () => {
        activeLayer.pivot = oldPivot;
        this.layerManager.notify();
        this.renderGizmos();
      },
      redo: () => {
        activeLayer.pivot = { x: normX, y: normY };
        this.layerManager.notify();
        this.renderGizmos();
      },
      description: `Set pivot for ${activeLayer.name}`
    });
  }

  // --- Selection & Transformation ---
  checkSelectionClick(pt, isShift) {
    // Check if clicked inside existing selection bounding box or handles
    if (this.selectedPathIds.size > 0 && this.currentBBox) {
      const b = this.currentBBox;
      const handleRadius = 8 / this.zoom;

      // Check rotation handle (top center + 25px)
      const rotY = b.minY - 25 / this.zoom;
      const rotX = (b.minX + b.maxX) / 2;
      if (Math.hypot(pt.x - rotX, pt.y - rotY) <= handleRadius) {
        this.startTransform('rotate', pt);
        return;
      }

      // Check corner handles
      const corners = [
        { type: 'scale-nw', x: b.minX, y: b.minY },
        { type: 'scale-ne', x: b.maxX, y: b.minY },
        { type: 'scale-se', x: b.maxX, y: b.maxY },
        { type: 'scale-sw', x: b.minX, y: b.maxY }
      ];

      for (const c of corners) {
        if (Math.hypot(pt.x - c.x, pt.y - c.y) <= handleRadius) {
          this.startTransform(c.type, pt);
          return;
        }
      }

      // Check inside bounding box -> Move
      if (pt.x >= b.minX && pt.x <= b.maxX && pt.y >= b.minY && pt.y <= b.maxY) {
        this.startTransform('move', pt);
        return;
      }
    }

    // Clicked a stroke
    const hit = this.hitTestPath(pt, 8 / this.zoom);
    if (hit) {
      this.selectPath(hit.id, isShift);
      if (this.selectedPathIds.has(hit.id)) {
        this.startTransform('move', pt);
      }
    } else {
      if (!isShift) {
        this.clearSelection();
      }
    }
  }

  hitTestPath(pt, threshold = 6) {
    for (let i = this.paths.length - 1; i >= 0; i--) {
      const p = this.paths[i];
      if (!this.isPathEditable(p)) continue;
      // Quick bbox rejection
      const b = p.bbox;
      if (pt.x < b.minX - threshold || pt.x > b.maxX + threshold ||
          pt.y < b.minY - threshold || pt.y > b.maxY + threshold) {
        continue;
      }

      // Polyline segment distance
      for (let j = 0; j < p.points.length - 1; j++) {
        const p1 = p.points[j];
        const p2 = p.points[j + 1];
        const dist = this.distToSegment(pt, p1, p2);
        if (dist <= threshold + (p.strokeWidth / 2)) {
          return p;
        }
      }
    }
    return null;
  }

  distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  startTransform(type, pt) {
    const selected = this.getSelectedPaths();
    if (selected.length === 0) return;

    this.activeTransform = {
      type,
      startPt: { ...pt },
      center: {
        x: (this.currentBBox.minX + this.currentBBox.maxX) / 2,
        y: (this.currentBBox.minY + this.currentBBox.maxY) / 2
      },
      bbox: { ...this.currentBBox },
      origPaths: selected.map(p => ({
        id: p.id,
        points: p.points.map(pt => ({ ...pt })),
        d: p.d,
        bbox: { ...p.bbox },
        centroid: { ...p.centroid }
      }))
    };
  }

  updateTransform(pt) {
    if (!this.activeTransform) return;
    const { type, startPt, center, bbox, origPaths } = this.activeTransform;

    const dx = pt.x - startPt.x;
    const dy = pt.y - startPt.y;

    for (const orig of origPaths) {
      const curr = this.paths.find(p => p.id === orig.id);
      if (!curr) continue;

      if (type === 'move') {
        curr.points = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      } else if (type.startsWith('scale')) {
        const origW = bbox.width || 1;
        const origH = bbox.height || 1;
        let scaleX = 1;
        let scaleY = 1;

        if (type === 'scale-se') {
          scaleX = (origW + dx) / origW;
          scaleY = (origH + dy) / origH;
        } else if (type === 'scale-nw') {
          scaleX = (origW - dx) / origW;
          scaleY = (origH - dy) / origH;
        } else if (type === 'scale-ne') {
          scaleX = (origW + dx) / origW;
          scaleY = (origH - dy) / origH;
        } else if (type === 'scale-sw') {
          scaleX = (origW - dx) / origW;
          scaleY = (origH + dy) / origH;
        }

        curr.points = orig.points.map(p => ({
          x: center.x + (p.x - center.x) * scaleX,
          y: center.y + (p.y - center.y) * scaleY
        }));
      } else if (type === 'rotate') {
        const angleStart = Math.atan2(startPt.y - center.y, startPt.x - center.x);
        const angleCurr = Math.atan2(pt.y - center.y, pt.x - center.x);
        const dAngle = angleCurr - angleStart;
        const cos = Math.cos(dAngle);
        const sin = Math.sin(dAngle);

        curr.points = orig.points.map(p => {
          const rx = p.x - center.x;
          const ry = p.y - center.y;
          return {
            x: center.x + rx * cos - ry * sin,
            y: center.y + rx * sin + ry * cos
          };
        });
      }

      // Recompute d and bounds
      curr.d = Vectorizer.pointsToBezierPath(curr.points, curr.isClosed);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of curr.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      curr.bbox = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
      curr.centroid = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    this.render();
  }

  finishTransform() {
    if (!this.activeTransform) return;
    const { origPaths } = this.activeTransform;
    const endPaths = origPaths.map(orig => {
      const p = this.paths.find(path => path.id === orig.id);
      return {
        id: p.id,
        points: p.points.map(pt => ({ ...pt })),
        d: p.d,
        bbox: { ...p.bbox },
        centroid: { ...p.centroid }
      };
    });

    this.historyManager?.push({
      undo: () => {
        for (const orig of origPaths) {
          const p = this.paths.find(path => path.id === orig.id);
          if (p) {
            p.points = orig.points.map(pt => ({ ...pt }));
            p.d = orig.d;
            p.bbox = { ...orig.bbox };
            p.centroid = { ...orig.centroid };
          }
        }
        this.render();
      },
      redo: () => {
        for (const end of endPaths) {
          const p = this.paths.find(path => path.id === end.id);
          if (p) {
            p.points = end.points.map(pt => ({ ...pt }));
            p.d = end.d;
            p.bbox = { ...end.bbox };
            p.centroid = { ...end.centroid };
          }
        }
        this.render();
      },
      description: 'Transform strokes'
    });

    this.activeTransform = null;
    this.renderGizmos();
  }

  // --- Node / Vertex Tool ---
  checkNodeClick(pt) {
    const selected = this.getSelectedPaths();
    if (selected.length === 0) {
      const hit = this.hitTestPath(pt, 8 / this.zoom);
      if (hit) this.selectPath(hit.id);
      return;
    }

    const hitRadius = 8 / this.zoom;
    for (const p of selected) {
      for (let i = 0; i < p.points.length; i++) {
        const v = p.points[i];
        if (Math.hypot(v.x - pt.x, v.y - pt.y) <= hitRadius) {
          this.activeNodeDrag = {
            pathId: p.id,
            pointIndex: i,
            origPoint: { ...v }
          };
          return;
        }
      }
    }
  }

  updateNodeDrag(pt) {
    if (!this.activeNodeDrag) return;
    const { pathId, pointIndex } = this.activeNodeDrag;
    const p = this.paths.find(path => path.id === pathId);
    if (!p) return;

    p.points[pointIndex] = { x: pt.x, y: pt.y };
    p.d = Vectorizer.pointsToBezierPath(p.points, p.isClosed);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of p.points) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
    p.bbox = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    p.centroid = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

    this.render();
  }

  finishNodeDrag() {
    if (!this.activeNodeDrag) return;
    const { pathId, pointIndex, origPoint } = this.activeNodeDrag;
    const p = this.paths.find(path => path.id === pathId);
    if (!p) return;

    const newPoint = { ...p.points[pointIndex] };
    this.historyManager?.push({
      undo: () => {
        p.points[pointIndex] = { ...origPoint };
        p.d = Vectorizer.pointsToBezierPath(p.points, p.isClosed);
        this.render();
      },
      redo: () => {
        p.points[pointIndex] = { ...newPoint };
        p.d = Vectorizer.pointsToBezierPath(p.points, p.isClosed);
        this.render();
      },
      description: 'Move vertex node'
    });

    this.activeNodeDrag = null;
    this.renderGizmos();
  }

  // --- Operations on Selection ---
  deleteSelected() {
    const selectedIds = Array.from(this.selectedPathIds);
    if (selectedIds.length === 0) return;
    const removed = this.removePaths(selectedIds);

    this.historyManager?.push({
      undo: () => {
        this.paths.push(...removed);
        selectedIds.forEach(id => this.selectedPathIds.add(id));
        this.render();
      },
      redo: () => {
        this.removePaths(selectedIds);
      },
      description: `Delete ${removed.length} stroke(s)`
    });
  }

  duplicateSelected() {
    const selected = this.getSelectedPaths();
    if (selected.length === 0) return;

    const offset = 15;
    const newPaths = selected.map(p => {
      const newPoints = p.points.map(pt => ({ x: pt.x + offset, y: pt.y + offset }));
      const newD = Vectorizer.pointsToBezierPath(newPoints, p.isClosed);
      return {
        ...p,
        id: `path_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        points: newPoints,
        d: newD,
        bbox: {
          minX: p.bbox.minX + offset,
          minY: p.bbox.minY + offset,
          maxX: p.bbox.maxX + offset,
          maxY: p.bbox.maxY + offset,
          width: p.bbox.width,
          height: p.bbox.height
        },
        centroid: { x: p.centroid.x + offset, y: p.centroid.y + offset }
      };
    });

    this.paths.push(...newPaths);
    this.selectedPathIds = new Set(newPaths.map(p => p.id));
    this.render();

    this.historyManager?.push({
      undo: () => {
        const idSet = new Set(newPaths.map(p => p.id));
        this.paths = this.paths.filter(p => !idSet.has(p.id));
        this.clearSelection();
        this.render();
      },
      redo: () => {
        this.paths.push(...newPaths);
        this.selectedPathIds = new Set(newPaths.map(p => p.id));
        this.render();
      },
      description: `Duplicate ${newPaths.length} stroke(s)`
    });
  }

  updateSelectedStyle(styleProps) {
    const selected = this.getSelectedPaths();
    if (selected.length === 0) return;

    // Dragging a slider fires many input events: fold them into one undo step
    const mergeKey = `style:${Object.keys(styleProps).join(',')}:${selected.map(p => p.id).join(',')}`;
    const top = this.historyManager?.peek();
    if (top && top.mergeKey === mergeKey && Date.now() - top.time < 1500) {
      for (const p of selected) Object.assign(p, styleProps);
      top.time = Date.now();
      top.styleProps = { ...styleProps };
      this.render();
      return;
    }

    const prevStyles = selected.map(p => ({
      id: p.id,
      strokeWidth: p.strokeWidth,
      strokeColor: p.strokeColor,
      opacity: p.opacity,
      layerId: p.layerId
    }));

    for (const p of selected) {
      if (styleProps.strokeWidth !== undefined) p.strokeWidth = styleProps.strokeWidth;
      if (styleProps.strokeColor !== undefined) p.strokeColor = styleProps.strokeColor;
      if (styleProps.opacity !== undefined) p.opacity = styleProps.opacity;
      if (styleProps.layerId !== undefined) p.layerId = styleProps.layerId;
    }

    this.render();

    const action = {
      mergeKey,
      time: Date.now(),
      styleProps: { ...styleProps },
      undo: () => {
        for (const prev of prevStyles) {
          const p = this.paths.find(path => path.id === prev.id);
          if (p) {
            p.strokeWidth = prev.strokeWidth;
            p.strokeColor = prev.strokeColor;
            p.opacity = prev.opacity;
            p.layerId = prev.layerId;
          }
        }
        this.render();
      },
      redo: () => {
        for (const p of selected) Object.assign(p, action.styleProps);
        this.render();
      },
      description: 'Update stroke style'
    };
    this.historyManager?.push(action);
  }

  // --- Rendering ---
  render() {
    // Clear layers root
    this.layersRoot.innerHTML = '';

    const layers = this.layerManager ? this.layerManager.layers : [{ id: 'default', visible: true, opacity: 1 }];
    const layerMap = new Map();

    for (const layer of layers) {
      if (!layer.visible) continue;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', `layer-group-${layer.id}`);
      g.setAttribute('opacity', layer.opacity !== undefined ? layer.opacity : 1);
      this.layersRoot.appendChild(g);
      layerMap.set(layer.id, g);
    }

    // Default fallback group for unclassified paths
    const fallbackGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    fallbackGroup.setAttribute('id', 'layer-group-unassigned');
    this.layersRoot.appendChild(fallbackGroup);

    for (const p of this.paths) {
      const group = layerMap.get(p.layerId) || fallbackGroup;
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('id', p.id);
      pathEl.setAttribute('d', p.d);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', p.strokeColor || '#0f172a');
      pathEl.setAttribute('stroke-width', p.strokeWidth || 2);
      pathEl.setAttribute('stroke-linecap', p.strokeCap || 'round');
      pathEl.setAttribute('stroke-linejoin', p.strokeJoin || 'round');
      pathEl.setAttribute('opacity', p.opacity !== undefined ? p.opacity : 1);

      if (this.selectedPathIds.has(p.id)) {
        pathEl.setAttribute('filter', 'url(#glow)');
      }

      group.appendChild(pathEl);
    }

    this.renderGizmos();
  }

  renderGizmos() {
    this.gizmoRoot.innerHTML = '';
    const selected = this.getSelectedPaths();

    // Node tool: render individual vertices as draggable circles
    if (this.activeTool === 'node' && selected.length > 0) {
      const nodeR = 4 / this.zoom;
      for (const p of selected) {
        for (let i = 0; i < p.points.length; i++) {
          const pt = p.points[i];
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', pt.x);
          circle.setAttribute('cy', pt.y);
          circle.setAttribute('r', nodeR);
          circle.setAttribute('fill', '#38bdf8');
          circle.setAttribute('stroke', '#ffffff');
          circle.setAttribute('stroke-width', 1.5 / this.zoom);
          circle.style.cursor = 'move';
          this.gizmoRoot.appendChild(circle);
        }
      }
      return;
    }

    // Selection Bounding Box & Handles
    if (selected.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of selected) {
        if (p.bbox.minX < minX) minX = p.bbox.minX;
        if (p.bbox.minY < minY) minY = p.bbox.minY;
        if (p.bbox.maxX > maxX) maxX = p.bbox.maxX;
        if (p.bbox.maxY > maxY) maxY = p.bbox.maxY;
      }

      this.currentBBox = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };

      // Bounding box rect
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', minX);
      rect.setAttribute('y', minY);
      rect.setAttribute('width', maxX - minX);
      rect.setAttribute('height', maxY - minY);
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', '#38bdf8');
      rect.setAttribute('stroke-width', 1.5 / this.zoom);
      rect.setAttribute('stroke-dasharray', `${4 / this.zoom} ${4 / this.zoom}`);
      rect.setAttribute('pointer-events', 'none');
      this.gizmoRoot.appendChild(rect);

      // Corner handles
      const handleSize = 7 / this.zoom;
      const corners = [
        { x: minX, y: minY, cursor: 'nwse-resize' },
        { x: maxX, y: minY, cursor: 'nesw-resize' },
        { x: maxX, y: maxY, cursor: 'nwse-resize' },
        { x: minX, y: maxY, cursor: 'nesw-resize' }
      ];

      for (const c of corners) {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        handle.setAttribute('x', c.x - handleSize / 2);
        handle.setAttribute('y', c.y - handleSize / 2);
        handle.setAttribute('width', handleSize);
        handle.setAttribute('height', handleSize);
        handle.setAttribute('fill', '#ffffff');
        handle.setAttribute('stroke', '#0284c7');
        handle.setAttribute('stroke-width', 1.5 / this.zoom);
        handle.style.cursor = c.cursor;
        this.gizmoRoot.appendChild(handle);
      }

      // Rotation stem & handle
      const rotY = minY - 24 / this.zoom;
      const rotX = (minX + maxX) / 2;

      const stem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      stem.setAttribute('x1', rotX);
      stem.setAttribute('y1', minY);
      stem.setAttribute('x2', rotX);
      stem.setAttribute('y2', rotY);
      stem.setAttribute('stroke', '#38bdf8');
      stem.setAttribute('stroke-width', 1 / this.zoom);
      this.gizmoRoot.appendChild(stem);

      const rotHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      rotHandle.setAttribute('cx', rotX);
      rotHandle.setAttribute('cy', rotY);
      rotHandle.setAttribute('r', 5 / this.zoom);
      rotHandle.setAttribute('fill', '#38bdf8');
      rotHandle.setAttribute('stroke', '#ffffff');
      rotHandle.setAttribute('stroke-width', 1.5 / this.zoom);
      rotHandle.style.cursor = 'crosshair';
      this.gizmoRoot.appendChild(rotHandle);
    } else {
      this.currentBBox = null;
    }

    // Pivot crosshair only while placing pivots
    const activeLayer = this.layerManager?.getActiveLayer();
    if (activeLayer && this.activeTool === 'pivot') {
      const px = activeLayer.pivot.x * this.width;
      const py = activeLayer.pivot.y * this.height;
      const r = 8 / this.zoom;

      const pivotG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      pivotG.setAttribute('class', 'pivot-crosshair');

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', px);
      circle.setAttribute('cy', py);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', activeLayer.color || '#ec4899');
      circle.setAttribute('stroke-width', 2 / this.zoom);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', px);
      dot.setAttribute('cy', py);
      dot.setAttribute('r', 2.5 / this.zoom);
      dot.setAttribute('fill', activeLayer.color || '#ec4899');

      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', px - r * 1.5);
      l1.setAttribute('y1', py);
      l1.setAttribute('x2', px + r * 1.5);
      l1.setAttribute('y2', py);
      l1.setAttribute('stroke', activeLayer.color || '#ec4899');
      l1.setAttribute('stroke-width', 1.5 / this.zoom);

      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', px);
      l2.setAttribute('y1', py - r * 1.5);
      l2.setAttribute('x2', px);
      l2.setAttribute('y2', py + r * 1.5);
      l2.setAttribute('stroke', activeLayer.color || '#ec4899');
      l2.setAttribute('stroke-width', 1.5 / this.zoom);

      pivotG.appendChild(circle);
      pivotG.appendChild(dot);
      pivotG.appendChild(l1);
      pivotG.appendChild(l2);
      this.gizmoRoot.appendChild(pivotG);
    }
  }

  // --- Notification & Subscription ---
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifySelection() {
    const selected = this.getSelectedPaths();
    for (const cb of this.listeners) {
      cb({
        type: 'selection',
        selectedCount: selected.length,
        selectedPaths: selected,
        tool: this.activeTool
      });
    }
  }

  notifyWarning(message) {
    for (const cb of this.listeners) cb({ type: 'warning', message });
  }

  notifyView() {
    for (const cb of this.listeners) {
      cb({
        type: 'view',
        zoom: this.zoom,
        panX: this.panX,
        panY: this.panY
      });
    }
  }
}
