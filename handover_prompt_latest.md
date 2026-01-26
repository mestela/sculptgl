# Handover Prompt (v0.5.350)

## Context
You are working on **SculptXR** (WebXR Voxel Sculpting).
The **Invisible Bake** saga is RESOLVED. Both Matcap and PBR shaders are working (v0.5.350).

## Critical Files
1.  **`src/editing/tools/SculptVoxel.js`**: Bake logic (Double Transform fix applied here).
2.  **`src/render/shaders/ShaderMatcap.js`**: Shader fix (No `uFlat` redef).
3.  **`src/render/shaders/glsl/pbr.glsl.js`**: Shader fix (No `uExposure` redef).
4.  **`index.html`**: Version v0.5.350.

## Current Status (v0.5.350)
-   **Bake Visibility**: **FIXED**.
    -   Vertices: Frozen in World Space.
    -   Matrix: Identity.
    -   Shader: Matcap/PBR compilation errors resolved.
-   **Voxel Stroke**: Fixed (Centered).

## Pending Issues (Next Up)
-   **Tools on Baked Mesh**: User reports "regular sculpt tools don't work on the new mesh".
    -   Likely cause: Baked mesh might be missing `initTopology`, `updateOctree`, or Picking mismatch.
    -   Or `SculptManager` not recognizing the new mesh type properly?

## Deployment
-   **Beta**: `./deploy_beta.sh` (Current: v0.5.350)
-   **Prod**: Not yet deployed.

## Protocol
-   **Paranoid Commit**: Commit working states immediately.
-   **Version Increment**: ALWAYS bump version in `index.html`.
-   **Beta First**: Always test in Beta.
