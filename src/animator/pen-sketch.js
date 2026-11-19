import { canEncodeFrames, encodeFramesToWebM } from './webm-writer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createRevealSvg(staticSvg, centerlines, style = 'pen-sketch') {
  const parsed = new DOMParser().parseFromString(staticSvg, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') {
    throw new Error('Could not prepare the SVG for the pen-sketch reveal.');
  }

  const root = document.importNode(parsed.documentElement, true);
  const viewBox = root.viewBox.baseVal;
  const defs = root.querySelector('defs') || document.createElementNS(SVG_NS, 'defs');
  if (!defs.parentNode) root.insertBefore(defs, root.firstChild);

  const maskId = `reveal-mask-${Date.now()}`;
  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.id = maskId;
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('mask-type', 'luminance');
  mask.setAttribute('x', String(viewBox.x));
  mask.setAttribute('y', String(viewBox.y));
  mask.setAttribute('width', String(viewBox.width));
  mask.setAttribute('height', String(viewBox.height));

  const reveal = { style, paths: [], printer: null, diagonal: null };
  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('x', String(viewBox.x));
  background.setAttribute('y', String(viewBox.y));
  background.setAttribute('width', String(viewBox.width));
  background.setAttribute('height', String(viewBox.height));
  background.setAttribute('fill', '#000');
  mask.appendChild(background);

  if (style === 'printer') {
    const rows = Math.max(1, Math.min(240, Math.ceil(viewBox.height / 4)));
    const rowHeight = viewBox.height / rows;
    const completed = document.createElementNS(SVG_NS, 'rect');
    completed.setAttribute('x', String(viewBox.x));
    completed.setAttribute('y', String(viewBox.y));
    completed.setAttribute('width', String(viewBox.width));
    completed.setAttribute('height', '0');
    completed.setAttribute('fill', '#fff');
    const currentRow = document.createElementNS(SVG_NS, 'rect');
    currentRow.setAttribute('x', String(viewBox.x));
    currentRow.setAttribute('y', String(viewBox.y));
    currentRow.setAttribute('width', '0');
    currentRow.setAttribute('height', String(rowHeight));
    currentRow.setAttribute('fill', '#fff');
    mask.appendChild(completed);
    mask.appendChild(currentRow);
    reveal.printer = {
      completed, currentRow, rows, rowHeight,
      x: viewBox.x, y: viewBox.y, width: viewBox.width
    };
  } else if (style === 'diagonal') {
    const gradient = document.createElementNS(SVG_NS, 'linearGradient');
    const gradientId = `diagonal-reveal-${Date.now()}`;
    gradient.id = gradientId;
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    gradient.setAttribute('x1', String(viewBox.x));
    gradient.setAttribute('y1', String(viewBox.y));
    gradient.setAttribute('x2', String(viewBox.x + viewBox.width));
    gradient.setAttribute('y2', String(viewBox.y + viewBox.height));
    const leadingStop = document.createElementNS(SVG_NS, 'stop');
    const trailingStop = document.createElementNS(SVG_NS, 'stop');
    gradient.appendChild(leadingStop);
    gradient.appendChild(trailingStop);
    defs.appendChild(gradient);
    const diagonal = document.createElementNS(SVG_NS, 'rect');
    diagonal.setAttribute('x', String(viewBox.x));
    diagonal.setAttribute('y', String(viewBox.y));
    diagonal.setAttribute('width', String(viewBox.width));
    diagonal.setAttribute('height', String(viewBox.height));
    diagonal.setAttribute('fill', `url(#${gradientId})`);
    mask.appendChild(diagonal);
    reveal.diagonal = { leadingStop, trailingStop };
  } else {
    for (const centerline of centerlines) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', centerline.d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', String(centerline.width));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      mask.appendChild(path);
      reveal.paths.push({ element: path, length: 0 });
    }
  }
  defs.appendChild(mask);

  const artwork = document.createElementNS(SVG_NS, 'g');
  artwork.setAttribute('id', 'reveal-artwork');
  artwork.setAttribute('mask', `url(#${maskId})`);
  const children = [...root.childNodes];
  for (const child of children) {
    if (child === defs) continue;
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      child.localName === 'rect' &&
      ['#fff', '#ffffff', 'white'].includes((child.getAttribute('fill') || '').toLowerCase())
    ) {
      continue;
    }
    artwork.appendChild(child);
  }
  root.appendChild(artwork);

  return { root, reveal };
}

export function initializeReveal(reveal) {
  for (const maskPath of reveal.paths) {
    const length = maskPath.element.getTotalLength();
    maskPath.length = Math.max(1, length);
    maskPath.element.setAttribute('stroke-dasharray', String(maskPath.length));
    maskPath.element.setAttribute('stroke-dashoffset', String(maskPath.length));
  }
}

export function setRevealProgress(reveal, time, duration) {
  const progress = duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 1;
  if (reveal.printer) {
    const { completed, currentRow, rows, rowHeight, x, y, width } = reveal.printer;
    const rowProgress = progress * rows;
    const completedRows = Math.min(rows, Math.floor(rowProgress));
    const partialRow = progress >= 1 ? 0 : rowProgress - completedRows;
    completed.setAttribute('height', String(completedRows * rowHeight));
    currentRow.setAttribute('x', String(x));
    currentRow.setAttribute('y', String(y + completedRows * rowHeight));
    currentRow.setAttribute('width', String(partialRow * width));
    currentRow.setAttribute('height', String(completedRows === rows ? 0 : rowHeight));
    return;
  }

  if (reveal.diagonal) {
    const { leadingStop, trailingStop } = reveal.diagonal;
    if (progress === 0) {
      leadingStop.setAttribute('offset', '0%');
      trailingStop.setAttribute('offset', '0%');
      leadingStop.setAttribute('stop-color', '#000');
      trailingStop.setAttribute('stop-color', '#000');
    } else if (progress === 1) {
      leadingStop.setAttribute('offset', '100%');
      trailingStop.setAttribute('offset', '100%');
      leadingStop.setAttribute('stop-color', '#fff');
      trailingStop.setAttribute('stop-color', '#fff');
    } else {
      leadingStop.setAttribute('offset', `${progress * 100}%`);
      trailingStop.setAttribute('offset', `${Math.min(100, (progress + 0.02) * 100)}%`);
      leadingStop.setAttribute('stop-color', '#fff');
      trailingStop.setAttribute('stop-color', '#000');
    }
    return;
  }

  const maskPaths = reveal.paths;
  const count = maskPaths.length;
  if (count === 0) return;

  const durationSafe = Math.max(duration, Number.EPSILON);
  const elapsed = Math.max(0, Math.min(durationSafe, time));
  const strokeWindow = 0.3;
  const step = durationSafe / count;
  const pause = Math.min(0.05, step * 0.15);
  for (let index = 0; index < count; index++) {
    const localProgress = reveal.style === 'sequential'
      ? Math.max(0, Math.min(1, (elapsed - index * step) /
        (index === count - 1 ? step : step - pause)))
      : Math.max(0, Math.min(1, (progress - (index / count * (1 - strokeWindow))) / strokeWindow));
    const eased = localProgress * localProgress * (3 - 2 * localProgress);
    const maskPath = maskPaths[index];
    maskPath.element.setAttribute(
      'stroke-dashoffset',
      String(maskPath.length * (1 - eased))
    );
  }
}

async function renderSvgFrame(svg, context, width, height) {
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not render an animation frame for WebM.'));
      image.src = url;
    });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function recordWebM(
  svg,
  reveal,
  duration,
  holdDuration,
  onProgress = () => {}
) {
  if (canEncodeFrames()) {
    // Frame-exact path: each frame's SVG is fully rasterised for its exact time before it is encoded.
    const viewBox = svg.viewBox.baseVal;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.ceil(viewBox.width / 2) * 2);
    canvas.height = Math.max(2, Math.ceil(viewBox.height / 2) * 2);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a canvas for WebM recording.');
    const fps = 30;
    const blob = await encodeFramesToWebM({
      canvas,
      fps,
      frameCount: Math.max(1, Math.round((duration + holdDuration) * fps)),
      drawFrame: async (i, time) => {
        setRevealProgress(reveal, Math.min(duration, time), duration);
        await renderSvgFrame(svg, context, canvas.width, canvas.height);
      },
      onProgress
    });
    setRevealProgress(reveal, duration, duration);
    return blob;
  }
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    throw new Error('This browser does not support WebM recording.');
  }

  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) {
    throw new Error('This browser cannot encode WebM video.');
  }

  const viewBox = svg.viewBox.baseVal;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewBox.width);
  canvas.height = Math.ceil(viewBox.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas for WebM recording.');

  const totalDuration = duration + holdDuration;
  setRevealProgress(reveal, 0, duration);
  let totalRenderTime = 0;
  for (let frame = 0; frame < 3; frame++) {
    const renderStartedAt = performance.now();
    await renderSvgFrame(svg, context, canvas.width, canvas.height);
    totalRenderTime += performance.now() - renderStartedAt;
  }

  const averageRenderTime = totalRenderTime / 3;
  const fps = Math.max(1, Math.min(15, Math.floor(800 / averageRenderTime)));
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  const recorded = new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error('WebM recording failed.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  try {
    recorder.start();
    const startedAt = performance.now();
    while (true) {
      const recordingTime = Math.min(
        totalDuration,
        (performance.now() - startedAt) / 1000
      );
      const animationTime = Math.min(duration, recordingTime);
      setRevealProgress(reveal, animationTime, duration);
      await renderSvgFrame(svg, context, canvas.width, canvas.height);
      const elapsed = performance.now() - startedAt;
      onProgress(Math.min(1, elapsed / (totalDuration * 1000)));
      if (elapsed >= totalDuration * 1000) break;
      const nextFrameAt = startedAt + (
        (Math.floor(elapsed * fps / 1000) + 1) * 1000 / fps
      );
      const delay = nextFrameAt - performance.now();
      if (delay > 0) await wait(delay);
    }
    setRevealProgress(reveal, duration, duration);
    await renderSvgFrame(svg, context, canvas.width, canvas.height);
    onProgress(1);
    recorder.stop();
    return await recorded;
  } catch (error) {
    if (recorder.state !== 'inactive') recorder.stop();
    throw error;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}
