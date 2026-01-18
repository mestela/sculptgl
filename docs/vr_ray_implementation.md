# VR Ray Interaction Implementation & Debugging

**Date:** 2026-01-18
**Status:** Resolved
**Version:** v0.3.34

## Overview
This document details the successful implementation of the VR Ray interaction system for the SculptGL WebXR port. The primary challenge was a persistent failure in Ray tracking (logs showing correct input availability but incorrect/zeroed matrix data) and a subsequent axis inversion issue.

## The Problem
After initial implementation, the application logged "Miss: Origin 0,0,0 Dir 0,0,-1" despite `XRInputSource` reporting `targetRaySpace` availability. Extensive debugging revealed that the legacy input handling path (`handleXRInput`) was either failing to update the internal state correctly or being bypassed entirely by an unknown condition. 
Additionally, passing `DOMPoint` objects directly to `gl-matrix` functions (which expect Arrays) caused silent matrix failures.

## The Solution: "Simple Ray" Bypass
Instead of patching the legacy `handleXRInput` method, we implemented a **fresh, self-contained method** called `updateVRInteractionSimple`.

### Key Features of the Solution:
1.  **Direct WebXR Access**: The new method accesses `frame.session.inputSources` directly, bypassing internal state variables.
2.  **Self-Contained Logic**: It calculates the Ray Origin and Direction immediately from the `pose.transform.matrix` without relying on other methods to update class member variables first.
3.  **Strict Array Conversion**: It treats the WebXR matrix as a `Float32Array` (which it is) and uses `vec3.fromValues` to explicitly extract translation and rotation vectors, ensuring compatibility with `gl-matrix`.
4.  **UV Correction**: The Y-axis for the 2D menu intersection was inverted (`1.0 - v` vs `v`). We simplified the calculation to use `(ly + h) / (2 * h)` which correctly maps "Up" on the controller to "Up" on the menu.

## How to Repeat (One-Shot Guide)
If you need to reimplement or fix VR interaction in a similar WebXR project:

1.  **Ignore Legacy Input Handlers**: Do not try to shim VR logic into existing mouse/keyboard event handlers or complex legacy input loops.
2.  **Create a Dedicated VR Update Method**:
    ```javascript
    updateVRInteraction(frame, refSpace) {
      // 1. Iterate session.inputSources to find the 'right' hand with 'targetRaySpace'.
      // 2. Get the pose: const pose = frame.getPose(source.targetRaySpace, refSpace);
      // 3. Extract Matrix: const mat = pose.transform.matrix;
      // 4. Extract Origin: vec3.fromValues(mat[12], mat[13], mat[14]);
      // 5. Extract Direction (Forward -Z): vec3.fromValues(-mat[8], -mat[9], -mat[10]);
      // 6. Perform Intersection: Ray vs Plane (Menu).
    }
    ```
3.  **Call from `onXRFrame`**: Ensure this method is called every frame inside the WebXR render loop.
4.  **Verify with Cache Busters**: If working in a browser environment, ALWAYS update the `APP_VERSION` string and file query parameters (e.g., `Scene.js?v=debug1`) to prevent caching issues from masking your changes.

## Files Modified
*   `src/Scene.js`: Added `updateVRInteractionSimple`.
*   `src/drawables/VRMenu.js`: Fixed `intersect` UV calculation.
*   `xr_poc.html`: Updated import map and version string.

## Debugging Tips
*   **Trace Logs**: Use `[Tag]` prefixes for logs to easily filter them (e.g., `[SimpleRay]`).
*   **Check Matrices**: If a matrix is all zeros or identity when it shouldn't be, check if you are passing Objects (`{x,y,z}`) where Arrays (`[x,y,z]`) are expected.
*   **Version Pinning**: Always verify the running version in the logs (`VERSION: ...`) matches your code.
