import initVTracer, { to_svg as traceBitmap } from '../node_modules/vtracer-wasm/vtracer.js';
import { Vectorizer } from './core/vectorizer.js';
import {
  createRevealSvg,
  initializeReveal,
  recordWebM,
  setRevealProgress
} from './animator/pen-sketch.js';
import { createInkReveal, isInkStyle, recordInkWebM } from './animator/ink-reveals.js';

const MAX_DIMENSION = 750;
const UPSCALE = 2;
const DEFAULT_P = 20;
const DEFAULT_PHI = 0.6;
const SVG_NS = 'http://www.w3.org/2000/svg';
const BRUSH_STYLES = {
  calligraphy: { widthScale: 1, maxScale: 2, opacity: 1, cap: 'round', roughness: 0 },
  monoline: { widthScale: 0.75, maxScale: 0.75, opacity: 1, cap: 'round', roughness: 0 },
  marker: { widthScale: 2.2, maxScale: 2.2, opacity: 0.58, cap: 'square', roughness: 0 },
  pencil: { widthScale: 0.48, maxScale: 0.95, opacity: 0.82, cap: 'round', roughness: 0.22 }
};
const BRUSH_ICON_PATHS = {
  calligraphy: 'M20.5 3.5c-4.2.1-7.8 2.1-10.5 5.5L3 16v5h5l7-7c3.4-2.7 5.4-6.3 5.5-10.5zM6 18v-1l5.2-5.2 1 1L7 18H6z',
  monoline: 'M4 20l1.7-5.1L17.2 3.4l3.4 3.4L9.1 18.3 4 20zm4.4-3.4L18 7l-1-1L7.4 15.6l1 1z',
  marker: 'M4 4h10l6 6v6H10l-6-6V4zm3 3v3l4 4h5v-3l-4-4H7zM4 18h16v3H4z',
  pencil: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.42l-2.33-2.33a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z'
};

const elements = {
  engineStatus: document.getElementById('engine-status'),
  imageUpload: document.getElementById('image-upload'),
  uploadLabel: document.getElementById('upload-label'),
  sigma: document.getElementById('sigma'),
  sigmaValue: document.getElementById('sigma-value'),
  epsilon: document.getElementById('epsilon'),
  epsilonValue: document.getElementById('epsilon-value'),
  minArea: document.getElementById('min-area'),
  minAreaValue: document.getElementById('min-area-value'),
  polygon: document.getElementById('polygon'),
  appLayout: document.getElementById('app-layout'),
  controlsDrawer: document.getElementById('controls-drawer'),
  closeDrawer: document.getElementById('close-drawer'),
  openDrawer: document.getElementById('open-drawer'),
  boundaryMode: document.getElementById('boundary-mode'),
  clearBoundary: document.getElementById('clear-boundary'),
  boundaryHelp: document.getElementById('boundary-help'),
  enhanceFaces: document.getElementById('enhance-faces'),
  enableRoi: document.getElementById('enable-roi'),
  emphasizeRois: document.getElementById('emphasize-rois'),
  clearRois: document.getElementById('clear-rois'),
  roiCount: document.getElementById('roi-count'),
  roiStatus: document.getElementById('roi-status'),
  background: document.getElementById('background'),
  traceButton: document.getElementById('trace-button'),
  downloadButton: document.getElementById('download-button'),
  message: document.getElementById('message'),
  dimensions: document.getElementById('dimensions'),
  sourcePreview: document.getElementById('source-preview'),
  sourcePreviewStage: document.getElementById('source-preview-stage'),
  roiCanvas: document.getElementById('roi-canvas'),
  boundaryCanvas: document.getElementById('boundary-canvas'),
  sourceEmpty: document.getElementById('source-empty'),
  resultEmpty: document.getElementById('result-empty'),
  vectorCard: document.getElementById('vector-card'),
  fullscreenToggle: document.getElementById('fullscreen-toggle'),
  traceLabel: document.getElementById('trace-label'),
  uploadCard: document.getElementById('upload-card'),
  stageLoading: document.getElementById('stage-loading'),
  stageLoadingText: document.getElementById('stage-loading-text'),
  stageProgress: document.getElementById('stage-progress'),
  stageProgressBar: document.getElementById('stage-progress-bar'),
  zoomControls: document.getElementById('zoom-controls'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomReset: document.getElementById('zoom-reset'),
  railToast: document.getElementById('rail-toast'),
  railToastUndo: document.getElementById('rail-toast-undo'),
  vectorPreview: document.getElementById('vector-preview'),
  vectorViewport: document.getElementById('vector-viewport'),
  sourceRailToggle: document.getElementById('source-rail-toggle'),
  sourceRailHandle: document.getElementById('source-rail-handle'),
  referenceOverlay: document.getElementById('reference-overlay'),
  drawingCanvas: document.getElementById('drawing-canvas'),
  artworkActions: document.getElementById('artwork-actions'),
  referenceControls: document.getElementById('reference-controls'),
  showReference: document.getElementById('show-reference'),
  referenceOpacity: document.getElementById('reference-opacity'),
  referenceOpacityValue: document.getElementById('reference-opacity-value'),
  referenceUpload: document.getElementById('reference-upload'),
  useSourceReference: document.getElementById('use-source-reference'),
  referenceHelp: document.getElementById('reference-help'),
  workspaceNote: document.getElementById('workspace-note'),
  artworkMessage: document.getElementById('artwork-message'),
  toggleDrawing: document.getElementById('toggle-drawing'),
  brushStyle: document.getElementById('brush-style'),
  brushSize: document.getElementById('brush-size'),
  brushSizeValue: document.getElementById('brush-size-value'),
  brushColor: document.getElementById('brush-color'),
  undoDrawing: document.getElementById('undo-drawing'),
  playAnimation: document.getElementById('play-animation'),
  animationStyle: document.getElementById('animation-style'),
  animationDuration: document.getElementById('animation-duration'),
  animationDurationValue: document.getElementById('animation-duration-value'),
  animationHold: document.getElementById('animation-hold'),
  animationHoldValue: document.getElementById('animation-hold-value'),
  recordWebM: document.getElementById('record-webm'),
  downloadWebM: document.getElementById('download-webm')
};

const state = {
  cv: null,
  faceDetector: null,
  faceDetectorPromise: null,
  image: null,
  svg: null,
  vectorSvg: null,
  mask: null,
  sourceUrl: null,
  webmUrl: null,
  referenceUrl: null,
  referenceUsesCustomImage: false,
  drawerCollapsed: false,
  drawerAutoOpened: false,
  sourceRailCollapsed: false,
  baseCenterlines: null,
  manualRegions: [],
  faceRegions: [],
  currentRoi: null,
  activeRoiEdit: null,
  boundaryPoints: [],
  boundaryClosed: false,
  currentBoundaryStroke: null,
  boundaryDragIndex: -1,
  additions: [],
  reveal: null,
  currentStroke: null,
  drawingMode: false,
  busy: false,
  animationFrameId: null
};

function setMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.classList.toggle('is-error', isError);
}

// Resolves after the browser has had a chance to paint. The timeout covers
// hidden tabs, where requestAnimationFrame never fires.
function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 80);
  });
}

// Loading indicator over the artwork card. `blocking` dims the whole stage
// (used while generating); otherwise it is a small chip that leaves the
// artwork visible (stroke vectorizing, recording). `progress` is 0..1, or
// null for an indeterminate bar, or undefined for no bar.
function setStageLoading(text, { blocking = false, progress } = {}) {
  elements.stageLoading.hidden = false;
  elements.stageLoading.classList.toggle('is-blocking', blocking);
  elements.stageLoadingText.textContent = text;
  const hasBar = progress !== undefined;
  elements.stageProgress.hidden = !hasBar;
  elements.stageProgress.classList.toggle('is-indeterminate', hasBar && progress === null);
  elements.stageProgressBar.style.width = hasBar && progress !== null
    ? `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`
    : '';
}

function clearStageLoading() {
  elements.stageLoading.hidden = true;
}

// ---- Canvas-only zoom & pan (drawing mode) --------------------------------
// The transform lives on the vector viewport, so the page itself never zooms
// or scrolls. Pointer coordinates are read from getBoundingClientRect(), which
// already includes the transform, so drawing stays accurate at any zoom.
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const zoom = {
  scale: 1,
  x: 0,
  y: 0,
  space: false,
  pan: null,
  pinch: null,
  pointers: new Map()
};

function applyZoom() {
  const { scale, x, y } = zoom;
  elements.vectorViewport.style.transform = scale === 1 && x === 0 && y === 0
    ? ''
    : `translate(${x}px, ${y}px) scale(${scale})`;
  elements.zoomReset.textContent = `${Math.round(scale * 100)}%`;
}

function clampZoomPan() {
  if (zoom.scale <= ZOOM_MIN) {
    zoom.x = 0;
    zoom.y = 0;
    return;
  }
  // Always keep a margin of artwork inside the preview.
  const keep = 48;
  const limitX = Math.max(0, (elements.vectorViewport.offsetWidth * zoom.scale
    + elements.vectorPreview.clientWidth) / 2 - keep);
  const limitY = Math.max(0, (elements.vectorViewport.offsetHeight * zoom.scale
    + elements.vectorPreview.clientHeight) / 2 - keep);
  zoom.x = Math.min(limitX, Math.max(-limitX, zoom.x));
  zoom.y = Math.min(limitY, Math.max(-limitY, zoom.y));
}

// Zoom so the artwork point under (clientX, clientY) stays under the cursor.
function zoomAt(nextScale, clientX, clientY) {
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale));
  if (scale === zoom.scale) return;
  const rect = elements.vectorViewport.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2 - zoom.x;
  const centerY = rect.top + rect.height / 2 - zoom.y;
  const ratio = scale / zoom.scale;
  zoom.x = clientX - centerX - ratio * (clientX - centerX - zoom.x);
  zoom.y = clientY - centerY - ratio * (clientY - centerY - zoom.y);
  zoom.scale = scale;
  clampZoomPan();
  applyZoom();
}

function zoomAtPreviewCenter(factor) {
  const rect = elements.vectorPreview.getBoundingClientRect();
  zoomAt(zoom.scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function resetZoom() {
  zoom.scale = 1;
  zoom.x = 0;
  zoom.y = 0;
  zoom.pan = null;
  zoom.pinch = null;
  zoom.pointers.clear();
  elements.vectorPreview.classList.remove('is-panning');
  applyZoom();
}

function isTypingTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable]'));
}

function cancelCurrentStroke() {
  if (!state.currentStroke) return;
  state.currentStroke = null;
  elements.drawingCanvas.getContext('2d').clearRect(
    0,
    0,
    elements.drawingCanvas.width,
    elements.drawingCanvas.height
  );
}

function pinchMetrics() {
  const [a, b] = [...zoom.pointers.values()];
  return {
    distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function setGenerating(generating) {
  elements.traceButton.classList.toggle('is-loading', generating);
  elements.traceButton.setAttribute('aria-busy', String(generating));
  elements.traceButton.setAttribute('aria-label', generating ? 'Generating SVG' : 'Generate SVG');
  elements.traceLabel.textContent = generating ? 'Generating…' : 'Generate SVG';
}

function setArtworkMessage(text, isError = false) {
  elements.artworkMessage.textContent = text;
  elements.artworkMessage.classList.toggle('is-error', isError);
}

function animationLabel() {
  return elements.animationStyle.options[elements.animationStyle.selectedIndex].textContent;
}

function updateButtons() {
  const hasArtwork = Boolean(state.svg);
  elements.traceButton.disabled = !state.image || !state.cv || state.busy;
  elements.enhanceFaces.disabled = !state.image || state.busy;
  elements.enableRoi.disabled = !state.image || state.busy;
  elements.emphasizeRois.disabled = !state.image || state.busy;
  elements.clearRois.disabled = state.manualRegions.length === 0 || state.busy;
  elements.clearBoundary.disabled = state.boundaryPoints.length === 0 || state.busy;
  elements.downloadButton.disabled = !hasArtwork || state.busy;
  elements.toggleDrawing.disabled = !hasArtwork || state.busy;
  elements.undoDrawing.disabled = state.additions.length === 0 || state.busy;
  elements.playAnimation.disabled = !hasArtwork || state.busy;
  elements.recordWebM.disabled = !hasArtwork || state.busy;
}

function updateDrawingButtonLabel() {
  const label = state.drawingMode ? 'Finish drawing' : 'Draw on canvas';
  elements.toggleDrawing.setAttribute('aria-label', label);
  elements.toggleDrawing.dataset.tooltip = label;
  updateDrawingButtonIcon();
}

function updateDrawingButtonIcon() {
  const path = elements.toggleDrawing.querySelector('path');
  if (!path) return;
  const style = elements.brushStyle.value;
  path.setAttribute('d', BRUSH_ICON_PATHS[style] || BRUSH_ICON_PATHS.pencil);
  elements.toggleDrawing.dataset.brushStyle = style;
}

function loadOpenCv() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/node_modules/@techstark/opencv-js/dist/opencv.js';
    script.onload = async () => {
      try {
        if (!window.cv) {
          throw new Error('OpenCV.js loaded without exposing its runtime.');
        }
        const wasmDirectory = new URL('../node_modules/@techstark/opencv-js/dist/', import.meta.url);
        const cv = typeof window.cv === 'function'
          ? await window.cv({ locateFile: (file) => new URL(file, wasmDirectory).href })
          : await window.cv;
        if (!cv.Mat || (!cv.createCLAHE && !cv.CLAHE)) {
          throw new Error('The OpenCV.js runtime is missing required image-processing functions.');
        }
        resolve(cv);
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error('Could not load OpenCV.js. Restart the local server and try again.'));
    document.head.appendChild(script);
  });
}

function fitDimensions(width, height) {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function roiImageGeometry(width, height) {
  if (!state.image || width <= 0 || height <= 0) return null;
  const scale = Math.min(
    width / state.image.naturalWidth,
    height / state.image.naturalHeight
  );
  const displayWidth = state.image.naturalWidth * scale;
  const displayHeight = state.image.naturalHeight * scale;
  return {
    scale,
    offsetX: (width - displayWidth) / 2,
    offsetY: (height - displayHeight) / 2
  };
}

function resizeRoiCanvas() {
  if (!state.image) return;
  const bounds = elements.sourcePreviewStage.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  elements.roiCanvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
  elements.roiCanvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
  refreshRoiCanvas();
  resizeBoundaryCanvas();
}

function setDrawerCollapsed(collapsed, autoOpened = false) {
  if (window.matchMedia('(max-width: 760px)').matches) return;
  state.drawerCollapsed = collapsed;
  state.drawerAutoOpened = !collapsed && autoOpened;
  elements.appLayout.classList.toggle('is-drawer-collapsed', collapsed);
  elements.openDrawer.setAttribute('aria-expanded', String(!collapsed));
  elements.openDrawer.hidden = !collapsed;
  window.setTimeout(resizeVectorStage, 220);
}

function currentReferenceSource() {
  return state.referenceUsesCustomImage && state.referenceUrl
    ? state.referenceUrl
    : state.sourceUrl;
}

function refreshReferenceOverlay() {
  const source = currentReferenceSource();
  const visible = Boolean(state.svg) && elements.showReference.checked && Boolean(source);
  if (visible && elements.referenceOverlay.src !== source) {
    elements.referenceOverlay.src = source;
  }
  elements.referenceOverlay.style.opacity = `${Number(elements.referenceOpacity.value) / 100}`;
  elements.referenceOverlay.hidden = !visible;
  elements.referenceHelp.textContent = state.referenceUsesCustomImage
    ? 'Custom image appears beneath the SVG while drawing.'
    : 'The source image appears beneath the SVG while drawing.';
}

function setReferenceControlsVisible(visible) {
  elements.referenceControls.hidden = !visible;
  refreshReferenceOverlay();
}

function loadReferenceImage(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    setArtworkMessage('Choose a PNG, JPEG, or WebP reference image.', true);
    return;
  }
  if (state.referenceUrl) URL.revokeObjectURL(state.referenceUrl);
  state.referenceUrl = URL.createObjectURL(file);
  state.referenceUsesCustomImage = true;
  elements.showReference.checked = true;
  refreshReferenceOverlay();
  setSourceRailCollapsed(true, { notify: true });
}

function useSourceReference() {
  state.referenceUsesCustomImage = false;
  elements.showReference.checked = true;
  refreshReferenceOverlay();
  setSourceRailCollapsed(true, { notify: true });
}

let railToastTimer = null;
function hideRailToast() {
  window.clearTimeout(railToastTimer);
  elements.railToast.hidden = true;
}
function showRailToast() {
  window.clearTimeout(railToastTimer);
  elements.railToast.hidden = false;
  railToastTimer = window.setTimeout(hideRailToast, 6000);
}

function setSourceRailCollapsed(collapsed, { notify = false } = {}) {
  if (!state.svg) return;
  const wasCollapsed = state.sourceRailCollapsed;
  state.sourceRailCollapsed = collapsed;
  if (notify && collapsed && !wasCollapsed) showRailToast();
  else hideRailToast();
  elements.sourcePreviewStage.closest('.previews').classList.toggle(
    'source-rail-collapsed',
    collapsed
  );
  elements.sourceRailToggle.hidden = collapsed;
  elements.sourceRailHandle.hidden = !collapsed;
  elements.sourceRailToggle.setAttribute('aria-label', collapsed
    ? 'Show original image'
    : 'Collapse original image');
  elements.sourceRailToggle.dataset.tooltip = collapsed
    ? 'Show original image'
    : 'Collapse original image';
  window.setTimeout(resizeVectorStage, 220);
}

function resizeBoundaryCanvas() {
  if (!state.image) return;
  const bounds = elements.sourcePreviewStage.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  elements.boundaryCanvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
  elements.boundaryCanvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
  refreshBoundaryCanvas();
}

function drawRoiRegion(context, geometry, region, color) {
  const x = geometry.offsetX + region.x * geometry.scale;
  const y = geometry.offsetY + region.y * geometry.scale;
  const width = region.width * geometry.scale;
  const height = region.height * geometry.scale;
  context.fillStyle = `${color}22`;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);
}

function roiHandlePoints(region) {
  const left = region.x;
  const top = region.y;
  const right = region.x + region.width;
  const bottom = region.y + region.height;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  return {
    nw: { x: left, y: top },
    n: { x: centerX, y: top },
    ne: { x: right, y: top },
    e: { x: right, y: centerY },
    se: { x: right, y: bottom },
    s: { x: centerX, y: bottom },
    sw: { x: left, y: bottom },
    w: { x: left, y: centerY }
  };
}

function drawRoiHandles(context, geometry, region, active = false) {
  const handleSize = 5;
  context.fillStyle = active ? '#ffffff' : '#c2f36b';
  context.strokeStyle = '#141414';
  context.lineWidth = 1;
  for (const point of Object.values(roiHandlePoints(region))) {
    const x = geometry.offsetX + point.x * geometry.scale;
    const y = geometry.offsetY + point.y * geometry.scale;
    context.fillRect(x - handleSize, y - handleSize, handleSize * 2, handleSize * 2);
    context.strokeRect(x - handleSize, y - handleSize, handleSize * 2, handleSize * 2);
  }
}

function refreshRoiCanvas() {
  if (!state.image) {
    elements.roiCanvas.hidden = true;
    return;
  }

  const manualEnabled = elements.enableRoi.checked;
  const facesEnabled = elements.enhanceFaces.checked;
  const regionsVisible = (manualEnabled && state.manualRegions.length > 0) ||
    (facesEnabled && state.faceRegions.length > 0) ||
    Boolean(state.currentRoi);
  elements.roiCanvas.hidden = !manualEnabled && !regionsVisible;
  elements.sourcePreviewStage.classList.toggle(
    'is-selecting-roi',
    manualEnabled && !state.busy
  );
  updateManualRegionCount();

  if (elements.roiCanvas.hidden) return;
  const bounds = elements.sourcePreviewStage.getBoundingClientRect();
  const pixelRatio = elements.roiCanvas.width / Math.max(bounds.width, 1);
  const context = elements.roiCanvas.getContext('2d');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  const geometry = roiImageGeometry(bounds.width, bounds.height);
  if (!geometry) return;

  if (facesEnabled) {
    for (const region of state.faceRegions) {
      drawRoiRegion(context, geometry, region, '#55d6be');
    }
  }
  if (manualEnabled) {
    state.manualRegions.forEach((region, index) => {
      drawRoiRegion(context, geometry, region, '#c2f36b');
      if (!state.busy) {
        drawRoiHandles(context, geometry, region, state.activeRoiEdit?.index === index);
      }
    });
  }
  if (state.currentRoi) {
    const { start, end } = state.currentRoi;
    drawRoiRegion(context, geometry, {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    }, '#c2f36b');
  }
}

function roiPointFromPointer(event, clampToImage = false) {
  const bounds = elements.roiCanvas.getBoundingClientRect();
  const geometry = roiImageGeometry(bounds.width, bounds.height);
  if (!geometry) return null;
  const displayX = event.clientX - bounds.left - geometry.offsetX;
  const displayY = event.clientY - bounds.top - geometry.offsetY;
  const x = displayX / geometry.scale;
  const y = displayY / geometry.scale;
  const inside = x >= 0 && y >= 0 &&
    x <= state.image.naturalWidth && y <= state.image.naturalHeight;
  if (!inside && !clampToImage) return null;
  return {
    x: Math.max(0, Math.min(state.image.naturalWidth, x)),
    y: Math.max(0, Math.min(state.image.naturalHeight, y))
  };
}

function roiHitDistance() {
  const bounds = elements.roiCanvas.getBoundingClientRect();
  const geometry = roiImageGeometry(bounds.width, bounds.height);
  return 12 / Math.max(geometry?.scale || 1, 0.01);
}

function roiHandleAtPoint(point, region) {
  const hitDistance = roiHitDistance();
  const handles = roiHandlePoints(region);
  let nearest = null;
  let distance = Infinity;
  for (const [handle, handlePoint] of Object.entries(handles)) {
    const candidateDistance = distanceBetween(point, handlePoint);
    if (candidateDistance <= hitDistance && candidateDistance < distance) {
      nearest = handle;
      distance = candidateDistance;
    }
  }
  return nearest;
}

function roiAtPoint(point) {
  const hitDistance = roiHitDistance();
  for (let index = state.manualRegions.length - 1; index >= 0; index--) {
    const region = state.manualRegions[index];
    const handle = roiHandleAtPoint(point, region);
    if (handle) return { index, handle };
    if (
      point.x >= region.x - hitDistance &&
      point.x <= region.x + region.width + hitDistance &&
      point.y >= region.y - hitDistance &&
      point.y <= region.y + region.height + hitDistance
    ) {
      return { index, handle: null };
    }
  }
  return null;
}

function roiCursor(hit) {
  if (!hit) return 'crosshair';
  if (!hit.handle) return 'move';
  if (hit.handle === 'n' || hit.handle === 's') return 'ns-resize';
  if (hit.handle === 'e' || hit.handle === 'w') return 'ew-resize';
  return hit.handle === 'nw' || hit.handle === 'se' ? 'nwse-resize' : 'nesw-resize';
}

function clampRoiValue(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function updateRoiEdit(point) {
  const edit = state.activeRoiEdit;
  if (!edit) return;
  const region = state.manualRegions[edit.index];
  if (!region) return;

  const original = edit.original;
  const minimumSize = 5;
  if (edit.mode === 'move') {
    region.x = clampRoiValue(
      original.x + point.x - edit.start.x,
      0,
      state.image.naturalWidth - original.width
    );
    region.y = clampRoiValue(
      original.y + point.y - edit.start.y,
      0,
      state.image.naturalHeight - original.height
    );
    return;
  }

  let left = original.x;
  let top = original.y;
  let right = original.x + original.width;
  let bottom = original.y + original.height;
  if (edit.handle.includes('w')) left = clampRoiValue(point.x, 0, right - minimumSize);
  if (edit.handle.includes('e')) right = clampRoiValue(point.x, left + minimumSize, state.image.naturalWidth);
  if (edit.handle.includes('n')) top = clampRoiValue(point.y, 0, bottom - minimumSize);
  if (edit.handle.includes('s')) bottom = clampRoiValue(point.y, top + minimumSize, state.image.naturalHeight);
  region.x = left;
  region.y = top;
  region.width = right - left;
  region.height = bottom - top;
}

function boundaryPointFromPointer(event, clampToImage = false) {
  const bounds = elements.boundaryCanvas.getBoundingClientRect();
  const geometry = roiImageGeometry(bounds.width, bounds.height);
  if (!geometry) return null;
  const x = (event.clientX - bounds.left - geometry.offsetX) / geometry.scale;
  const y = (event.clientY - bounds.top - geometry.offsetY) / geometry.scale;
  const inside = x >= 0 && y >= 0 && x <= state.image.naturalWidth && y <= state.image.naturalHeight;
  if (!inside && !clampToImage) return null;
  return {
    x: Math.max(0, Math.min(state.image.naturalWidth, x)),
    y: Math.max(0, Math.min(state.image.naturalHeight, y))
  };
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function chaikin(points, iterations = 2) {
  let result = points.slice();
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = [];
    for (let i = 0; i < result.length; i++) {
      const current = result[i];
      const following = result[(i + 1) % result.length];
      next.push(
        { x: current.x * 0.75 + following.x * 0.25, y: current.y * 0.75 + following.y * 0.25 },
        { x: current.x * 0.25 + following.x * 0.75, y: current.y * 0.25 + following.y * 0.75 }
      );
    }
    result = next;
  }
  return result;
}

function splinePoints(points, samplesPerSegment = 8) {
  if (points.length < 3) return points.slice();
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];
    for (let step = 0; step < samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
  }
  return result;
}

function boundaryPathPoints() {
  if (state.currentBoundaryStroke?.length >= 2) return chaikin(state.currentBoundaryStroke, 1);
  if (state.boundaryPoints.length < 3) return state.boundaryPoints;
  return elements.boundaryMode.value === 'points'
    ? splinePoints(state.boundaryPoints)
    : state.boundaryPoints;
}

function syncBoundaryText() {
  const points = boundaryPathPoints();
  elements.polygon.value = points.length >= 3
    ? points.filter((_, index) => index % Math.max(1, Math.ceil(points.length / 80)) === 0)
      .map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(' ')
    : '';
}

function drawBoundaryPath(context, geometry, points) {
  if (points.length < 2) return;
  context.beginPath();
  points.forEach((point, index) => {
    const x = geometry.offsetX + point.x * geometry.scale;
    const y = geometry.offsetY + point.y * geometry.scale;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  if (points.length >= 3 && state.boundaryClosed) context.closePath();
  context.fillStyle = 'rgba(194, 243, 107, 0.16)';
  context.strokeStyle = '#c2f36b';
  context.lineWidth = 2;
  if (state.boundaryClosed) context.fill();
  context.stroke();
}

function refreshBoundaryCanvas() {
  if (!state.image) { elements.boundaryCanvas.hidden = true; return; }
  // Keep the transparent canvas mounted while an image is loaded so a new
  // boundary can be started even before the first point exists.
  elements.boundaryCanvas.hidden = false;
  elements.sourcePreviewStage.classList.toggle('is-editing-boundary', !state.busy && Boolean(state.image));
  const bounds = elements.sourcePreviewStage.getBoundingClientRect();
  const ratio = elements.boundaryCanvas.width / Math.max(bounds.width, 1);
  const context = elements.boundaryCanvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  const geometry = roiImageGeometry(bounds.width, bounds.height);
  if (!geometry) return;
  const points = boundaryPathPoints();
  drawBoundaryPath(context, geometry, points);
  if (elements.boundaryMode.value === 'points') {
    state.boundaryPoints.forEach((point, index) => {
      const x = geometry.offsetX + point.x * geometry.scale;
      const y = geometry.offsetY + point.y * geometry.scale;
      context.beginPath();
      context.arc(x, y, index === 0 && state.boundaryPoints.length >= 3 ? 6 : 4, 0, Math.PI * 2);
      context.fillStyle = index === 0 && state.boundaryPoints.length >= 3 ? '#ffffff' : '#c2f36b';
      context.fill();
      context.strokeStyle = '#141414';
      context.lineWidth = 1.5;
      context.stroke();
    });
  }
}

function nearestBoundaryPoint(point) {
  const bounds = elements.boundaryCanvas.getBoundingClientRect();
  const geometry = roiImageGeometry(bounds.width, bounds.height);
  const hitDistance = 16 / Math.max(geometry?.scale || 1, 0.01);
  let nearest = -1;
  let distance = Infinity;
  state.boundaryPoints.forEach((candidate, index) => {
    const candidateDistance = distanceBetween(point, candidate);
    if (candidateDistance < distance && candidateDistance <= hitDistance) { nearest = index; distance = candidateDistance; }
  });
  return nearest;
}

function startBoundaryEdit(event) {
  if (!state.image || state.busy || event.button !== 0) return;
  const point = boundaryPointFromPointer(event);
  if (!point) return;
  event.preventDefault();
  if (elements.boundaryMode.value === 'freehand') {
    state.currentBoundaryStroke = [point];
    elements.boundaryCanvas.setPointerCapture(event.pointerId);
  } else {
    const nearest = nearestBoundaryPoint(point);
    if (nearest >= 0) {
      state.boundaryDragIndex = nearest;
      elements.boundaryCanvas.setPointerCapture(event.pointerId);
    } else if (!state.boundaryClosed) {
      if (state.boundaryPoints.length >= 3 && distanceBetween(point, state.boundaryPoints[0]) < 20 / roiImageGeometry(elements.boundaryCanvas.clientWidth, elements.boundaryCanvas.clientHeight).scale) {
        state.boundaryClosed = true;
      } else {
        state.boundaryPoints.push(point);
      }
    }
    syncBoundaryText();
    refreshBoundaryCanvas();
  }
}

function continueBoundaryEdit(event) {
  if (!state.currentBoundaryStroke && state.boundaryDragIndex < 0) return;
  const point = boundaryPointFromPointer(event, true);
  if (!point) return;
  event.preventDefault();
  if (state.currentBoundaryStroke) state.currentBoundaryStroke.push(point);
  else state.boundaryPoints[state.boundaryDragIndex] = point;
  syncBoundaryText();
  refreshBoundaryCanvas();
}

function finishBoundaryEdit(event) {
  if (state.currentBoundaryStroke) {
    if (event && elements.boundaryCanvas.hasPointerCapture(event.pointerId)) elements.boundaryCanvas.releasePointerCapture(event.pointerId);
    if (state.currentBoundaryStroke.length >= 3) {
      state.boundaryPoints = chaikin(state.currentBoundaryStroke, 2);
      state.boundaryClosed = true;
    }
    state.currentBoundaryStroke = null;
    syncBoundaryText();
    refreshBoundaryCanvas();
  }
  if (state.boundaryDragIndex >= 0) {
    if (event && elements.boundaryCanvas.hasPointerCapture(event.pointerId)) elements.boundaryCanvas.releasePointerCapture(event.pointerId);
    state.boundaryDragIndex = -1;
    syncBoundaryText();
  }
}

function clearBoundary() {
  state.boundaryPoints = [];
  state.boundaryClosed = false;
  state.currentBoundaryStroke = null;
  state.boundaryDragIndex = -1;
  elements.polygon.value = '';
  refreshBoundaryCanvas();
  updateButtons();
}

function startRoiSelection(event) {
  if (!elements.enableRoi.checked || state.busy || event.button !== 0) return;
  const point = roiPointFromPointer(event);
  if (!point) return;
  event.preventDefault();
  const hit = roiAtPoint(point);
  if (hit) {
    const region = state.manualRegions[hit.index];
    state.activeRoiEdit = {
      mode: hit.handle ? 'resize' : 'move',
      handle: hit.handle,
      index: hit.index,
      start: point,
      original: { ...region }
    };
    elements.roiCanvas.style.cursor = roiCursor(hit);
    elements.roiCanvas.setPointerCapture(event.pointerId);
    refreshRoiCanvas();
    return;
  }
  state.currentRoi = { start: point, end: point };
  elements.roiCanvas.style.cursor = 'crosshair';
  elements.roiCanvas.setPointerCapture(event.pointerId);
  refreshRoiCanvas();
}

function continueRoiSelection(event) {
  if (state.activeRoiEdit) {
    const point = roiPointFromPointer(event, true);
    if (!point) return;
    event.preventDefault();
    updateRoiEdit(point);
    refreshRoiCanvas();
    return;
  }
  if (!state.currentRoi) return;
  const point = roiPointFromPointer(event, true);
  if (!point) return;
  event.preventDefault();
  state.currentRoi.end = point;
  refreshRoiCanvas();
}

function finishRoiSelection(event) {
  if (state.activeRoiEdit) {
    if (event && elements.roiCanvas.hasPointerCapture(event.pointerId)) {
      elements.roiCanvas.releasePointerCapture(event.pointerId);
    }
    state.activeRoiEdit = null;
    elements.roiStatus.textContent = 'Region updated. Drag inside to move it, or use its handles to resize it.';
    elements.roiCanvas.style.cursor = 'crosshair';
    updateButtons();
    refreshRoiCanvas();
    return;
  }
  if (!state.currentRoi) return;
  if (event && elements.roiCanvas.hasPointerCapture(event.pointerId)) {
    elements.roiCanvas.releasePointerCapture(event.pointerId);
  }
  const { start, end } = state.currentRoi;
  state.currentRoi = null;
  const region = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
  if (region.width < 5 || region.height < 5) {
    elements.roiStatus.textContent = 'Draw a larger rectangle to select a detail region.';
    refreshRoiCanvas();
    return;
  }
  state.manualRegions.push(region);
  elements.roiStatus.textContent = 'Region added. Drag inside to move it, or use its handles to resize it.';
  updateButtons();
  refreshRoiCanvas();
}

function clearManualRegions() {
  state.manualRegions = [];
  state.activeRoiEdit = null;
  elements.roiStatus.textContent = 'Custom regions cleared.';
  updateButtons();
  refreshRoiCanvas();
}

function parsePolygon(value, sourceWidth, sourceHeight, scaledWidth, scaledHeight) {
  const text = value.trim();
  if (!text) return null;

  const tokens = text.split(/\s+/);
  if (tokens.length < 3) {
    throw new Error('A subject boundary needs at least three x,y points.');
  }

  const scaleX = scaledWidth * UPSCALE / sourceWidth;
  const scaleY = scaledHeight * UPSCALE / sourceHeight;
  const coordinates = [];
  for (const token of tokens) {
    const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(token);
    if (!match) {
      throw new Error(`Invalid polygon point "${token}". Use points like 120,80 separated by spaces.`);
    }
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Invalid polygon point "${token}". Coordinates must be finite numbers.`);
    }
    coordinates.push(Math.round(x * scaleX), Math.round(y * scaleY));
  }

  return coordinates;
}

function createMat(cv, ownedMats, ...args) {
  const mat = new cv.Mat(...args);
  ownedMats.push(mat);
  return mat;
}

function loadLocalScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load local face detection file: ${source}`));
    document.head.appendChild(script);
  });
}

async function loadFaceDetector() {
  if (state.faceDetector) return state.faceDetector;
  if (!state.faceDetectorPromise) {
    state.faceDetectorPromise = (async () => {
      await loadLocalScript('/node_modules/@mediapipe/face_detection/face_detection.js');
      if (!window.FaceDetection) {
        throw new Error('The local face detector could not be initialized.');
      }
      const detector = new window.FaceDetection({
        locateFile: (file) => `/node_modules/@mediapipe/face_detection/${file}`
      });
      detector.setOptions({ model: 'full', minDetectionConfidence: 0.5 });
      await detector.initialize();
      state.faceDetector = detector;
      return detector;
    })();
  }
  return state.faceDetectorPromise;
}

async function detectFaceRegions(image) {
  const detector = await loadFaceDetector();
  const dimensions = fitDimensions(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not prepare the image for local face detection.');
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  let detections;
  detector.onResults((results) => {
    detections = results.detections;
  });
  await detector.send({ image: canvas });
  if (!detections) throw new Error('The local face detector did not return results.');

  const scaleX = image.naturalWidth / dimensions.width;
  const scaleY = image.naturalHeight / dimensions.height;
  return detections.map(({ boundingBox }) => {
    const faceWidth = boundingBox.width * dimensions.width;
    const faceHeight = boundingBox.height * dimensions.height;
    const faceX = (boundingBox.xCenter - boundingBox.width / 2) * dimensions.width;
    const faceY = (boundingBox.yCenter - boundingBox.height / 2) * dimensions.height;
    const left = Math.max(0, faceX - faceWidth * 0.1);
    const top = Math.max(0, faceY - faceHeight * 0.15);
    const right = Math.min(dimensions.width, faceX + faceWidth * 1.1);
    const bottom = Math.min(dimensions.height, faceY + faceHeight * 1.12);
    const x = Math.round(left * scaleX);
    const y = Math.round(top * scaleY);
    return {
      x,
      y,
      width: Math.max(1, Math.round(right * scaleX) - x),
      height: Math.max(1, Math.round(bottom * scaleY) - y)
    };
  });
}

function updateManualRegionCount() {
  elements.roiCount.textContent = `${state.manualRegions.length} custom region${state.manualRegions.length === 1 ? '' : 's'}`;
}

function mergeEnhancementRegions(regions) {
  const merged = [];
  for (const region of regions) {
    let candidate = { ...region };
    if (
      ![candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite) ||
      candidate.width <= 0 ||
      candidate.height <= 0
    ) {
      throw new Error('An enhancement region has invalid image coordinates.');
    }
    let index = 0;
    while (index < merged.length) {
      const existing = merged[index];
      const overlaps = candidate.x <= existing.x + existing.width &&
        candidate.x + candidate.width >= existing.x &&
        candidate.y <= existing.y + existing.height &&
        candidate.y + candidate.height >= existing.y;
      if (!overlaps) {
        index++;
        continue;
      }
      const left = Math.min(candidate.x, existing.x);
      const top = Math.min(candidate.y, existing.y);
      const right = Math.max(candidate.x + candidate.width, existing.x + existing.width);
      const bottom = Math.max(candidate.y + candidate.height, existing.y + existing.height);
      candidate = { x: left, y: top, width: right - left, height: bottom - top };
      merged.splice(index, 1);
      index = 0;
    }
    merged.push(candidate);
  }
  return merged;
}

function applyLocalDetailBoost(cv, gray, equalized, regions, sourceWidth, sourceHeight, ownedMats) {
  if (regions.length === 0) return;
  const localClahe = cv.createCLAHE
    ? cv.createCLAHE(5, new cv.Size(8, 8))
    : new cv.CLAHE(5, new cv.Size(8, 8));
  try {
    const locallyEnhanced = createMat(cv, ownedMats);
    localClahe.apply(gray, locallyEnhanced);
    const width = equalized.cols;
    const height = equalized.rows;
    const output = equalized.data;
    const detail = locallyEnhanced.data;
    for (const region of regions) {
      const left = Math.max(0, Math.floor(region.x / sourceWidth * width));
      const top = Math.max(0, Math.floor(region.y / sourceHeight * height));
      const right = Math.min(
        width,
        Math.ceil((region.x + region.width) / sourceWidth * width)
      );
      const bottom = Math.min(
        height,
        Math.ceil((region.y + region.height) / sourceHeight * height)
      );
      const regionWidth = right - left;
      const regionHeight = bottom - top;
      if (regionWidth <= 0 || regionHeight <= 0) continue;

      const feather = Math.max(1, Math.min(48, Math.round(Math.min(regionWidth, regionHeight) * 0.12)));
      for (let y = top; y < bottom; y++) {
        const edgeY = Math.min(y - top, bottom - 1 - y);
        for (let x = left; x < right; x++) {
          const edge = Math.min(edgeY, x - left, right - 1 - x);
          const weight = 0.72 * Math.min(1, edge / feather);
          if (weight === 0) continue;
          const index = y * width + x;
          const localValue = 255 * Math.pow(detail[index] / 255, 0.9);
          output[index] = Math.round(output[index] * (1 - weight) + localValue * weight);
        }
      }
    }
  } finally {
    localClahe.delete();
  }
}

function createRoiFocusMap(width, height, sourceWidth, sourceHeight, regions) {
  if (regions.length === 0) return null;

  const focus = new Float32Array(width * height);
  for (const region of regions) {
    const left = Math.max(0, Math.floor(region.x / sourceWidth * width));
    const top = Math.max(0, Math.floor(region.y / sourceHeight * height));
    const right = Math.min(width, Math.ceil((region.x + region.width) / sourceWidth * width));
    const bottom = Math.min(height, Math.ceil((region.y + region.height) / sourceHeight * height));
    const regionWidth = right - left;
    const regionHeight = bottom - top;
    if (regionWidth <= 0 || regionHeight <= 0) continue;

    const feather = Math.max(1, Math.min(48, Math.round(Math.min(regionWidth, regionHeight) * 0.12)));
    const startX = Math.max(0, left - feather);
    const endX = Math.min(width, right + feather);
    const startY = Math.max(0, top - feather);
    const endY = Math.min(height, bottom + feather);
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const distanceX = x < left ? left - x : x >= right ? x - right + 1 : 0;
        const distanceY = y < top ? top - y : y >= bottom ? y - bottom + 1 : 0;
        const distance = Math.max(distanceX, distanceY);
        const weight = distance === 0 ? 1 : 0.84 * Math.max(0, 1 - distance / feather);
        const index = y * width + x;
        if (weight > focus[index]) focus[index] = weight;
      }
    }
  }
  return focus;
}

function applyRoiEmphasis(equalized, focusMap) {
  if (!focusMap) return;
  const output = equalized.data;
  for (let index = 0; index < output.length; index++) {
    const focus = focusMap[index];
    if (focus === 0) {
      // Flatten the non-priority image so the tracer finds fewer, lighter marks.
      output[index] = Math.round(128 + (output[index] - 128) * 0.58);
      continue;
    }

    // Add a small lift and extra contrast inside the selected regions.
    output[index] = Math.max(
      0,
      Math.min(255, Math.round(128 + (output[index] - 128) * (1 + 0.14 * focus) + 4 * focus))
    );
  }
}

function renderMask(
  cv,
  image,
  sigma,
  epsilon,
  minArea,
  polygonCoordinates,
  enhancementRegions = [],
  emphasizeRegions = false
) {
  const ownedMats = [];
  let clahe = null;
  try {
    const dimensions = fitDimensions(image.naturalWidth, image.naturalHeight);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = dimensions.width;
    sourceCanvas.height = dimensions.height;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(image, 0, 0, dimensions.width, dimensions.height);

    const source = cv.imread(sourceCanvas);
    ownedMats.push(source);
    const upscaled = createMat(cv, ownedMats);
    cv.resize(
      source,
      upscaled,
      new cv.Size(dimensions.width * UPSCALE, dimensions.height * UPSCALE),
      0,
      0,
      cv.INTER_CUBIC
    );

    const gray = createMat(cv, ownedMats);
    cv.cvtColor(upscaled, gray, cv.COLOR_RGBA2GRAY);
    clahe = cv.createCLAHE
      ? cv.createCLAHE(3, new cv.Size(8, 8))
      : new cv.CLAHE(3, new cv.Size(8, 8));
    const equalized = createMat(cv, ownedMats);
    clahe.apply(gray, equalized);
    applyLocalDetailBoost(
      cv,
      gray,
      equalized,
      enhancementRegions,
      image.naturalWidth,
      image.naturalHeight,
      ownedMats
    );
    const roiFocusMap = emphasizeRegions
      ? createRoiFocusMap(
        equalized.cols,
        equalized.rows,
        image.naturalWidth,
        image.naturalHeight,
        enhancementRegions
      )
      : null;
    applyRoiEmphasis(equalized, roiFocusMap);

    const denoised = createMat(cv, ownedMats);
    cv.bilateralFilter(equalized, denoised, 9, 40, 9, cv.BORDER_DEFAULT);
    const normalized = createMat(cv, ownedMats);
    denoised.convertTo(normalized, cv.CV_32F, 1 / 255);

    const blurScale = sigma * UPSCALE / 2;
    const firstBlur = createMat(cv, ownedMats);
    const secondBlur = createMat(cv, ownedMats);
    cv.GaussianBlur(
      normalized,
      firstBlur,
      new cv.Size(0, 0),
      blurScale,
      blurScale,
      cv.BORDER_DEFAULT
    );
    cv.GaussianBlur(
      normalized,
      secondBlur,
      new cv.Size(0, 0),
      blurScale * 1.6,
      blurScale * 1.6,
      cv.BORDER_DEFAULT
    );

    const pixelCount = firstBlur.rows * firstBlur.cols;
    const inkData = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const difference = (1 + DEFAULT_P) * firstBlur.data32F[i] - DEFAULT_P * secondBlur.data32F[i];
      const scaled = difference * 100;
      const focus = roiFocusMap ? roiFocusMap[i] : 0;
      // A lower threshold outside the ROIs suppresses weaker edges; a slightly
      // higher threshold inside lets the selected subject keep fine detail.
      const focusedEpsilon = epsilon - (1 - focus) * 4 + focus * 1.5;
      const thresholded = scaled >= focusedEpsilon
        ? 1
        : 1 + Math.tanh(DEFAULT_PHI * (scaled - focusedEpsilon));
      inkData[i] = thresholded < 0.5 ? 255 : 0;
    }

    let ink = createMat(
      cv,
      ownedMats,
      dimensions.height * UPSCALE,
      dimensions.width * UPSCALE,
      cv.CV_8UC1
    );
    ink.data.set(inkData);

    if (polygonCoordinates) {
      const polygon = cv.matFromArray(
        1,
        polygonCoordinates.length / 2,
        cv.CV_32SC2,
        polygonCoordinates
      );
      ownedMats.push(polygon);
      const polygons = new cv.MatVector();
      polygons.push_back(polygon);
      ownedMats.push(polygons);
      const polygonMask = createMat(
        cv,
        ownedMats,
        ink.rows,
        ink.cols,
        cv.CV_8UC1,
        new cv.Scalar(0)
      );
      cv.fillPoly(polygonMask, polygons, new cv.Scalar(255));
      const softenedMask = createMat(cv, ownedMats);
      cv.GaussianBlur(
        polygonMask,
        softenedMask,
        new cv.Size(0, 0),
        5 * UPSCALE,
        5 * UPSCALE,
        cv.BORDER_DEFAULT
      );
      const binaryMask = createMat(cv, ownedMats);
      cv.threshold(softenedMask, binaryMask, 127, 255, cv.THRESH_BINARY);
      const clippedInk = createMat(cv, ownedMats);
      cv.bitwise_and(ink, binaryMask, clippedInk);
      ink = clippedInk;
    }

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
    ownedMats.push(kernel);
    const closedInk = createMat(cv, ownedMats);
    cv.morphologyEx(ink, closedInk, cv.MORPH_CLOSE, kernel);

    const labels = createMat(cv, ownedMats);
    const stats = createMat(cv, ownedMats);
    const centroids = createMat(cv, ownedMats);
    cv.connectedComponentsWithStats(
      closedInk,
      labels,
      stats,
      centroids,
      8,
      cv.CV_32S
    );
    const minimumComponentArea = minArea * UPSCALE * UPSCALE / 4;
    const cleaned = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const label = labels.data32S[i];
      if (label > 0 && stats.intAt(label, cv.CC_STAT_AREA) >= minimumComponentArea) {
        cleaned[i] = 255;
      }
    }

    return {
      data: cleaned,
      width: dimensions.width * UPSCALE,
      height: dimensions.height * UPSCALE,
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight
    };
  } finally {
    if (clahe) clahe.delete();
    for (const mat of ownedMats) mat.delete();
  }
}

function maskToRgba(mask) {
  const pixels = new Uint8Array(mask.data.length * 4);
  for (let i = 0, j = 0; i < mask.data.length; i++, j += 4) {
    const channel = mask.data[i] ? 0 : 255;
    pixels[j] = channel;
    pixels[j + 1] = channel;
    pixels[j + 2] = channel;
    pixels[j + 3] = 255;
  }
  return pixels;
}

function fitSvgToSource(svg, width, height, vectorWidth, vectorHeight, includeBackground) {
  const openingTag = /<svg\b[^>]*>/;
  if (!openingTag.test(svg)) {
    throw new Error('VTracer returned invalid SVG markup.');
  }
  const fittedTag = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${vectorWidth} ${vectorHeight}">`;
  let result = svg.replace(openingTag, fittedTag);
  if (includeBackground) {
    result = result.replace(
      fittedTag,
      `${fittedTag}\n<rect width="${vectorWidth}" height="${vectorHeight}" fill="#fff"/>`
    );
  }
  return result;
}

function parseSvg(svg) {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') {
    throw new Error('The generated SVG could not be opened on the drawing canvas.');
  }
  return document.importNode(parsed.documentElement, true);
}

function mountSvg(svgRoot) {
  stopAnimation();
  state.vectorSvg = svgRoot;
  state.vectorSvg.id = 'vector-svg';
  state.vectorSvg.classList.add('vector-art');
  elements.vectorViewport.replaceChildren(
    elements.referenceOverlay,
    state.vectorSvg,
    elements.drawingCanvas
  );
  elements.vectorViewport.hidden = false;
  elements.resultEmpty.hidden = true;
  elements.fullscreenToggle.hidden = false;
  elements.drawingCanvas.hidden = true;
  resizeVectorStage();
  refreshReferenceOverlay();
}

function resizeVectorStage() {
  if (!state.vectorSvg || elements.vectorPreview.clientWidth === 0) return;
  const viewBox = state.vectorSvg.viewBox.baseVal;
  if (!viewBox.width || !viewBox.height) return;
  const scale = Math.min(
    elements.vectorPreview.clientWidth / viewBox.width,
    elements.vectorPreview.clientHeight / viewBox.height
  );
  elements.vectorViewport.style.width = `${Math.max(1, viewBox.width * scale)}px`;
  elements.vectorViewport.style.height = `${Math.max(1, viewBox.height * scale)}px`;
  elements.drawingCanvas.width = Math.ceil(viewBox.width);
  elements.drawingCanvas.height = Math.ceil(viewBox.height);
  clampZoomPan();
  applyZoom();
}

function clearResult() {
  stopAnimation();
  state.svg = null;
  state.vectorSvg = null;
  state.mask = null;
  state.baseCenterlines = null;
  state.additions = [];
  state.reveal = null;
  state.currentStroke = null;
  state.drawingMode = false;
  state.sourceRailCollapsed = false;
  elements.zoomControls.hidden = true;
  elements.vectorPreview.classList.remove('is-drawing');
  resetZoom();
  if (state.webmUrl) {
    URL.revokeObjectURL(state.webmUrl);
    state.webmUrl = null;
  }
  elements.downloadWebM.hidden = true;
  elements.artworkActions.hidden = true;
  setReferenceControlsVisible(false);
  elements.vectorViewport.hidden = true;
  elements.fullscreenToggle.hidden = true;
  if (document.fullscreenElement) void document.exitFullscreen();
  elements.drawingCanvas.hidden = true;
  elements.referenceOverlay.hidden = true;
  elements.sourcePreviewStage.closest('.previews').classList.remove('source-rail-collapsed');
  elements.sourceRailToggle.hidden = true;
  elements.sourceRailHandle.hidden = true;
  elements.vectorViewport.replaceChildren(elements.referenceOverlay, elements.drawingCanvas);
  elements.resultEmpty.hidden = false;
  elements.dimensions.textContent = '';
  updateDrawingButtonLabel();
  elements.workspaceNote.hidden = false;
  updateButtons();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function generateSvg() {
  if (!state.image || !state.cv || state.busy) return;

  state.busy = true;
  clearResult();
  updateButtons();
  setGenerating(true);
  setMessage('Processing image…');
  setStageLoading('Processing image…', { blocking: true, progress: null });
  refreshRoiCanvas();
  await nextPaint();
  try {
    const dimensions = fitDimensions(state.image.naturalWidth, state.image.naturalHeight);
    const polygon = parsePolygon(
      elements.polygon.value,
      state.image.naturalWidth,
      state.image.naturalHeight,
      dimensions.width,
      dimensions.height
    );
    if (elements.enhanceFaces.checked) {
      setMessage('Detecting faces…');
      setStageLoading('Detecting faces… (the first run downloads the model)', {
        blocking: true,
        progress: null
      });
      await nextPaint();
    }
    state.faceRegions = elements.enhanceFaces.checked
      ? await detectFaceRegions(state.image)
      : [];
    if (elements.enhanceFaces.checked) {
      elements.roiStatus.textContent = state.faceRegions.length > 0
        ? `Detected ${state.faceRegions.length} face region${state.faceRegions.length === 1 ? '' : 's'}.`
        : 'No faces detected; only custom regions will be enhanced.';
    }
    refreshRoiCanvas();
    const enhancementRegions = mergeEnhancementRegions([
      ...(elements.enhanceFaces.checked ? state.faceRegions : []),
      ...(elements.enableRoi.checked ? state.manualRegions : [])
    ]);
    const emphasizeRegions = elements.emphasizeRois.checked && enhancementRegions.length > 0;
    setMessage(emphasizeRegions
      ? 'Emphasizing selected regions and tracing…'
      : enhancementRegions.length > 0
        ? 'Enhancing selected details and tracing…'
        : 'Tracing image…');
    setStageLoading(elements.message.textContent, { blocking: true, progress: null });
    await nextPaint();
    const mask = renderMask(
      state.cv,
      state.image,
      Number(elements.sigma.value),
      Number(elements.epsilon.value),
      Number(elements.minArea.value),
      polygon,
      enhancementRegions,
      emphasizeRegions
    );
    const config = {
      binary: true,
      mode: 'spline',
      hierarchical: 'cutout',
      cornerThreshold: 60,
      lengthThreshold: 4,
      maxIterations: 10,
      spliceThreshold: 45,
      filterSpeckle: Math.floor(Number(elements.minArea.value) * UPSCALE * UPSCALE / 4),
      colorPrecision: 6,
      layerDifference: 16,
      pathPrecision: 2
    };
    const tracedSvg = traceBitmap(
      maskToRgba(mask),
      mask.width,
      mask.height,
      config
    );
    state.svg = fitSvgToSource(
      tracedSvg,
      mask.sourceWidth,
      mask.sourceHeight,
      mask.width,
      mask.height,
      elements.background.checked
    );
    state.mask = mask;
    state.additions = [];
    state.baseCenterlines = null;
    mountSvg(parseSvg(state.svg));
    elements.artworkActions.hidden = false;
    setReferenceControlsVisible(true);
    elements.workspaceNote.hidden = true;
    elements.dimensions.textContent = `${mask.sourceWidth} × ${mask.sourceHeight}`;
    setMessage('SVG ready. Draw over it or choose an animation style to preview.');
    setArtworkMessage('Drawn strokes are vectorized when you lift the pen.');
    updateButtons();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.busy = false;
    setGenerating(false);
    clearStageLoading();
    updateButtons();
  }
}

function loadImage(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    setMessage('Choose a PNG, JPEG, or WebP image.', true);
    return;
  }

  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.sourceUrl = imageUrl;
    state.image = image;
    state.manualRegions = [];
    state.faceRegions = [];
    state.currentRoi = null;
    state.activeRoiEdit = null;
    clearBoundary();
    clearResult();
    elements.sourcePreview.src = imageUrl;
    elements.sourcePreview.hidden = false;
    elements.sourceEmpty.hidden = true;
    elements.uploadLabel.textContent = file.name;
    elements.dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    elements.roiStatus.textContent = 'Draw rectangles on the source image. Move them by dragging inside, or resize them with their handles.';
    resizeRoiCanvas();
    setMessage('Image loaded. Adjust the settings and generate your SVG.');
    updateButtons();
  };
  image.onerror = () => {
    URL.revokeObjectURL(imageUrl);
    setMessage('The selected file could not be decoded as an image.', true);
  };
  image.src = imageUrl;
}

function pointFromPointer(event) {
  const bounds = elements.drawingCanvas.getBoundingClientRect();
  const viewBox = state.vectorSvg.viewBox.baseVal;
  return {
    x: (event.clientX - bounds.left) / bounds.width * viewBox.width,
    y: (event.clientY - bounds.top) / bounds.height * viewBox.height,
    pressure: event.pointerType === 'mouse' ? 0.5 : Math.max(0.1, event.pressure)
  };
}

function nibWidth(start, end, width) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const nib = 0.22 + 0.78 * Math.abs(Math.sin(angle - Math.PI / 4));
  const pressure = Math.max(0.35, ((start.pressure || 0.5) + (end.pressure || 0.5)));
  return width * nib * pressure;
}

function brushSettings(style) {
  const settings = BRUSH_STYLES[style];
  if (!settings) throw new Error(`Unknown brush style: ${style}`);
  return settings;
}

function drawBrushStroke(context, points, width, color, style, offsetX = 0, offsetY = 0) {
  if (points.length === 0) return;
  const settings = brushSettings(style);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.globalAlpha = settings.opacity;
  context.lineCap = settings.cap;
  context.lineJoin = 'round';
  const adjustedPoint = (point, index) => {
    const jitter = settings.roughness * width;
    return {
      x: point.x + Math.sin(index * 12.9898) * jitter + offsetX,
      y: point.y + Math.cos(index * 78.233) * jitter + offsetY
    };
  };

  if (points.length === 1) {
    context.beginPath();
    const point = adjustedPoint(points[0], 0);
    const pointWidth = style === 'calligraphy'
      ? width * Math.max(0.35, points[0].pressure || 0.5)
      : width * settings.widthScale;
    context.arc(point.x, point.y, pointWidth / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const startPoint = adjustedPoint(start, index);
    const endPoint = adjustedPoint(end, index + 1);
    const roughVariation = style === 'pencil'
      ? 0.8 + 0.2 * Math.abs(Math.sin(index * 1.71))
      : 1;
    context.lineWidth = style === 'calligraphy'
      ? nibWidth(start, end, width)
      : width * settings.widthScale * roughVariation;
    context.beginPath();
    context.moveTo(startPoint.x, startPoint.y);
    context.lineTo(endPoint.x, endPoint.y);
    context.stroke();
  }
  context.restore();
}

function smoothPath(points) {
  if (points.length === 0) return '';
  const format = (point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  if (points.length === 1) {
    return `M ${format(points[0])} l 0.01 0`;
  }
  if (points.length === 2) {
    return `M ${format(points[0])} L ${format(points[1])}`;
  }

  let path = `M ${format(points[0])}`;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index > 0 ? index - 1 : index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    path += ` C ${format({
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6
    })}, ${format({
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6
    })}, ${format(p2)}`;
  }
  return path;
}

function drawCurrentStroke() {
  const context = elements.drawingCanvas.getContext('2d');
  context.clearRect(0, 0, elements.drawingCanvas.width, elements.drawingCanvas.height);
  if (!state.currentStroke) return;
  drawBrushStroke(
    context,
    state.currentStroke.points,
    state.currentStroke.width,
    state.currentStroke.color,
    state.currentStroke.style
  );
}

function maximumBrushWidth(stroke) {
  const settings = brushSettings(stroke.style);
  if (stroke.style !== 'calligraphy') return stroke.width * settings.maxScale;
  if (stroke.points.length === 1) {
    return stroke.width * Math.max(0.35, stroke.points[0].pressure || 0.5);
  }
  let maxWidth = 0;
  for (let index = 0; index < stroke.points.length - 1; index++) {
    maxWidth = Math.max(
      maxWidth,
      nibWidth(stroke.points[index], stroke.points[index + 1], stroke.width)
    );
  }
  return maxWidth;
}

function strokeCrop(stroke, width, height) {
  const pad = Math.ceil(maximumBrushWidth(stroke) + 2);
  const points = stroke.points;
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x)) - pad));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y)) - pad));
  const maxX = Math.min(width, Math.ceil(Math.max(...points.map((point) => point.x)) + pad));
  const maxY = Math.min(height, Math.ceil(Math.max(...points.map((point) => point.y)) + pad));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

async function vectorizeStroke(stroke) {
  state.busy = true;
  updateButtons();
  setArtworkMessage('Vectorizing pen stroke…');
  setStageLoading('Vectorizing stroke…');
  await nextPaint();

  try {
    const viewBox = state.vectorSvg.viewBox.baseVal;
    const crop = strokeCrop(
      stroke,
      Math.ceil(viewBox.width),
      Math.ceil(viewBox.height)
    );
    const canvas = document.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, crop.width, crop.height);
    drawBrushStroke(
      context,
      stroke.points,
      stroke.width,
      '#000',
      stroke.style,
      -crop.x,
      -crop.y
    );
    const imageData = context.getImageData(0, 0, crop.width, crop.height);
    const pixels = new Uint8Array(
      imageData.data.buffer,
      imageData.data.byteOffset,
      imageData.data.byteLength
    );
    const tracedSvg = traceBitmap(pixels, crop.width, crop.height, {
      binary: true,
      mode: 'spline',
      hierarchical: 'cutout',
      cornerThreshold: 60,
      lengthThreshold: 2,
      maxIterations: 10,
      spliceThreshold: 45,
      filterSpeckle: 1,
      colorPrecision: 6,
      layerDifference: 16,
      pathPrecision: 2
    });
    const parsed = new DOMParser().parseFromString(tracedSvg, 'image/svg+xml');
    if (parsed.querySelector('parsererror')) {
      throw new Error('VTracer returned invalid paths for the pen stroke.');
    }
    const paths = [...parsed.querySelectorAll('path')];
    if (paths.length === 0) {
      setArtworkMessage('That stroke was too small to vectorize. Try a longer stroke.', true);
      return;
    }

    const additionId = `added-stroke-${state.additions.length + 1}`;
    const group = document.createElementNS(SVG_NS, 'g');
    group.id = additionId;
    group.setAttribute('transform', `translate(${crop.x} ${crop.y})`);
    group.setAttribute('fill', stroke.color);
    if (brushSettings(stroke.style).opacity < 1) {
      group.setAttribute('opacity', String(brushSettings(stroke.style).opacity));
    }
    for (const path of paths) {
      const vectorPath = document.importNode(path, true);
      vectorPath.setAttribute('fill', stroke.color);
      group.appendChild(vectorPath);
    }
    state.vectorSvg.appendChild(group);

    state.additions.push({
      id: additionId,
      centerline: {
        d: smoothPath(stroke.points),
        width: maximumBrushWidth(stroke) * 1.3
      }
    });
    state.svg = new XMLSerializer().serializeToString(state.vectorSvg);
    elements.drawingCanvas.getContext('2d').clearRect(
      0,
      0,
      elements.drawingCanvas.width,
      elements.drawingCanvas.height
    );
    elements.undoDrawing.disabled = false;
    setArtworkMessage('Stroke vectorized and added to the artwork.');
  } catch (error) {
    setArtworkMessage(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.busy = false;
    clearStageLoading();
    updateButtons();
  }
}

function startStroke(event) {
  if (!state.drawingMode || state.busy || event.button !== 0) return;
  event.preventDefault();
  const viewBox = state.vectorSvg.viewBox.baseVal;
  const sourceWidth = Number(state.vectorSvg.getAttribute('width')) || viewBox.width / UPSCALE;
  const brushScale = viewBox.width / sourceWidth;
  state.currentStroke = {
    points: [pointFromPointer(event)],
    width: Number(elements.brushSize.value) * brushScale,
    color: elements.brushColor.value,
    style: elements.brushStyle.value
  };
  elements.drawingCanvas.setPointerCapture(event.pointerId);
  drawCurrentStroke();
}

function continueStroke(event) {
  if (!state.currentStroke) return;
  event.preventDefault();
  const point = pointFromPointer(event);
  const previous = state.currentStroke.points[state.currentStroke.points.length - 1];
  if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.7) return;
  state.currentStroke.points.push(point);
  drawCurrentStroke();
}

function finishStroke(event) {
  if (!state.currentStroke) return;
  if (event && elements.drawingCanvas.hasPointerCapture(event.pointerId)) {
    elements.drawingCanvas.releasePointerCapture(event.pointerId);
  }
  const stroke = state.currentStroke;
  state.currentStroke = null;
  void vectorizeStroke(stroke);
}

function setDrawingMode(enabled) {
  if (!state.svg || state.busy) return;
  stopAnimation();
  mountSvg(parseSvg(state.svg));
  state.drawingMode = enabled;
  elements.drawingCanvas.hidden = !enabled;
  elements.zoomControls.hidden = !enabled;
  elements.vectorPreview.classList.toggle('is-drawing', enabled);
  if (!enabled) resetZoom();
  // Keep the reference drawer available whenever artwork exists so its
  // opacity/source controls do not appear to disappear between draw sessions.
  setReferenceControlsVisible(Boolean(state.svg));
  elements.sourceRailToggle.hidden = !enabled && !state.sourceRailCollapsed;
  if (enabled) {
    setSourceRailCollapsed(elements.showReference.checked);
  } else if (!elements.showReference.checked) {
    state.sourceRailCollapsed = false;
    elements.sourcePreviewStage.closest('.previews').classList.remove('source-rail-collapsed');
    elements.sourceRailHandle.hidden = true;
  }
  updateDrawingButtonLabel();
  setArtworkMessage(
    enabled
      ? 'Use the pen or mouse on the artwork. Every completed stroke becomes a vector.'
      : 'Drawn strokes are vectorized when you lift the pen.'
  );
}

function undoLastStroke() {
  if (!state.svg || state.additions.length === 0 || state.busy) return;
  if (state.drawingMode) setDrawingMode(false);
  else mountSvg(parseSvg(state.svg));
  const addition = state.additions.pop();
  const group = state.vectorSvg.querySelector(`#${addition.id}`);
  if (group) group.remove();
  state.svg = new XMLSerializer().serializeToString(state.vectorSvg);
  elements.undoDrawing.disabled = state.additions.length === 0;
  setArtworkMessage('Removed the last vectorized stroke.');
}

function getBaseCenterlines() {
  if (state.baseCenterlines) return state.baseCenterlines;
  if (!state.mask) return [];

  const binaryMap = new Uint8Array(state.mask.data.length);
  for (let i = 0; i < state.mask.data.length; i++) {
    binaryMap[i] = state.mask.data[i] ? 0 : 255;
  }
  const result = Vectorizer.vectorize(
    binaryMap,
    state.mask.width,
    state.mask.height,
    {
      simplification: 2.2,
      minStrokeLength: 16,
      bezierSmoothing: true,
      defaultStrokeWidth: 8
    }
  );
  state.baseCenterlines = result.paths.map((path) => ({
    d: path.d,
    width: Math.max(12, path.strokeWidth * 2)
  }));
  return state.baseCenterlines;
}

function prepareReveal() {
  state.drawingMode = false;
  updateDrawingButtonLabel();
  const style = elements.animationStyle.value;
  const centerlines = [];
  if (style === 'pen-sketch' || style === 'sequential') {
    centerlines.push(
      ...getBaseCenterlines(),
      ...state.additions.map((addition) => addition.centerline)
    );
    if (centerlines.length === 0) {
      throw new Error('No pen paths were found to animate in this artwork.');
    }
  }

  const { root, reveal } = createRevealSvg(state.svg, centerlines, style);
  mountSvg(root);
  initializeReveal(reveal);
  state.reveal = reveal;
  return root;
}

/** Mounts the plain artwork with a canvas on top for the ink styles, sized to the on-screen viewport. */
function prepareInkReveal() {
  state.drawingMode = false;
  updateDrawingButtonLabel();
  const reveal = createInkReveal(state.svg, elements.animationStyle.value);
  mountSvg(parseSvg(state.svg));
  const canvas = document.createElement('canvas');
  canvas.className = 'ink-reveal-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  elements.vectorViewport.appendChild(canvas);
  const rect = elements.vectorViewport.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(2, Math.round((rect.width || reveal.width) * dpr));
  canvas.width = width;
  canvas.height = Math.max(2, Math.round(width * reveal.height / reveal.width));
  state.reveal = null;
  return { reveal, context: canvas.getContext('2d') };
}

function stopAnimation() {
  if (state.animationFrameId !== null) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
}

async function playReveal() {
  if (!state.svg || state.busy) return;
  const label = animationLabel();
  stopAnimation();
  state.busy = true;
  updateButtons();
  setArtworkMessage('Preparing the selected animation…');
  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    if (isInkStyle(elements.animationStyle.value)) {
      const { reveal, context } = prepareInkReveal();
      const duration = Number(elements.animationDuration.value);
      reveal.render(context, 0, duration);
      const startedAt = performance.now();
      const frame = (timestamp) => {
        const time = Math.min(duration, (timestamp - startedAt) / 1000);
        reveal.render(context, time, duration);
        if (time < duration) {
          state.animationFrameId = requestAnimationFrame(frame);
        } else {
          state.animationFrameId = null;
          setArtworkMessage(`${label} animation complete.`);
        }
      };
      state.busy = false;
      updateButtons();
      state.animationFrameId = requestAnimationFrame(frame);
      return;
    }
    prepareReveal();
    const duration = Number(elements.animationDuration.value);
    setRevealProgress(state.reveal, 0, duration);
    const startedAt = performance.now();
    const frame = (timestamp) => {
      const time = Math.min(duration, (timestamp - startedAt) / 1000);
      setRevealProgress(state.reveal, time, duration);
      if (time < duration) {
        state.animationFrameId = requestAnimationFrame(frame);
      } else {
        state.animationFrameId = null;
        setArtworkMessage(`${label} animation complete.`);
      }
    };
    state.busy = false;
    updateButtons();
    state.animationFrameId = requestAnimationFrame(frame);
  } catch (error) {
    setArtworkMessage(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.busy = false;
    updateButtons();
  }
}

function reportRecording(label, progress) {
  setArtworkMessage(`Recording ${label.toLowerCase()}… ${Math.round(progress * 100)}%`);
  setStageLoading(`Recording ${label.toLowerCase()}…`, { progress });
}

async function recordAnimation() {
  if (!state.svg || state.busy) return;
  const label = animationLabel();
  stopAnimation();
  state.busy = true;
  updateButtons();
  elements.downloadWebM.hidden = true;
  if (state.webmUrl) {
    URL.revokeObjectURL(state.webmUrl);
    state.webmUrl = null;
  }
  setArtworkMessage(`Preparing the ${label.toLowerCase()} recording…`);
  setStageLoading(`Preparing ${label.toLowerCase()} recording…`, { progress: null });
  // let the message paint; the timeout keeps recording from stalling when the tab is hidden (no animation frames run)
  await nextPaint();

  try {
    if (isInkStyle(elements.animationStyle.value)) {
      const { reveal, context } = prepareInkReveal();
      const duration = Number(elements.animationDuration.value);
      reveal.render(context, duration, duration);
      const blob = await recordInkWebM(
        createInkReveal(state.svg, elements.animationStyle.value),
        duration,
        Number(elements.animationHold.value),
        (progress) => reportRecording(label, progress)
      );
      state.webmUrl = URL.createObjectURL(blob);
      elements.downloadWebM.href = state.webmUrl;
      elements.downloadWebM.hidden = false;
      setArtworkMessage('WebM recording is ready to download.');
      return;
    }
    const root = prepareReveal();
    const blob = await recordWebM(
      root,
      state.reveal,
      Number(elements.animationDuration.value),
      Number(elements.animationHold.value),
      (progress) => reportRecording(label, progress)
    );
    state.webmUrl = URL.createObjectURL(blob);
    elements.downloadWebM.href = state.webmUrl;
    elements.downloadWebM.hidden = false;
    setArtworkMessage('WebM recording is ready to download.');
  } catch (error) {
    setArtworkMessage(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.busy = false;
    clearStageLoading();
    updateButtons();
  }
}

elements.imageUpload.addEventListener('change', (event) => {
  loadImage(event.currentTarget.files?.[0]);
});

elements.enhanceFaces.addEventListener('change', () => {
  if (!elements.enhanceFaces.checked) {
    state.faceRegions = [];
    elements.roiStatus.textContent = 'Draw rectangles on the source image. Move them by dragging inside, or resize them with their handles.';
  } else {
    elements.roiStatus.textContent = 'Face detection runs locally when you generate the SVG.';
  }
  refreshRoiCanvas();
});
elements.enableRoi.addEventListener('change', () => {
  state.currentRoi = null;
  state.activeRoiEdit = null;
  elements.roiStatus.textContent = elements.enableRoi.checked
    ? 'Drag on empty image space to add a region. Drag inside to move it, or use its handles to resize it.'
    : state.manualRegions.length > 0
      ? 'Custom regions are saved but will not be enhanced while this is off.'
      : 'Custom regions are off. Enable this option to draw, move, and resize detail regions.';
  refreshRoiCanvas();
});
elements.emphasizeRois.addEventListener('change', () => {
  if (elements.emphasizeRois.checked) {
    elements.roiStatus.textContent = 'Selected regions will receive denser detail while the rest of the image fades back.';
  } else if (elements.enableRoi.checked) {
    elements.roiStatus.textContent = 'Drag on empty image space to add a region. Drag inside to move it, or use its handles to resize it.';
  }
});
elements.clearRois.addEventListener('click', clearManualRegions);
elements.roiCanvas.addEventListener('pointerdown', startRoiSelection);
elements.roiCanvas.addEventListener('pointermove', (event) => {
  if (state.currentRoi || state.activeRoiEdit || !elements.enableRoi.checked || state.busy) return;
  const point = roiPointFromPointer(event);
  elements.roiCanvas.style.cursor = roiCursor(point ? roiAtPoint(point) : null);
});
elements.roiCanvas.addEventListener('pointermove', continueRoiSelection);
elements.roiCanvas.addEventListener('pointerup', finishRoiSelection);
elements.roiCanvas.addEventListener('pointercancel', finishRoiSelection);
elements.clearBoundary.addEventListener('click', clearBoundary);
elements.boundaryMode.addEventListener('change', () => {
  if (state.boundaryPoints.length >= 3) state.boundaryClosed = true;
  elements.boundaryHelp.textContent = elements.boundaryMode.value === 'points'
    ? 'Click to place points, drag handles to refine them, and click the first point to close the spline. Outside is removed.'
    : 'Draw around the subject on the source image. The stroke is smoothed automatically and closed when you lift the pointer.';
  syncBoundaryText();
  refreshBoundaryCanvas();
});
elements.polygon.addEventListener('input', () => {
  state.boundaryPoints = [];
  state.boundaryClosed = false;
  state.currentBoundaryStroke = null;
  refreshBoundaryCanvas();
  updateButtons();
});
elements.boundaryCanvas.addEventListener('pointerdown', startBoundaryEdit);
elements.boundaryCanvas.addEventListener('pointermove', continueBoundaryEdit);
elements.boundaryCanvas.addEventListener('pointerup', finishBoundaryEdit);
elements.boundaryCanvas.addEventListener('pointercancel', finishBoundaryEdit);

for (const [input, output, suffix] of [
  [elements.sigma, elements.sigmaValue, ''],
  [elements.epsilon, elements.epsilonValue, ''],
  [elements.minArea, elements.minAreaValue, ' px']
]) {
  input.addEventListener('input', () => {
    output.value = `${input.value}${suffix}`;
  });
}

elements.brushSize.addEventListener('input', () => {
  elements.brushSizeValue.value = `${elements.brushSize.value} px`;
});
elements.brushStyle.addEventListener('change', updateDrawingButtonIcon);
elements.animationDuration.addEventListener('input', () => {
  elements.animationDurationValue.value = `${elements.animationDuration.value} s`;
});
elements.animationHold.addEventListener('input', () => {
  elements.animationHoldValue.value = `${elements.animationHold.value} s`;
});
elements.traceButton.addEventListener('click', generateSvg);
elements.downloadButton.addEventListener('click', () => {
  if (state.svg) {
    downloadBlob(new Blob([state.svg], { type: 'image/svg+xml' }), 'lineart.svg');
  }
});
elements.toggleDrawing.addEventListener('click', () => {
  setDrawingMode(!state.drawingMode);
});
elements.sourceRailToggle.addEventListener('click', () => {
  setSourceRailCollapsed(!state.sourceRailCollapsed);
});
elements.sourceRailHandle.addEventListener('click', () => {
  setSourceRailCollapsed(false);
});
// Zoom: wheel / trackpad pinch (ctrl+wheel) zoom the canvas only.
elements.vectorPreview.addEventListener('wheel', (event) => {
  if (!state.drawingMode) return;
  event.preventDefault();
  let delta = event.deltaY;
  if (event.deltaMode === 1) delta *= 16;
  else if (event.deltaMode === 2) delta *= 400;
  const speed = event.ctrlKey ? 0.01 : 0.0018;
  zoomAt(zoom.scale * Math.exp(-delta * speed), event.clientX, event.clientY);
}, { passive: false });

// Pan: middle mouse, Space + drag, or two fingers. Registered in the capture
// phase so a pan/pinch never starts a pen stroke.
elements.vectorPreview.addEventListener('pointerdown', (event) => {
  if (!state.drawingMode || event.target.closest('button, .zoom-controls')) return;
  zoom.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (event.pointerType === 'touch' && zoom.pointers.size >= 2) {
    event.stopPropagation();
    event.preventDefault();
    cancelCurrentStroke();
    zoom.pan = null;
    const { distance, x, y } = pinchMetrics();
    zoom.pinch = { distance, x, y };
    return;
  }
  if (event.button === 1 || (event.button === 0 && zoom.space)) {
    event.stopPropagation();
    event.preventDefault();
    zoom.pan = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try {
      elements.vectorPreview.setPointerCapture(event.pointerId);
    } catch {
      // The pointer ended before capture; panning still works while it moves over the preview.
    }
    elements.vectorPreview.classList.add('is-panning');
  }
}, true);

elements.vectorPreview.addEventListener('pointermove', (event) => {
  const tracked = zoom.pointers.get(event.pointerId);
  if (tracked) {
    tracked.x = event.clientX;
    tracked.y = event.clientY;
  }
  if (zoom.pinch && zoom.pointers.size >= 2) {
    event.stopPropagation();
    const next = pinchMetrics();
    zoomAt(zoom.scale * next.distance / zoom.pinch.distance, next.x, next.y);
    zoom.x += next.x - zoom.pinch.x;
    zoom.y += next.y - zoom.pinch.y;
    clampZoomPan();
    applyZoom();
    zoom.pinch = next;
  } else if (zoom.pan && zoom.pan.id === event.pointerId) {
    event.stopPropagation();
    zoom.x += event.clientX - zoom.pan.x;
    zoom.y += event.clientY - zoom.pan.y;
    zoom.pan.x = event.clientX;
    zoom.pan.y = event.clientY;
    clampZoomPan();
    applyZoom();
  }
}, true);

function endZoomPointer(event) {
  zoom.pointers.delete(event.pointerId);
  if (zoom.pinch && zoom.pointers.size < 2) zoom.pinch = null;
  if (zoom.pan && zoom.pan.id === event.pointerId) {
    zoom.pan = null;
    elements.vectorPreview.classList.remove('is-panning');
  }
}
elements.vectorPreview.addEventListener('pointerup', endZoomPointer, true);
elements.vectorPreview.addEventListener('pointercancel', endZoomPointer, true);

elements.zoomIn.addEventListener('click', () => zoomAtPreviewCenter(1.25));
elements.zoomOut.addEventListener('click', () => zoomAtPreviewCenter(1 / 1.25));
elements.zoomReset.addEventListener('click', resetZoom);

function setSpaceHeld(held) {
  zoom.space = held;
  elements.vectorPreview.classList.toggle('is-space', held);
}
window.addEventListener('keydown', (event) => {
  if (!state.drawingMode || isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space' && !event.target.closest?.('button')) {
    event.preventDefault();
    setSpaceHeld(true);
  } else if (event.key === '+' || event.key === '=') {
    zoomAtPreviewCenter(1.25);
  } else if (event.key === '-' || event.key === '_') {
    zoomAtPreviewCenter(1 / 1.25);
  } else if (event.key === '0') {
    resetZoom();
  }
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') setSpaceHeld(false);
});
window.addEventListener('blur', () => setSpaceHeld(false));

// Drag & drop an image onto the upload card. Dragging a file anywhere over the
// window highlights the card (and reopens a collapsed controls drawer) so the
// drop target is obvious; dropping elsewhere is ignored instead of making the
// browser navigate away to the image.
function dragHasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}
let windowDragDepth = 0;
function clearDropHints() {
  windowDragDepth = 0;
  elements.uploadCard.classList.remove('is-drop-ready', 'is-dragover');
}
window.addEventListener('dragenter', (event) => {
  if (!dragHasFiles(event)) return;
  event.preventDefault();
  windowDragDepth += 1;
  elements.uploadCard.classList.add('is-drop-ready');
  if (state.drawerCollapsed) setDrawerCollapsed(false, true);
});
window.addEventListener('dragover', (event) => {
  if (!dragHasFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = elements.uploadCard.contains(event.target) ? 'copy' : 'none';
  elements.uploadCard.classList.toggle('is-dragover', elements.uploadCard.contains(event.target));
});
window.addEventListener('dragleave', () => {
  windowDragDepth = Math.max(0, windowDragDepth - 1);
  if (windowDragDepth === 0) clearDropHints();
});
window.addEventListener('drop', (event) => {
  if (!dragHasFiles(event)) return;
  event.preventDefault();
  const onCard = elements.uploadCard.contains(event.target);
  clearDropHints();
  if (!onCard) return;
  const files = Array.from(event.dataTransfer.files);
  const file = files.find((item) => item.type.startsWith('image/')) ?? files[0];
  if (state.busy) {
    setMessage('Wait for the current job to finish before loading another image.', true);
    return;
  }
  loadImage(file);
});
window.addEventListener('dragend', clearDropHints);

let actionsHome = null;
function toggleVectorFullscreen() {
  if (document.fullscreenElement === elements.vectorCard) {
    void document.exitFullscreen();
  } else if (elements.vectorCard.requestFullscreen) {
    void elements.vectorCard.requestFullscreen().catch(() => {});
  }
}
elements.fullscreenToggle.addEventListener('click', toggleVectorFullscreen);
document.addEventListener('fullscreenchange', () => {
  const active = document.fullscreenElement === elements.vectorCard;
  const label = active ? 'Exit full screen' : 'Enter full screen';
  elements.fullscreenToggle.setAttribute('aria-label', label);
  elements.fullscreenToggle.dataset.tooltip = `${active ? 'Exit full screen (Esc)' : 'Full screen (F)'}`;
  document.getElementById('fullscreen-icon-path').setAttribute('d', active
    ? 'M7 5h2v4H5V7h2V5zm8 0h2v2h2v2h-4V5zM5 15h4v4H7v-2H5v-2zm10 0h4v2h-2v2h-2v-4z'
    : 'M5 5h5v2H7v3H5V5zm9 0h5v5h-2V7h-3V5zM5 14h2v3h3v2H5v-5zm12 0h2v5h-5v-2h3v-3z');
  // Carry the drawing/overlay/animation tools into the full-screen view so
  // they stay reachable, then return them to the workspace on exit.
  if (active) {
    actionsHome = document.createComment('artwork-actions');
    elements.artworkActions.before(actionsHome);
    elements.vectorCard.append(elements.artworkActions);
  } else if (actionsHome) {
    actionsHome.replaceWith(elements.artworkActions);
    actionsHome = null;
  }
  resizeVectorStage();
  window.setTimeout(resizeVectorStage, 120);
});
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (elements.fullscreenToggle.hidden) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
  toggleVectorFullscreen();
});
elements.closeDrawer.addEventListener('click', () => setDrawerCollapsed(true));
elements.openDrawer.addEventListener('click', () => setDrawerCollapsed(false));
elements.showReference.addEventListener('change', () => {
  refreshReferenceOverlay();
  setSourceRailCollapsed(elements.showReference.checked, { notify: true });
});
elements.railToastUndo.addEventListener('click', () => {
  setSourceRailCollapsed(false);
});
elements.referenceOpacity.addEventListener('input', () => {
  elements.referenceOpacityValue.value = `${elements.referenceOpacity.value}%`;
  refreshReferenceOverlay();
});
elements.referenceUpload.addEventListener('change', (event) => {
  loadReferenceImage(event.currentTarget.files?.[0]);
});
elements.useSourceReference.addEventListener('click', useSourceReference);
elements.controlsDrawer.addEventListener('mouseleave', () => {
  if (state.drawerAutoOpened) setDrawerCollapsed(true);
});
elements.undoDrawing.addEventListener('click', undoLastStroke);
elements.playAnimation.addEventListener('click', playReveal);
elements.recordWebM.addEventListener('click', recordAnimation);
elements.drawingCanvas.addEventListener('pointerdown', startStroke);
elements.drawingCanvas.addEventListener('pointermove', continueStroke);
elements.drawingCanvas.addEventListener('pointerup', finishStroke);
elements.drawingCanvas.addEventListener('pointercancel', finishStroke);
updateDrawingButtonIcon();
window.addEventListener('resize', () => {
  if (window.matchMedia('(max-width: 760px)').matches && state.drawerCollapsed) {
    state.drawerCollapsed = false;
    state.drawerAutoOpened = false;
    elements.appLayout.classList.remove('is-drawer-collapsed');
    elements.openDrawer.setAttribute('aria-expanded', 'true');
    elements.openDrawer.hidden = true;
  }
  resizeVectorStage();
  resizeRoiCanvas();
});
function revealDrawerAtEdge(event) {
  if (state.drawerCollapsed && event.clientX <= 20) setDrawerCollapsed(false, true);
}

window.addEventListener('mousemove', revealDrawerAtEdge);
window.addEventListener('pointermove', revealDrawerAtEdge);

Promise.all([
  loadOpenCv(),
  initVTracer({ module_or_path: new URL('../node_modules/vtracer-wasm/vtracer.wasm', import.meta.url) })
]).then(([cv]) => {
  state.cv = cv;
  elements.engineStatus.textContent = 'Ready';
  elements.engineStatus.classList.add('is-ready');
  updateButtons();
}).catch((error) => {
  elements.engineStatus.textContent = 'Image tools unavailable';
  elements.engineStatus.classList.add('is-error');
  setMessage(error instanceof Error ? error.message : String(error), true);
});
