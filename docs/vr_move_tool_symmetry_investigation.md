# VR Move Tool Symmetry Investigation
**Date:** 2026-01-21
**Status:** Unresolved "Tearing" Artifacts near Mirror Plane.
**Version:** v0.5.25 (Beta)

## Problem Description
When using the **Move Tool** in VR with Symmetry enabled, vertices near the center (mirror) plane exhibit "tearing" or "shredding" artifacts compared to the clean "locking" behavior seen in the Desktop version.
Instead of the center line moving coherently (or staying locked if perpendicular), the vertices seem to be pulled apart, implying an imbalance of forces between the Primary brush and the Symmetry brush.

## Attempts & Hypotheses

### 1. Missing Symmetry Masking (Fixed in v0.5.22)
*   **Discovery**: `Picking.js` has a `getAlpha()` method that includes a critical geometric check:
    ```javascript
    // (Simplification)
    var xn = ... / (this._xSym ? -rs : rs);
    if (Math.abs(xn) > 1.0) return 0.0; // Mask out vertices on "wrong" side
    ```
*   **Root Cause**: I had explicitly disabled `getAlpha` for VR (`if (_xrSession) return 1.0;`) to avoid texture issues, inadvertently killing this geometric masking.
*   **Fix**: Re-enabled `getAlpha` for VR (neutralized texture, kept geometry).
*   **Result**: Fixed symmetry for *most* tools (Brush, Inflate, etc.), but Move tool remained broken.

### 2. Move Tool Initialization (Fixed in v0.5.23)
*   **Discovery**: `Move.js` overrides `startSculpt` and manually initializes `pickingSym` for VR logic.
*   **Root Cause**: It calculated the correct position for `pickingSym` but **failed to call `initAlpha()`**. This meant the symmetry brush was using garbage/stale "Normal" and "Origin" data for its masking calculations (likely from the last mouse position).
*   **Fix**: Added `pickingSym.computePickedNormal()` and `pickingSym.updateAlpha()` inside the VR `startSculpt` block.
*   **Result**: Slightly better, but artifacts persisted.

### 3. Overlap / Execution Order (Fixed in v0.5.24)
*   **Discovery**: `Move.js` uses a "Reset to Proxy -> Add Delta" logic.
    *   VR Logic was: `Reset Primary -> Move Primary -> Reset Symmetry -> Move Symmetry`.
*   **Root Cause**: If Primary moved a vertex, "Reset Symmetry" (which uses the *original* proxy position) would **undo** the Primary move before applying the Symmetry move. This caused "fighting" where the last brush to execute won.
*   **Fix**: Reordered to `Reset Primary -> Reset Symmetry -> Move Primary -> Move Symmetry`.
*   **Result**: Cumulative forces (correct), but "Tearing" at the center line remained.

### 4. Symmetry Side-Masking Imbalance (Attempted in v0.5.25)
*   **Hypothesis**: The Primary Brush (`xSym=false`) has NO side-restriction, so it pulls center vertices freely. The Symmetry Brush (`xSym=true`) has strict side-restriction, so it might Ignore/Mask center vertices if they cross the line (delta drift).
*   **Attempt**: Temporarily disabled `pickingSym._xSym = false` inside `sculptStrokeXR`.
*   **Intent**: Make both brushes behave identically (just mirrored), applying equal and opposite forces to the center line so they cancel out ("Locking").
*   **Result**: User reported "still tears".

## Future Hypotheses (Next Steps)

1.  **Topological Picking Mismatch**:
    *   `Move.js` uses `pickVerticesInSphereTopological`.
    *   If VR Input jitter causes the Primary selection to include a vertex but the Symmetry selection (mirrored world pos) to *exclude* it (due to slight floating point drift or radius check), we get a one-sided pull.
    *   **Test**: Force `pickVerticesInSphere` (non-topological) to see if it stabilizes.

2.  **Falloff Asymmetry**:
    *   The `falloff` function in `Move.js` involves `dist = Math.sqrt(...)`.
    *   If the Mirrored Controller Position is not *perfectly* symmetric to the Primary Controller Position (due to how we calculate `invert(meshMatrix)` etc.), forces won't balance.
    *   **Investigation**: Log the exact `falloff` values for a center vertex ID from both Primary and Symmetry passes.

3.  **Proxy Data Corruption**:
    *   Are we correctly isolating `moveData.vProxy` vs `moveDataSym.vProxy`?
    *   They seem to be initialized separately, but `copyVerticesProxy` writes to the *shared* `vAr` (vertex array).
    *   If `vProxy` is captured *after* some micro-move, it drifts.

4.  **Drag Direction Logic**:
    *   `dir` is calculated as `vCurrLocal - vStartLocal`.
    *   Symmetry `dir` is `[-dir[0], dir[1], dir[2]]`.
    *   If the mesh is rotated, `vStartLocal` might handle the transform, but does the *Delta* vector need simpler handling?
    *   Standard Move uses `unproject` (Screen Space). VR uses World Space.
    *   Maybe `Move` tool needs a specific "Center Locking" logic that snaps the delta X to 0 if the vertex is on the center line? (SculptGL might have this implicitly via screen projection?).

## Rollback Plan
Current Beta (`v0.5.25`) has experimental `xSym` disable.
If we resume, we should likely revert `Move.js` to the `v0.5.24` state (Overlap fix) as the baseline, as disabling `xSym` might have side effects for non-center symmetry.
