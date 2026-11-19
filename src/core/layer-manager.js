/**
 * Layer Manager
 * Organizes paths into animatable semantic groups (Hair, Face, Eyes, Nose, Mouth, Torso).
 * Manages layer visibility, locking, color tagging, z-ordering, and rigging pivot points.
 */

export class LayerManager {
  constructor() {
    this.layers = this.createDefaultLayers();
    this.activeLayerId = 'custom';
    this.listeners = new Set();
  }

  createDefaultLayers() {
    return [
      {
        id: 'hair',
        name: 'Hair',
        color: '#f59e0b', // Amber
        visible: true,
        locked: false,
        opacity: 1.0,
        pivot: { x: 0.5, y: 0.3 }, // Normalized anchor (top of head / hair root)
        parallaxFactor: 1.4,       // Moves more in 2.5D parallax
        animation: {
          breathe: { active: true, scaleY: 0.02, scaleX: 0.01 },
          sway: { active: true, angle: 3.5, freq: 0.8 },
          nod: { active: true, followHead: true }
        }
      },
      {
        id: 'eyes',
        name: 'Eyes & Brows',
        color: '#3b82f6', // Blue
        visible: true,
        locked: false,
        opacity: 1.0,
        pivot: { x: 0.5, y: 0.38 }, // Eye line
        parallaxFactor: 1.1,
        animation: {
          blink: { active: true, interval: 3.2, duration: 0.16 },
          nod: { active: true, followHead: true }
        }
      },
      {
        id: 'nose',
        name: 'Nose',
        color: '#10b981', // Emerald
        visible: true,
        locked: false,
        opacity: 1.0,
        pivot: { x: 0.5, y: 0.52 },
        parallaxFactor: 1.2,
        animation: {
          nod: { active: true, followHead: true }
        }
      },
      {
        id: 'mouth',
        name: 'Mouth & Lips',
        color: '#ec4899', // Pink
        visible: true,
        locked: false,
        opacity: 1.0,
        pivot: { x: 0.5, y: 0.70 },
        parallaxFactor: 1.05,
        animation: {
          talk: { active: false, intensity: 0.08, freq: 2.5 },
          nod: { active: true, followHead: true }
        }
      },
      {
        id: 'face',
        name: 'Face & Jaw',
        color: '#8b5cf6', // Purple
        visible: true,
        locked: false,
        opacity: 1.0,
        pivot: { x: 0.5, y: 0.65 }, // Neck / jaw pivot
        parallaxFactor: 1.0,
        animation: {
          nod: { active: true, angle: 2.5, freq: 0.6 },
          tilt: { active: true, angle: 2.0, freq: 0.4 }
        }
      },
      {
        id: 'torso',
        name: 'Body & Torso',
        color: '#64748b', // Slate
        visible: true,
        locked: false,
        opacity: 1.0,
        pivot: { x: 0.5, y: 0.95 }, // Base / spine
        parallaxFactor: 0.4,
        animation: {
          breathe: { active: true, scaleY: 0.03, scaleX: 0.02, freq: 0.5 }
        }
      },
      {
        id: 'custom',
        name: 'Custom / Strokes',
        color: '#06b6d4', // Cyan
        visible: true,
        locked: false,
        opacity: 1.0,
        pivot: { x: 0.5, y: 0.5 },
        parallaxFactor: 1.0,
        animation: {}
      }
    ];
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const cb of this.listeners) cb(this.layers);
  }

  getLayer(id) {
    return this.layers.find(l => l.id === id);
  }

  getActiveLayer() {
    return this.getLayer(this.activeLayerId) || this.layers[0];
  }

  setActiveLayer(id) {
    if (this.layers.some(l => l.id === id)) {
      this.activeLayerId = id;
      this.notify();
    }
  }

  toggleVisibility(id) {
    const layer = this.getLayer(id);
    if (layer) {
      layer.visible = !layer.visible;
      this.notify();
    }
  }

  toggleLock(id) {
    const layer = this.getLayer(id);
    if (layer) {
      layer.locked = !layer.locked;
      this.notify();
    }
  }

  setOpacity(id, opacity) {
    const layer = this.getLayer(id);
    if (layer) {
      layer.opacity = Math.max(0, Math.min(1, opacity));
      this.notify();
    }
  }

  setPivot(id, x, y) {
    const layer = this.getLayer(id);
    if (layer) {
      layer.pivot = { x, y };
      this.notify();
    }
  }

  addLayer(name, color = '#6366f1') {
    const id = `layer_${Date.now()}`;
    const newLayer = {
      id,
      name: name || `Layer ${this.layers.length + 1}`,
      color,
      visible: true,
      locked: false,
      opacity: 1.0,
      pivot: { x: 0.5, y: 0.5 },
      parallaxFactor: 1.0,
      animation: {}
    };
    this.layers.push(newLayer);
    this.activeLayerId = id;
    this.notify();
    return newLayer;
  }

  deleteLayer(id) {
    if (this.layers.length <= 1) return false;
    this.layers = this.layers.filter(l => l.id !== id);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers[0].id;
    }
    this.notify();
    return true;
  }

  moveLayer(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.layers.length || toIndex < 0 || toIndex >= this.layers.length) return;
    const item = this.layers.splice(fromIndex, 1)[0];
    this.layers.splice(toIndex, 0, item);
    this.notify();
  }

  toJSON() {
    return {
      layers: this.layers,
      activeLayerId: this.activeLayerId
    };
  }

  fromJSON(data) {
    if (data && Array.isArray(data.layers)) {
      this.layers = data.layers;
      this.activeLayerId = data.activeLayerId || this.layers[0].id;
      this.notify();
    }
  }
}
