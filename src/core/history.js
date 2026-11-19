/**
 * History Manager
 * Handles Undo/Redo operations for vector paths, stroke modifications, and layer states.
 */

export class HistoryManager {
  constructor(maxSize = 40) {
    this.maxSize = maxSize;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const cb of this.listeners) {
      cb({
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        undoCount: this.undoStack.length,
        redoCount: this.redoStack.length
      });
    }
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  /** Most recent undoable action (used to merge continuous gestures into one step). */
  peek() {
    return this.undoStack[this.undoStack.length - 1] || null;
  }

  /**
   * Pushes a state snapshot or action pair: { undo: () => {}, redo: () => {}, description: '' }
   */
  push(action) {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo stack on new action
    this.notify();
  }

  undo() {
    if (!this.canUndo()) return false;
    const action = this.undoStack.pop();
    if (action && typeof action.undo === 'function') {
      action.undo();
      this.redoStack.push(action);
      this.notify();
      return true;
    }
    return false;
  }

  redo() {
    if (!this.canRedo()) return false;
    const action = this.redoStack.pop();
    if (action && typeof action.redo === 'function') {
      action.redo();
      this.undoStack.push(action);
      this.notify();
      return true;
    }
    return false;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}
