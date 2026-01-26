# Walkthrough: VR Menu Implementation
## Overview
The VR Menu system allows users to interact with SculptGL tools (Brush, Inflate, etc.) and parameters (Radius, Intensity) while in WebXR mode. It is implemented as a "floating tablet" attached to the left controller.

## Reconstruction Guide (Paranoid Protocol)
*Goal: Re-implement this feature from scratch using only this doc.*

### 1. The Core Strategy: "Canvas-to-Texture"
Instead of building a complex 3D UI framework, we use a standard HTML5 `<canvas>` (2D) to draw the UI, and then project that canvas onto a 3D Quad in the VR world.

**Components:**
1.  **GuiXR (`src/gui/GuiXR.js`)**: The "Brain". Manages the 2D Canvas, draws widgets, and handles clicks.
2.  **VRMenu (`src/drawables/VRMenu.js`)**: The "Body". A simple 3D Mesh (Quad) that displays the texture from `GuiXR`.
3.  **Scene (`src/Scene.js`)**: The "Glue". Routes VR Controller inputs (Raycasts) to the Menu.

### 2. Detailed Implementation

#### A. GuiXR (The 2D Backend)
*   **Role**: Creates a `512x512` canvas.
*   **Rendering**: Uses `CanvasRenderingContext2D` to draw rectangles (buttons/sliders) and text.
*   **Texture Management**:
    *   create `gl.createTexture()`.
    *   When `_needsUpdate` is true, calls `gl.texSubImage2D(..., this._canvas)` to upload the canvas pixels to the GPU.
*   **Interaction Logic**:
    *   `widgets` array stores simple objects: `{ x, y, w, h, id, type }`.
    *   `onInteract(u, v, isPressed)`: Checks if the UV coordinate hits any widget.
    *   **Sliders**: Calculates value based on relative X position within the slider rect.
    *   **Buttons**: Simple hit test.

#### B. VRMenu (The 3D Frontend)
*   **Role**: Displays the texture in VR.
*   **Geometry**: A simple Quad (2 triangles).
    *   Vertices: `+/- 0.15` (15cm size).
    *   UVs: Standard `0,0` to `1,1`.
*   **Positioning**:
    *   Maintains a local offset relative to the controller.
    *   `updateMatrices(camera, controllerMatrix)`: Multiplies `ControllerMatrix * LocalOffset` to place the menu in the world.
*   **Raycasting (`intersect(origin, direction)`)**:
    *   **CRITICAL Step**: We do NOT raycast in World Space.
    *   **Inversion**: We invert the Menu's World Matrix to get `invWorld`.
    *   **Transform**: We transform the Ray Origin and Direction into the Menu's **Local Space** using `invWorld`.
    *   **Intersection**: In Local Space, the menu is just a plane at `Z=0`. We solve `P = O + tD` for `P.z = 0`.
    *   **UV Mapping**: Local X/Y coords are mapped to `[0, 1]` UVs.

#### C. Scene Integration
*   **Initialization**: In `initVRControllers`, we create `guiXR` and `vrMenu`. **IMPORTANT**: Must call `guiXR.init(gl)` to create the texture!
*   **Loop (`onXRAny` / `render`)**:
    1.  Get Controller Pose (Right Hand = Pointer).
    2.  Calculate Ray from Controller (Position/Orientation).
    3.  Call `vrMenu.intersect(rayOrigin, rayDir)`.
    4.  If Hit:
        *   Call `guiXR.setCursor(u, v)` (Draws a red dot on the canvas).
        *   If Trigger Pressed: Call `guiXR.click()`.
    5.  Call `vrMenu.render(main)`.

### 3. Key Gotchas
*   **Texture Initialization**: If you forget `guiXR.init(gl)`, the texture is null, and the menu renders black.
*   **Ray Transformation**: Transform the *Ray to the Object*, don't transform the *Object to the Ray*. It's mathematically simpler for planes.
*   **Canvas Flip**: WebGL textures often need Y-flipping, but since we map `0,0` (Top-Left of Canvas) to `0,1` (Top-Left of GL Texture in some conventions) or `0,0` (Bottom-Left), check UV mapping carefully. currently `v = (ly + h) / (2*h)` (Standard Cartesian).

### 4. Verification
*   **Visual**: A "VR Tools" header with sliders and buttons.
*   **Functional**: Clicking "Inflate" changes the active tool. Moving "Radius" slider changes the brush size.

## VR Undo/Redo Implementation (v0.4.40+)
### 1. Integration Strategy
*   **Existing Core**: Reused  (standard SculptGL undo stack).
*   **VR UI**: Added dedicated buttons to  surface.

### 2. Implementation Details
*   **GuiXR**: Added  widget group.
    *   Wired  -> checks for 'undo'/'redo' widget IDs.
    *   Calls  directly.
*   **StateManager**:
    *   Modified to support "Deep Trace" logging (optional) for debugging stack issues.
    *   Ensures  calls trigger  or visible side-effects in VR immediately.
*   **Feedback**:
    *   Visual feedback in  log window confirms stack depth.


## VR Undo/Redo Implementation (v0.4.40+)
### 1. Integration Strategy
*   **Existing Core**: Reused `StateManager.js` (standard SculptGL undo stack).
*   **VR UI**: Added dedicated buttons to `GuiXR` surface.

### 2. Implementation Details
*   **GuiXR**: Added `drawUndoRedo` widget group.
    *   Wired `onInteract` -> checks for 'undo'/'redo' widget IDs.
    *   Calls `main.getStateManager().undo()` directly.
*   **StateManager**:
    *   Modified to support "Deep Trace" logging (optional) for debugging stack issues.
    *   Ensures `undo()` calls trigger `history.pushState` or visible side-effects in VR immediately.
*   **Feedback**:
    *   Visual feedback in `xr_poc.html` log window confirms stack depth.

