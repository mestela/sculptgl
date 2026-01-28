# Handover Prompt: VR Symmetry Debugging (FAILED SESSION)

## Current Status
**CRITICAL**: VR Interaction (Sculpt/Move) was broken in `v0.5.370`.
**Action**: Reverted `src/Scene.js` and `src/math3d/Picking.js` to previous state (git restore).
**Current Version**: Code matches `v0.5.367` (approx).
**Symptoms**:
1.  **Brush**: Works Main, but Symmetry Cursor is "under surface" (picking backfaces?).
2.  **Move Tool**: Main works. Symmetry "shoots away" (likely grabbing backfaces).

## Session Summary (What We Tried)
1.  **Radius Increase**: Fixed "Snapping" (Move Tool), but didn't fix "Under Surface" visual.
2.  **Headset-Based Culling**: Attempted to use `HeadsetPos` to Cull backfaces. User reported "Bidentical behavior" (didn't work).
3.  **Normal-Guided Culling** (v0.5.370):
    *   Goal: Mimic Desktop Raycast by using Main Brush Normal as a "Hint" for Symmetry.
    *   Logic: `dot(FaceNormal, MirroredMainNormal) > 0`.
    *   **RESULT**: BROKE EVERYTHING. "I can't move the world, I can't sculpt".
    *   *Hypothesis*: My matrix transform logic (`transpose(inverse)`) or coordinate space (World vs Local) in `Picking.js` was buggy, causing `intersectionSphereMeshes` to return NO HITS or throw errors, killing the input loop.

## Technical Diagnosis
**Desktop vs VR**:
*   **Desktop**: Uses `intersectionMouseMeshes` (Raycast). Implicity hits FRONT face first. Safe.
*   **VR**: Uses `intersectionSphereMeshes` (Proximity). Hits CLOSEST point.
    *   If Symmetry Point is slightly *inside* mesh: Backface is closer -> Picks Backface.
    *   Backface Normal points IN -> visual artifact ("Under Surface").

## Next Steps
1.  **Debug Normal-Guided Culling**:
    *   This IS the correct approach (User agreed).
    *   But implementation was buggy in `v0.5.370`.
    *   Need to verify `mat4.transpose` logic and `worldHintNormal` transformation.
    *   *Unit Test*: Write a test (or use console logs) to verify the math before breaking VR again.

2.  **Alternative**: Use `intersectionRayMeshes` for VR logic?
    *   Maybe cast a short ray from `PreviousPos` to `CurrentPos`?
    *   Or `Center` to `Center + Normal`?

## Files to Watch
*   `src/math3d/Picking.js` (Core Picking Logic)
*   `src/Scene.js` (VR Input Loop)