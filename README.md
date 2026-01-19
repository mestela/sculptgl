# SculptGL - VR Enhanced Fork

## Status
**Active Development**: This is a fork of [SculptGL](http://stephaneginier.com/sculptgl) focused on adding WebXR capabilities, specifically a VR Menu system.
(The original project is no longer actively maintained by the author).

**[Try the Live VR Build Here](https://tokeru.com/sculptgl-vr/)**

## WebXR Features (What works)
- **Core VR/AR**:
    - Works in PCVR (accessible via Meta Link/Air Link).
    - **Native Quest 3 Support**: Includes AR Passthrough mode.
    - Rewrote renderer for WebXR compatibility.
- **Interaction**:
    - **VR Tablet Menu**: UI moved to a palette on the left controller.
    - **Two-Handed Navigation**:
        - Single Grip: Translate world.
        - Double Grip: Scale and Rotate world.
    - Ray-casting support for UI interaction.
- **Sculpting & Rendering**:
    - Most brushes are fully functional.
    - Undo/Redo supported.
    - Rendering modes: Matcap, PBR, Wireframe, Flat Shading.
    - Brush Indicator (Cursor) restored in VR.

## Missing / Known Issues
The following features are currently disabled or not yet ported to the VR interface:
- **Saving/Loading**: File I/O (Export/Import) is not yet implemented in VR.
- **Dynamic Topology**: Disabled (likely too performance-heavy for standalone Quest 3).
- **Multiresolution**: Not yet supported in VR.
- **Material Selection**: No UI to switch between Matcaps or PBR environments yet.
- **Mesh Management**: Cannot add new primitives or import meshes in VR.
- **Cosmetic**: Controller meshes could be improved.

## Quick Start
1. Install dependencies:
   ```bash
   yarn
   ```
2. Run development server:
   ```bash
   yarn dev
   ```
3. Visit `http://localhost:8000` (or the URL provided).

Alternatively, you can use Python for a simple static server if you have built the source or are running pre-built files:
```bash
python3 -m http.server 8000
```

## Original Project Resources
- Live Demo: [stephaneginier.com/sculptgl](http://stephaneginier.com/sculptgl)
- Website: [stephaneginier.com](http://stephaneginier.com/)

## Tools
Node.js is required.

### Standalone Build
```bash
yarn add electron
yarn add electron-packager
yarn standalone
```

## Credits
- Original SculptGL by [Stéphane Ginier](http://stephaneginier.com/).
- Raw environments from [HDRI Haven](https://hdrihaven.com/hdris).
