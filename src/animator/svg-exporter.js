/**
 * SVG Exporter & Video Renderer
 * Exports animated SVG (pure CSS keyframes / SMIL), static clean SVG,
 * interactive web component HTML, WebM video recorder, and JSON project save/load.
 */

export class SvgExporter {
  /**
   * Generates a 100% standalone animated SVG file with embedded CSS keyframes.
   * Works natively in any modern browser, website, or image viewer without JS!
   */
  static exportAnimatedSvg(editor, animationEngine, layerManager) {
    const w = editor.width;
    const h = editor.height;
    const duration = animationEngine.duration || 4.0;
    const isDrawing = animationEngine.enableDrawing;
    const isRigging = animationEngine.enableRigging;
    const isLineBoil = animationEngine.enableLineBoil;

    let cssRules = `
    /* Standalone Animated SVG Stylesheet */
    svg {
      background-color: transparent;
      overflow: visible;
    }
    path {
      will-change: stroke-dashoffset, transform;
    }
    `;

    // 1. Drawing Animation CSS
    if (isDrawing) {
      const ordered = animationEngine.getOrderedPaths();
      const count = ordered.length;
      const staggerWindow = 0.45;

      for (let i = 0; i < count; i++) {
        const p = ordered[i];
        const len = p.length || 100;

        let delay = 0;
        let strokeDuration = duration;

        if (animationEngine.drawingOrder !== 'simultaneous') {
          delay = ((i / count) * (1 - staggerWindow) * duration);
          strokeDuration = (staggerWindow * duration);
        }

        cssRules += `
        #${p.id} {
          stroke-dasharray: ${len};
          stroke-dashoffset: ${len};
          animation: draw_${p.id} ${strokeDuration.toFixed(2)}s ease-in-out ${delay.toFixed(2)}s infinite alternate;
        }
        @keyframes draw_${p.id} {
          0%, 20% { stroke-dashoffset: ${len}; }
          80%, 100% { stroke-dashoffset: 0; }
        }
        `;
      }
    }

    // 2. Skeletal / Puppet Rigging CSS
    if (isRigging) {
      const layers = layerManager ? layerManager.layers : [];
      for (const layer of layers) {
        const px = (layer.pivot.x * w).toFixed(1);
        const py = (layer.pivot.y * h).toFixed(1);

        if (layer.id === 'torso') {
          cssRules += `
          #layer-group-${layer.id} {
            transform-origin: ${px}px ${py}px;
            animation: rig_torso_${layer.id} 3.2s ease-in-out infinite;
          }
          @keyframes rig_torso_${layer.id} {
            0%, 100% { transform: scale(1.0, 1.0); }
            50% { transform: scale(1.015, 1.025); }
          }
          `;
        } else if (layer.id === 'face' || layer.id === 'nose') {
          cssRules += `
          #layer-group-${layer.id} {
            transform-origin: ${px}px ${py}px;
            animation: rig_head_${layer.id} 2.6s ease-in-out infinite;
          }
          @keyframes rig_head_${layer.id} {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(3.5px) rotate(2.0deg); }
          }
          `;
        } else if (layer.id === 'hair') {
          cssRules += `
          #layer-group-${layer.id} {
            transform-origin: ${px}px ${py}px;
            animation: rig_hair_${layer.id} 2.2s ease-in-out infinite;
          }
          @keyframes rig_hair_${layer.id} {
            0%, 100% { transform: translateY(0px) rotate(-1.5deg) skewX(-1deg); }
            50% { transform: translateY(3.5px) rotate(2.5deg) skewX(1.5deg); }
          }
          `;
        } else if (layer.id === 'eyes') {
          cssRules += `
          #layer-group-${layer.id} {
            transform-origin: ${px}px ${py}px;
            animation: rig_eyes_${layer.id} 3.5s ease-in-out infinite;
          }
          @keyframes rig_eyes_${layer.id} {
            0%, 94%, 98%, 100% { transform: translateY(0px) scaleY(1.0); }
            96% { transform: translateY(2px) scaleY(0.05); }
          }
          `;
        } else if (layer.id === 'mouth') {
          cssRules += `
          #layer-group-${layer.id} {
            transform-origin: ${px}px ${py}px;
            animation: rig_mouth_${layer.id} 2.6s ease-in-out infinite;
          }
          @keyframes rig_mouth_${layer.id} {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(3.5px); }
          }
          `;
        }
      }
    }

    // Build SVG structure
    let filterDefs = '';
    let filterAttr = '';
    if (isLineBoil) {
      filterDefs = `
        <filter id="boilFilter" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" result="noise">
            <animate attributeName="seed" from="1" to="20" dur="1s" repeatCount="indefinite" calcMode="discrete"/>
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      `;
      filterAttr = 'filter="url(#boilFilter)"';
    }

    const layerMap = new Map();
    const layers = layerManager ? layerManager.layers : [{ id: 'custom', visible: true, opacity: 1 }];

    for (const l of layers) {
      if (l.visible) {
        layerMap.set(l.id, []);
      }
    }

    for (const p of editor.paths) {
      const list = layerMap.get(p.layerId) || layerMap.get('custom') || [];
      list.push(p);
      if (!layerMap.has(p.layerId)) {
        layerMap.set(p.layerId, list);
      }
    }

    let groupsHtml = '';
    for (const [layerId, pathList] of layerMap.entries()) {
      if (pathList.length === 0) continue;
      const layer = layerManager?.getLayer(layerId);
      const opacity = layer?.opacity !== undefined ? layer.opacity : 1;

      groupsHtml += `  <g id="layer-group-${layerId}" opacity="${opacity}">\n`;
      for (const p of pathList) {
        groupsHtml += `    <path id="${p.id}" d="${p.d}" fill="none" stroke="${p.strokeColor || '#0f172a'}" stroke-width="${p.strokeWidth || 2}" stroke-linecap="${p.strokeCap || 'round'}" stroke-linejoin="${p.strokeJoin || 'round'}" opacity="${p.opacity !== undefined ? p.opacity : 1}" />\n`;
      }
      groupsHtml += `  </g>\n`;
    }

    const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <style type="text/css"><![CDATA[
${cssRules}
    ]]></style>
${filterDefs}
  </defs>
  <g id="artwork-root" ${filterAttr}>
${groupsHtml}
  </g>
</svg>`;

    return svgString;
  }

  /**
   * Generates a clean static SVG string for graphic design and pen plotters.
   */
  static exportStaticSvg(editor, layerManager) {
    const w = editor.width;
    const h = editor.height;
    const layerMap = new Map();
    const layers = layerManager ? layerManager.layers : [];

    for (const l of layers) {
      if (l.visible) layerMap.set(l.id, []);
    }

    for (const p of editor.paths) {
      const list = layerMap.get(p.layerId) || [];
      list.push(p);
      if (!layerMap.has(p.layerId)) layerMap.set(p.layerId, list);
    }

    let groupsHtml = '';
    for (const [layerId, pathList] of layerMap.entries()) {
      if (pathList.length === 0) continue;
      const layer = layerManager?.getLayer(layerId);
      const layerName = layer ? layer.name : layerId;
      groupsHtml += `  <g id="${layerId}" data-name="${this.escapeXml(layerName)}">\n`;
      for (const p of pathList) {
        groupsHtml += `    <path id="${p.id}" d="${p.d}" fill="none" stroke="${p.strokeColor || '#0f172a'}" stroke-width="${p.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
      }
      groupsHtml += `  </g>\n`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
${groupsHtml}
</svg>`;
  }

  /**
   * Generates an interactive web component HTML snippet with mouse parallax.
   */
  static exportInteractiveHtml(editor, animationEngine, layerManager) {
    const animatedSvg = this.exportAnimatedSvg(editor, animationEngine, layerManager);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Interactive Animated Line Art Portrait</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at center, #1e293b, #0f172a);
      font-family: system-ui, sans-serif;
    }
    .portrait-card {
      position: relative;
      max-width: 600px;
      width: 90vw;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
      padding: 24px;
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
    }
  </style>
</head>
<body>
  <div class="portrait-card">
    ${animatedSvg}
  </div>

  <script>
    const card = document.querySelector('.portrait-card');
    const hair = document.querySelector('#layer-group-hair');
    const face = document.querySelector('#layer-group-face');
    const eyes = document.querySelector('#layer-group-eyes');

    window.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 15;
      if (hair) hair.style.transform = \`translate(\${x * 1.3}px, \${y * 1.3}px)\`;
      if (eyes) eyes.style.transform = \`translate(\${x * 1.1}px, \${y * 1.1}px)\`;
      if (face) face.style.transform = \`translate(\${x * 0.9}px, \${y * 0.9}px)\`;
    });
  </script>
</body>
</html>`;
  }

  /**
   * Records a video loop (WebM) of the current animation playback using MediaRecorder.
   */
  static async recordVideo(editor, animationEngine, durationSec = 4.0, fps = 30) {
    return new Promise((resolve, reject) => {
      try {
        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = editor.width;
        renderCanvas.height = editor.height;
        const ctx = renderCanvas.getContext('2d');

        const stream = renderCanvas.captureStream(fps);
        const options = { mimeType: 'video/webm; codecs=vp9' };
        let recorder;

        try {
          recorder = new MediaRecorder(stream, options);
        } catch (e) {
          recorder = new MediaRecorder(stream);
        }

        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          resolve(blob);
        };

        recorder.start();

        // Step through frames
        const totalFrames = Math.round(durationSec * fps);
        let frame = 0;

        const img = new Image();
        const svgBlob = new Blob([editor.svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
        const URL = window.URL || window.webkitURL || window;

        function renderNextFrame() {
          if (frame >= totalFrames) {
            recorder.stop();
            return;
          }

          const t = (frame / fps);
          animationEngine.seek(t);

          // Serialize SVG with current styles
          const serializedSvg = new XMLSerializer().serializeToString(editor.svg);
          const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serializedSvg);

          img.onload = () => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);
            ctx.drawImage(img, 0, 0);
            frame++;
            setTimeout(renderNextFrame, 1000 / fps);
          };
          img.src = svgUrl;
        }

        renderNextFrame();
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Escapes text for use inside XML attribute values (e.g. "Eyes & Brows"). */
  static escapeXml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Triggers a browser download for a Blob or String.
   */
  static downloadFile(content, fileName, mimeType = 'image/svg+xml') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 200);
  }
}
