/**
 * Animation Engine
 * Handles real-time SVG animation playback, including:
 * 1. Self-drawing (stroke-dasharray / stroke-dashoffset write-on effect)
 * 2. Skeletal & puppet rigging transforms (breathing, head nod/tilt, eye blink, hair sway, talking)
 * 3. Hand-drawn line boil jitter (wobble)
 * 4. Interactive 2.5D mouse parallax
 * 5. Timeline scrubber & transport controls
 */

export class AnimationEngine {
  constructor(editor, options = {}) {
    this.editor = editor;
    this.layerManager = options.layerManager;

    // Transport state
    this.isPlaying = false;
    this.currentTime = 0; // In seconds
    this.duration = 4.0;  // Loop duration in seconds
    this.playbackSpeed = 1.0;
    this.isLooping = true;
    this.pingPong = false;

    // Active animation styles
    this.enableDrawing = true;
    this.drawingOrder = 'natural'; // 'natural', 'topToBottom', 'simultaneous', 'sequential'
    this.drawingEasing = 'easeInOut';

    this.enableRigging = true;
    this.riggingParams = {
      breatheIntensity: 1.0,
      nodIntensity: 1.0,
      hairSwayIntensity: 1.0,
      blinkEnabled: true,
      talkEnabled: false
    };

    this.enableLineBoil = false;
    this.lineBoilFps = 12;
    this.lineBoilIntensity = 1.5;

    this.enableMouseParallax = false;
    this.mouseOffset = { x: 0, y: 0 };
    this.smoothMouse = { x: 0, y: 0 };

    this.lastTimestamp = 0;
    this.animationFrameId = null;
    this.listeners = new Set();

    // Cache path total lengths
    this.pathLengths = new Map();

    this.initMouseTracking();
    this.initLineBoilFilter();
  }

  initMouseTracking() {
    window.addEventListener('mousemove', (e) => {
      if (!this.enableMouseParallax) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.mouseOffset = {
        x: (e.clientX / w - 0.5) * 2, // -1 .. 1
        y: (e.clientY / h - 0.5) * 2
      };
    });
  }

  initLineBoilFilter() {
    // Add SVG turbulence filter for authentic 2D boil
    let filter = this.editor.svg.querySelector('#lineBoilFilter');
    if (!filter) {
      const defs = this.editor.svg.querySelector('defs') || this.editor.svg;
      const filterEl = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filterEl.setAttribute('id', 'lineBoilFilter');
      filterEl.setAttribute('x', '-10%');
      filterEl.setAttribute('y', '-10%');
      filterEl.setAttribute('width', '120%');
      filterEl.setAttribute('height', '120%');

      filterEl.innerHTML = `
        <feTurbulence id="boilTurbulence" type="fractalNoise" baseFrequency="0.04" numOctaves="2" result="noise" seed="1"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/>
      `;
      defs.appendChild(filterEl);
    }
  }

  cachePathLengths() {
    this.pathLengths.clear();
    const svgPaths = this.editor.layersRoot.querySelectorAll('path');
    for (const p of svgPaths) {
      try {
        const len = p.getTotalLength();
        this.pathLengths.set(p.id, Math.max(1, len));
      } catch (err) {
        this.pathLengths.set(p.id, 100);
      }
    }
  }

  play() {
    if (this.isPlaying) return;
    this.cachePathLengths();
    this.isPlaying = true;
    this.lastTimestamp = performance.now();
    this.tick(this.lastTimestamp);
    this.notify();
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.notify();
  }

  stop() {
    this.pause();
    this.currentTime = 0;
    this.updateFrame(0);
    this.resetAll();
    this.notify();
  }

  /** Puts every stroke back to its resting, fully drawn state. */
  resetAll() {
    this.resetDrawingStyles();
    this.resetRiggingTransforms();
    this.editor.layersRoot.removeAttribute('filter');
  }

  toggle() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  seek(time) {
    this.currentTime = Math.max(0, Math.min(this.duration, time));
    this.cachePathLengths();
    this.updateFrame(this.currentTime);
    this.notify();
  }

  tick(timestamp) {
    if (!this.isPlaying) return;

    const dt = (timestamp - this.lastTimestamp) / 1000.0;
    this.lastTimestamp = timestamp;

    this.currentTime += dt * this.playbackSpeed;

    if (this.currentTime >= this.duration) {
      if (this.isLooping) {
        this.currentTime = this.currentTime % this.duration;
      } else {
        this.currentTime = this.duration;
        this.updateFrame(this.currentTime);
        this.pause();
        return;
      }
    }

    this.updateFrame(this.currentTime);
    this.notify();

    this.animationFrameId = requestAnimationFrame((t) => this.tick(t));
  }

  updateFrame(t) {
    // 1. Mouse Parallax smoothing
    if (this.enableMouseParallax) {
      this.smoothMouse.x += (this.mouseOffset.x - this.smoothMouse.x) * 0.1;
      this.smoothMouse.y += (this.mouseOffset.y - this.smoothMouse.y) * 0.1;
    }

    // 2. Self-Drawing Stroke Dashoffset
    if (this.enableDrawing) {
      this.applyDrawingFrame(t);
    } else {
      this.resetDrawingStyles();
    }

    // 3. Puppet / Kinematic Rigging
    if (this.enableRigging) {
      this.applyRiggingFrame(t);
    } else {
      this.resetRiggingTransforms();
    }

    // 4. Line Boil Jitter
    if (this.enableLineBoil) {
      this.applyLineBoilFrame(t);
    } else {
      this.editor.layersRoot.removeAttribute('filter');
    }
  }

  applyDrawingFrame(t) {
    const normT = Math.max(0, Math.min(1, t / this.duration));
    const paths = this.editor.paths;
    if (paths.length === 0) return;

    // Sorting paths based on selected draw order
    const ordered = this.getOrderedPaths();
    const count = ordered.length;

    for (let i = 0; i < count; i++) {
      const p = ordered[i];
      const pathEl = this.editor.layersRoot.querySelector(`path#${p.id}`);
      if (!pathEl) continue;

      const totalLen = this.pathLengths.get(p.id) || p.length || 100;
      let strokeProgress = 1;

      if (this.drawingOrder === 'simultaneous') {
        strokeProgress = this.ease(normT, this.drawingEasing);
      } else {
        // Sequential or Staggered
        const staggerWindow = 0.45; // Fraction of time each stroke takes
        const startFraction = (i / count) * (1 - staggerWindow);
        const endFraction = startFraction + staggerWindow;

        if (normT <= startFraction) {
          strokeProgress = 0;
        } else if (normT >= endFraction) {
          strokeProgress = 1;
        } else {
          const localT = (normT - startFraction) / staggerWindow;
          strokeProgress = this.ease(localT, this.drawingEasing);
        }
      }

      const offset = totalLen * (1 - strokeProgress);
      pathEl.style.strokeDasharray = `${totalLen}`;
      pathEl.style.strokeDashoffset = `${offset}`;
    }
  }

  getOrderedPaths() {
    const paths = [...this.editor.paths];

    if (this.drawingOrder === 'natural') {
      // Order: face contour -> eyes -> brows -> nose -> mouth -> hair -> torso -> custom
      const layerRank = { face: 1, eyes: 2, nose: 3, mouth: 4, hair: 5, torso: 6, custom: 7 };
      return paths.sort((a, b) => {
        const rA = layerRank[a.layerId] || 99;
        const rB = layerRank[b.layerId] || 99;
        if (rA !== rB) return rA - rB;
        return a.centroid.y - b.centroid.y;
      });
    } else if (this.drawingOrder === 'topToBottom') {
      return paths.sort((a, b) => a.centroid.y - b.centroid.y);
    } else if (this.drawingOrder === 'sequential') {
      return paths;
    }

    return paths;
  }

  resetDrawingStyles() {
    const svgPaths = this.editor.layersRoot.querySelectorAll('path');
    for (const p of svgPaths) {
      p.style.strokeDasharray = '';
      p.style.strokeDashoffset = '';
    }
  }

  applyRiggingFrame(t) {
    const layers = this.layerManager ? this.layerManager.layers : [];
    const w = this.editor.width;
    const h = this.editor.height;

    // Harmonic frequencies
    const breatheOmega = (2 * Math.PI) / 3.2;  // ~3.2s breath cycle
    const nodOmega = (2 * Math.PI) / 2.4;      // ~2.4s head nod cycle
    const swayOmega = (2 * Math.PI) / 2.0;     // ~2.0s hair sway cycle

    const breatheSin = Math.sin(t * breatheOmega);
    const nodSin = Math.sin(t * nodOmega);
    const nodCos = Math.cos(t * nodOmega * 0.7);
    const swaySin = Math.sin(t * swayOmega);

    // Blinking logic: 150ms blink every 3.5s
    const blinkCycle = t % 3.5;
    let blinkScaleY = 1.0;
    if (this.riggingParams.blinkEnabled) {
      if (blinkCycle < 0.14) {
        // Closing and reopening
        blinkScaleY = Math.abs(Math.sin((blinkCycle / 0.14) * Math.PI));
        blinkScaleY = Math.max(0.05, blinkScaleY);
      }
    }

    // Talking logic: periodic mouth scale
    let talkScaleY = 1.0;
    if (this.riggingParams.talkEnabled) {
      talkScaleY = 1.0 + Math.abs(Math.sin(t * 8.0)) * 0.25;
    }

    for (const layer of layers) {
      const g = this.editor.layersRoot.querySelector(`#layer-group-${layer.id}`);
      if (!g) continue;

      const px = layer.pivot.x * w;
      const py = layer.pivot.y * h;

      // Base parallax translation
      let tx = this.smoothMouse.x * (layer.parallaxFactor || 1.0) * 12;
      let ty = this.smoothMouse.y * (layer.parallaxFactor || 1.0) * 8;
      let rot = 0;
      let sx = 1.0;
      let sy = 1.0;

      // Layer-specific motions
      if (layer.id === 'torso') {
        // Chest rise & expansion
        const bInt = this.riggingParams.breatheIntensity;
        sy = 1.0 + breatheSin * 0.025 * bInt;
        sx = 1.0 + breatheSin * 0.015 * bInt;
      } else if (layer.id === 'face' || layer.id === 'nose') {
        // Head subtle nod & tilt
        const nInt = this.riggingParams.nodIntensity;
        rot = (nodSin * 2.2 + nodCos * 1.0) * nInt;
        ty += breatheSin * 3.5 * this.riggingParams.breatheIntensity; // Follow torso breath
      } else if (layer.id === 'hair') {
        // Hair sway + head follow
        const sInt = this.riggingParams.hairSwayIntensity;
        rot = (nodSin * 2.0 + swaySin * 2.8 * sInt);
        tx += swaySin * 3.5 * sInt;
        ty += breatheSin * 3.5 * this.riggingParams.breatheIntensity;
      } else if (layer.id === 'eyes') {
        // Head follow + blink
        rot = nodSin * 2.2 * this.riggingParams.nodIntensity;
        ty += breatheSin * 3.5 * this.riggingParams.breatheIntensity;
        sy = blinkScaleY;
      } else if (layer.id === 'mouth') {
        // Head follow + speech sync
        rot = nodSin * 2.2 * this.riggingParams.nodIntensity;
        ty += breatheSin * 3.5 * this.riggingParams.breatheIntensity;
        sy = talkScaleY;
      }

      // Apply SVG transform around pivot
      g.setAttribute(
        'transform',
        `translate(${tx.toFixed(2)}, ${ty.toFixed(2)}) translate(${px.toFixed(1)}, ${py.toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(4)}, ${sy.toFixed(4)}) translate(-${px.toFixed(1)}, -${py.toFixed(1)})`
      );
    }
  }

  resetRiggingTransforms() {
    const groups = this.editor.layersRoot.querySelectorAll('g[id^="layer-group-"]');
    for (const g of groups) {
      g.removeAttribute('transform');
    }
  }

  applyLineBoilFrame(t) {
    // Stepped frame rate (e.g. 12fps)
    const frameNumber = Math.floor(t * this.lineBoilFps);
    const turb = this.editor.svg.querySelector('#boilTurbulence');
    if (turb) {
      turb.setAttribute('seed', (frameNumber % 20 + 1).toString());
    }
    this.editor.layersRoot.setAttribute('filter', 'url(#lineBoilFilter)');
  }

  ease(x, type = 'easeInOut') {
    if (type === 'linear') return x;
    if (type === 'easeIn') return x * x;
    if (type === 'easeOut') return 1 - (1 - x) * (1 - x);
    // easeInOut
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const cb of this.listeners) {
      cb({
        isPlaying: this.isPlaying,
        currentTime: this.currentTime,
        duration: this.duration,
        progress: this.currentTime / this.duration
      });
    }
  }
}
