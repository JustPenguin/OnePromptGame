// Dirty-range tracking for partially uploaded GPU buffers. OWNER: Agent C (vfx).
//
// The particle / skid-mark buffers are ring buffers written a few elements per simulation step.  three.js uploads the ranges set with
// addUpdateRange() once per RENDER, so when several simulation steps run between two renders (test harness `__kart.advance()`, a
// slow frame with sub-stepping) every step but the last would lose its range.  DirtyRange keeps the union of everything written
// since the renderer last drew the mesh (`mesh.onBeforeRender` marks the previous upload as consumed).
export class DirtyRange {
  /** @param {import('three').Mesh} mesh  @param {Array<[import('three').BufferAttribute, number]>} attrs  [attribute, floats per element] */
  constructor(mesh, attrs) {
    this.attrs = attrs;
    this.lo = -1; this.hi = -1;          // written since the last commit()
    this.plo = -1; this.phi = -1;        // committed but not yet seen by a render
    this.consumed = false;
    const prev = mesh.onBeforeRender;
    mesh.onBeforeRender = (...a) => { this.consumed = true; prev?.apply(mesh, a); };
  }
  /** Note that element `i` was written. */
  mark(i) {
    if (this.lo < 0) { this.lo = this.hi = i; } else { if (i < this.lo) this.lo = i; if (i > this.hi) this.hi = i; }
  }
  /** Hand the pending range to the attributes (call once per simulation step). */
  commit() {
    if (this.consumed) { this.plo = this.phi = -1; this.consumed = false; }
    if (this.lo >= 0) {
      if (this.plo < 0) { this.plo = this.lo; this.phi = this.hi; } else { if (this.lo < this.plo) this.plo = this.lo; if (this.hi > this.phi) this.phi = this.hi; }
      this.lo = this.hi = -1;
    }
    if (this.plo < 0) return;
    const n = this.phi - this.plo + 1;
    for (let k = 0; k < this.attrs.length; k++) {
      const a = this.attrs[k][0], size = this.attrs[k][1];
      const r = a.updateRanges;
      if (r.length === 1) { r[0].start = this.plo * size; r[0].count = n * size; }     // reuse the range object (addUpdateRange allocates one per call)
      else { a.clearUpdateRanges(); a.addUpdateRange(this.plo * size, n * size); }
      a.needsUpdate = true;
    }
  }
}
