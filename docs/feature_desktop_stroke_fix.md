# Desktop Voxel Stroke Accumulation Fix

## Problem
On desktop, drawing with the Voxel Tool caused the stroke to "accumulate" or "pile up" towards the camera. This happened because the raycast would hit the *newly created* voxels from the previous stamp, bringing the "cursor" closer and closer to the camera with each move.

## Solution: Screen-Plane Lock
We implemented a "Plane Lock" mechanism that engages when sculpting on Desktop (non-XR).

1.  **Initial Lock**: When `start()` hits a mesh, we define a "Lock Plane" using the **hit point** and the **camera forward direction** (perpendicular to view).
2.  **Late-Bind Lock**: If `start()` misses (e.g. `_allowAir` is true), the lock engages on the *first valid hit* during `sculptStroke`.
3.  **Ray-Plane Intersection**: During `sculptStroke`, instead of picking the accumulating mesh, we Raycast against this **Lock Plane**.
4.  **Bypass Mesh Check**: Once locked, we bypass the "Must Pick Mesh" check, allowing the stroke to continue smoothly off the specific voxel mesh and onto the plane (drawing into air).
5.  **Coordinate space**: The Intersection point (World Space) is transformed into Grid Coordinates using `(InvGridMatrix * P - Min) / Step` to ensure accurate voxel placement.

## Brush Radius
We also switched the desktop brush radius from a hardcoded `0.15` (too small for standard grid) to use the dynamic `this._radius` property, consistent with the XR implementation.

## Verification
-   **Continuous Stroke**: Users can now draw long, continuous strokes on dimensions `50-100` without the stroke breaking or spiraling.
-   **Air Drawing**: Strokes can start on the mesh and extend into the air along the screen plane.
-   **No "Stalagmite"**: The stroke remains flat relative to the initial surface plane.
