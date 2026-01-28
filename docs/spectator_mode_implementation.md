# Spectator Mode Implementation Guide (WebXR)

## Overview
By default, WebXR sessions in `immersive-vr` mode stop updating the desktop canvas to save performance (rendering 3 views is significantly more expensive than 2). However, for PCVR, it is often desirable to keep the desktop view alive for spectators or recording.

## Implementation Steps

### 1. Modify the Render Loop (`Scene.js`)
In `onXRFrame`, the standard loop binds the XR framebuffer explicitly:

```javascript
// Current Logic
const glLayer = session.renderState.baseLayer;
gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
this.renderVR(glLayer, pose);
```

To enable Spectator Mode, we need to add a second pass **after** the VR render:

### 2. Add Desktop Render Pass

```javascript
/* Inside onXRFrame, AFTER renderVR() */

// 1. Unbind XR Framebuffer (Switch to Default/Canvas)
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

// 2. Clear Screen
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

// 3. Reset Viewport to Canvas Dimensions
gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

// 4. Render Spectator View
// Option A: Left Eye Copy (Cheapest)
const leftView = pose.views[0]; 
// You'll need to manually set the camera matrices to match the Left Eye
// or pass the view directly if renderVR supports it.

// Option B: Spectator Camera (Smoother)
// Use the existing this._camera logic, but maybe update its position 
// to match the headset (pose.transform.position) + some smoothing.

// implementation using existing render() method if compatible:
// Note: You might need to temporarily override this._camera matrices or update them
this.render(); 
```

### 3. Performance Warning
*   **Cost**: Increases geometry workload by ~50% (3 distinct views).
*   **Target**: Recommended only for PCVR with dedicated GPUs. NOT recommended for standalone headsets (Quest native) as it will drain battery and hurt framerate.

## Code Path
*   **File**: `src/Scene.js`
*   **Method**: `onXRFrame(time, frame)`
