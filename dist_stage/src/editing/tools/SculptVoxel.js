import SculptBase from 'editing/tools/SculptBase';
import VoxelState from 'editing/VoxelState';
import MeshStatic from 'mesh/meshStatic/MeshStatic';
import { vec3, mat4 } from 'gl-matrix';
import Utils from 'misc/Utils';
import Primitives from 'drawables/Primitives';
import Enums from 'misc/Enums';

class SculptVoxel extends SculptBase {

  constructor(main) {
    super(main);

    // Initialize Voxel Grid
    // Box size 100.0 (matches Utils.SCALE / Desktop Scale)
    // Resolution 64 (Better quality for larger space)
    this._voxelState = new VoxelState(64, 100.0);
    this._allowAir = true; // Allow sculpting without surface picking

    // The mesh that represents the voxels
    this._voxelMesh = null;

    // "Canvas" location - Fixed in front of user
    this._gridMatrix = mat4.create();
    mat4.translate(this._gridMatrix, this._gridMatrix, [0.0, 1.3, -1.5]);
    this._invGridMatrix = mat4.create();
    mat4.invert(this._invGridMatrix, this._gridMatrix);

    this._lastUpdate = 0;

    // DEBUG: Add a reference cube to verify location/rendering
    // Use Primitives to ensure correct faces formatting (Quads/Triangles)
    this._debugCube = Primitives.createCube(main._gl);
    this._debugCube.setMode(main._gl.TRIANGLES); // Primitives uses Quads, but handled as Tris in render

    // Primitives.createCube already calls init() and initRender()

    mat4.copy(this._debugCube.getMatrix(), this._gridMatrix);
    // Scale it to match Voxel Box (100.0)
    var s = 100.0;
    mat4.scale(this._debugCube.getMatrix(), this._debugCube.getMatrix(), [s, s, s]);
    // Note: Rendering opaque box might block view. Ideally use Wireframe.
    this._debugCube.setShaderType(Enums.Shader.FLAT);
    this._debugCube.setFlatColor([1.0, 0.0, 0.0]);
    this._debugCube.setOpacity(0.3); // Semi-transparent
    this._debugCube.isPickable = true; // Use Debug Cube for desktop picking!
    this._debugCube.setVisible(false); // [USER REQUEST] Hide by default

    // ... (lines 49-68 omitted for brevity if unchanged, but I need to match context)

    if (main.addNewMesh) main.addNewMesh(this._debugCube);
    else main.addMesh(this._debugCube);

    // if (window.screenLog) window.screenLog("Voxel: Debug Cube Added (Size 1.0) at [0, 1.3, -1.5]", "yellow");

    // Expose for Console Debugging
    window.voxelTool = this;
    window.helpVoxel = () => {
      console.log("window.voxelTool is available.");
      console.log("Try: window.voxelTool.centerCamera()");
      console.log("Try: window.voxelTool.toggleBox()");
      console.log("Try: window.voxelTool.toggleVoxelWireframe()");
      console.log("Try: window.voxelTool.toggleMatcap()");
      console.log("Try: window.voxelTool.fitToVoxel()");
      console.log("Try: window.voxelTool.flipWinding()");
      console.log("Try: window.voxelTool.logVoxelInfo()");
      console.log("Try: window.voxelTool.logInfo()");
    };

    // Ensure we have a default radius for distance check
    this._radius = 5.0; // Brush Size ~5% of world
  }

  getMesh() {
    return this._voxelMesh || super.getMesh();
  }

  setRadius(val) {
    super.setRadius(val);
    // if (window.screenLog) window.screenLog(`Voxel: setRadius(${val.toFixed(1)})`, "grey");
  }

  toggleMatcap() {
    if (!this._voxelMesh) {
      console.warn("No voxel mesh exists yet.");
      return;
    }
    // Toggle Shader between FLAT and MATCAP
    if (this._voxelMesh.getShaderType() === Enums.Shader.MATCAP) {
      this._voxelMesh.setShaderType(Enums.Shader.FLAT);
      console.log("Voxel Mesh: FLAT");
    } else {
      this._voxelMesh.setShaderType(Enums.Shader.MATCAP);
      console.log("Voxel Mesh: MATCAP");
    }
    this._main.render();
  }

  // Override sculptStroke to Log details
  sculptStroke() {
    try {
      // if (window.screenLog && Math.random() < 0.01) window.screenLog("sculptStroke called", "cyan");
      var main = this._main;
      var picking = main.getPicking();

      // Check if we hit something (Debug Cube is pickable)
      if (!picking.getMesh()) {
        // if (window.screenLog && (this._lastUpdate % 30 === 0)) window.screenLog("Pick: Miss", "grey");
        return;
      }

      if (window.screenLog && (this._lastUpdate % 5 === 0)) {
        var mesh = picking.getMesh();
        // window.screenLog(`Pick: Hit ID:${mesh ? mesh.getID() : 'null'}`, "grey");
      }

      var worldPos = picking.getIntersectionPoint();
      if (!worldPos) return;

      // Picking returns intersection in MESH LOCAL SPACE.
      // Since our mesh vertices are in "Grid Coordinates" (0..32) (scaled by step in matrix),
      // we have Grid Coordinates directly!
      // VoxelState.addSphere expects "Physical Local Coordinates" (-0.5 to 0.5).
      // Physical = Grid * Step + Min

      var gridPos = worldPos; // Alias for clarity
      var localPos = vec3.create();
      var step = this._voxelState.step;
      var min = this._voxelState.min;

      // localPos = min + gridPos * step
      vec3.scaleAndAdd(localPos, min, gridPos, step);

      // Log Local Pos to debug
      // if (window.screenLog && Math.random() < 0.05) window.screenLog(`LocalPos: ${localPos[0].toFixed(2)},${localPos[1].toFixed(2)},${localPos[2].toFixed(2)}`, "cyan");

      // Add Sphere (Brush Size)
      // Radius ~ 10cm? Or dynamic?
      // Use this._radius which is 1.0? That's BIG relative to 1.0 box?
      // box size is 100.0. 
      // Let's use smaller radius for mouse: 0.1 (10cm)
      // VR Brush Radius: 5.0
      var radius = 5.0;
      var color = [0.2, 0.8, 0.2]; // Green brush

      var changed = this._voxelState.addSphere(localPos, radius, color);

      if (changed) {
        if (window.screenLog) {
          window.screenLog(`VoxelMod: ${localPos[0].toFixed(2)},${localPos[1].toFixed(2)}`, "lime");
        }
        this.updateMesh();
      }

      this._main.render(); // Ensure redraw

    } catch (e) {
      if (window.screenLog) window.screenLog(`Sculpt Error: ${e.message}`, "red");
      console.error(e);
    }
  }

  toggleVoxelWireframe() {
    if (!this._voxelMesh) {
      console.warn("No voxel mesh exists yet.");
      if (window.screenLog) window.screenLog("No Voxel Mesh!", "orange");
      return;
    }
    // Toggle Shader between WIREFRAME and FLAT
    if (this._voxelMesh.getShaderType() === Enums.Shader.WIREFRAME) {
      this._voxelMesh.setShaderType(Enums.Shader.FLAT);
      this._voxelMesh.setFlatShading(true);
      console.log("Voxel Mesh: FLAT");
      if (window.screenLog) window.screenLog("Voxel: FLAT", "lime");
    } else {
      this._voxelMesh.setShaderType(Enums.Shader.WIREFRAME);
      this._voxelMesh.setShowWireframe(true); // Ensure buffer built
      this._voxelMesh.updateWireframeBuffer();
      console.log("Voxel Mesh: WIREFRAME");
      if (window.screenLog) window.screenLog("Voxel: WIREFRAME", "lime");
    }
    this._main.render();
  }

  updateMesh() {
    // Generate new mesh data
    const res = this._voxelState.computeMesh();

    // Create or Update MeshStatic
    var main = this._main;
    var gl = main._gl;

    if (!this._voxelMesh) {
      this._voxelMesh = new MeshStatic(gl);
      this._voxelMesh.setMode(gl.TRIANGLES);
      this._voxelMesh.setUseDrawArrays(true); // SurfaceNets produces indexed geometry?
      // Actually SurfaceNets produces faces now?
      // "faces" is Uint32Array.

      this._voxelMesh.setID(this._voxelMesh.getID()); // Keep ID?

      // Default to MATCAP for better visibility
      this._voxelMesh.setShaderType(Enums.Shader.MATCAP);

      main.addMesh(this._voxelMesh);
      if (window.screenLog) window.screenLog("Voxel: Mesh Created (MATCAP)", "lime");
    }

    this._voxelMesh.setVertices(res.vertices);
    this._voxelMesh.setFaces(res.faces);

    // Calculate Normals? 
    // SurfaceNets doesn't strictly give normals, but MeshStatic.init() might compute them?
    // We need Normals for many shaders.
    // Let's force computation if missing.

    this._voxelMesh.init();
    // Matcap Texture
    // We need to set a matcap texture. 
    // SculptGL usually loads them. Let's use 'pearl' or 'clay'.
    // We can assume main._matcapTexture might be set, or we default to it.
    // If not, we can force one if we find it.
    // For now, let's rely on RenderData defaults or try to set one.
    this._voxelMesh.setMatcap(0); // Index 0 is usually pearl/clay?

    // this._voxelMesh.initRender(); // Called by init?

    // Update Materials/Colors if available?
    // For now flat color
    this._voxelMesh.setFlatColor([0.2, 0.9, 0.2]); // Bright Green
    this._voxelMesh.setOpacity(1.0);

    // Log Stats
    // console.log(`Voxel Mesh Updated: ${res.vertices.length/3} verts`);
  }

  logVoxelInfo() {
    if (!this._voxelMesh) {
      console.warn("No voxel mesh.");
      return;
    }
    const b = this._voxelMesh.computeWorldBound();
    console.log(`Voxel Mesh Bounds: [${b[0].toFixed(2)}, ${b[1].toFixed(2)}, ${b[2].toFixed(2)}] to [${b[3].toFixed(2)}, ${b[4].toFixed(2)}, ${b[5].toFixed(2)}]`);
    console.log(`Vertices: ${this._voxelMesh.getNbVertices()} Faces: ${this._voxelMesh.getNbFaces()}`);
    console.log(`Scale: ${this._voxelMesh.getScale()}`);
    console.log(`Center: ${this._voxelMesh.getCenter()}`);
  }

  centerCamera() {
    // Helper to look at the voxel box
    const main = this._main;
    if (main.getCamera()) {
      // Box is at [0, 1.0, -0.5]
      // Use setAndFocusOnPivot([x,y,z], zoom)
      // Zoom 25.0 to see the whole box
      const cam = main.getCamera();
      if (cam.setAndFocusOnPivot) {
        cam.setAndFocusOnPivot([0, 1.0, -0.5], 100.0); // Zoom out further (Box is size 50)
      } else {
        console.error("Camera.setAndFocusOnPivot missing!");
      }
      main.render();
      console.log("Camera centered on Voxel Box (Pivot: 0, 1.0, -0.5 | Zoom: 100)");
    }
  }

  fitToVoxel() {
    if (!this._voxelMesh) {
      console.warn("No voxel mesh to fit to.");
      return;
    }
    const main = this._main;
    const cam = main.getCamera();
    if (!cam.setAndFocusOnPivot) {
      console.error("Camera.setAndFocusOnPivot missing!");
      return;
    }

    // Compute World Bounds
    const b = this._voxelMesh.computeWorldBound();
    // Bounds: [minX, minY, minZ, maxX, maxY, maxZ]
    const center = [
      (b[0] + b[3]) * 0.5,
      (b[1] + b[4]) * 0.5,
      (b[2] + b[5]) * 0.5
    ];

    // Estimate Zoom (Radius)
    const dx = b[3] - b[0];
    const dy = b[4] - b[1];
    const dz = b[5] - b[2];
    const maxDim = Math.max(dx, Math.max(dy, dz));

    // In SculptGL, zoom ~ 100 is roughly 1 unit wide? 
    // Actually zoom is percentage or internal unit?
    // setAndFocusOnPivot(pivot, zoom)
    // Default start zoom is usually near 0?? Or 100?
    // centerCamera used 100.0 for box (size 1.0?)
    // If box size 1.0 needs 100.0 zoom.
    // Then zoom = 100.0 / maxDim? Or * maxDim?
    // Let's try constant zoom first or just keep current zoom?
    // Actually setAndFocusOnPivot moves camera to pivot + offset?

    // Let's try a safe Zoom value or 2.0 (closer)
    cam.setAndFocusOnPivot(center, 2.0);
    main.render();
    console.log(`Focused on Voxel: Center[${center[0].toFixed(2)},${center[1].toFixed(2)},${center[2].toFixed(2)}] Size[${maxDim.toFixed(2)}]`);
  }

  focusVoxel() {
    this.fitToVoxel();
  }

  toggleBox() {
    if (this._debugCube.getShaderType() === Enums.Shader.WIREFRAME) {
      this._debugCube.setShaderType(Enums.Shader.FLAT);
      this._debugCube.setFlatColor([1.0, 0.0, 0.0]); // Red
      this._debugCube.setOpacity(0.5); // Transparent?
      console.log("Box: FLAT (Red)");
    } else {
      this._debugCube.setShaderType(Enums.Shader.WIREFRAME);
      console.log("Box: WIREFRAME");
    }
    this._main.render();
  }

  logInfo() {
    console.log("Voxel Tool Info:");
    console.log(" - DebugCube:", this._debugCube);
    console.log(" - Visible:", this._debugCube.isVisible());
    console.log(" - Pickable:", this._debugCube.isPickable);
    console.log(" - Shader:", this._debugCube.getShaderType());
    console.log(" - Meshes in Scene:", this._main.getMeshes().length);
    console.log(" - Camera:", this._main.getCamera().computePosition());
  }

  forceInit() {
    // Force an initial sphere at the center so we have a mesh to see immediately
    if (this._lastUpdate === 0) {
      if (window.screenLog) window.screenLog("Voxel: adding initial sphere at center...", "yellow");
      this._voxelState.addSphere([0, 0, 0], 15.0, [0.2, 1.0, 0.2]); // 15 unit sphere
      this.updateMesh();
      this._lastUpdate = 1;
    }
  }

  start(ctrl) {
    // if (window.screenLog) window.screenLog("Voxel: start() called", "grey");

    // Refresh Global Reference
    window.voxelTool = this;

    // Force pickable just in case
    this._debugCube.isPickable = true;

    // Create Test Triangle - REMOVED (Confusing picking)
    // this.createDebugTriangle();

    // Ensure Initial Sphere exists
    this.forceInit();

    const res = super.start(ctrl);

    // Debug Picking Failure
    if (!res) {
      // If start failed, it means picking missed. 
      // But for Voxel tool, maybe we want to allow it anyway?
      // SculptBase.start return true if we hit something OR if this._allowAir?
      // Let's check SculptBase.js later.
      if (window.screenLog) window.screenLog("Voxel: start() picking miss (Normal for Air)", "grey");
    } else {
      // if (window.screenLog) window.screenLog("Voxel: start() success (Hit Surface)", "lime");

      // HIDE ALL OTHER MESHES
      var meshes = this._main.getMeshes();
      for (var i = 0; i < meshes.length; ++i) {
        if (meshes[i] !== this._voxelMesh && meshes[i] !== this._debugCube) {
          meshes[i].setVisible(false);
          // Also disable picking for them?
          // meshes[i].isVisible = () => false; // Hack if getter/setter exists
        }
      }
    }
    return res;
  }

  postRender(selection) {
    // Hide default selection ring
    if (!this._main._xrSession) {
      // selection.render(this._main); 
    }
  }

  stroke(picking) {
    const inter = picking.getIntersectionPoint();

    if (!inter) {
      if (window.screenLog && Math.random() < 0.05) window.screenLog("Voxel Stroke: No Intersection", "red");
      return;
    }

    // Transform Intersection (World) to Grid Space (Local)
    // Use the inverse of the container matrix
    const localPos = vec3.create();
    vec3.transformMat4(localPos, inter, this._invGridMatrix);

    if (window.screenLog && Math.random() < 0.1) {
      const mesh = picking.getMesh();
      const meshID = mesh ? mesh.getID() : "Null";
      window.screenLog(`Strk: Mesh[${meshID}] W[${inter[0].toFixed(1)},${inter[1].toFixed(1)},${inter[2].toFixed(1)}] -> L[${localPos[0].toFixed(2)},${localPos[1].toFixed(2)},${localPos[2].toFixed(2)}]`, "cyan");
    }

    // Brush Radius (in Voxel Space)
    const radius = 0.15; // Increased slightly

    // Add Sphere
    const color = [0.7, 0.65, 0.6];
    const changed = this._voxelState.addSphere(localPos, radius, color);

    if (changed) {
      if (window.screenLog && (this._lastUpdate++ % 30 === 0)) window.screenLog(`Voxel: Mod! FaceCount: ${this._voxelMesh ? this._voxelMesh.getNbFaces() : 0}`, "lime");
      this.updateMesh();
    } else {
      // if (window.screenLog && Math.random() < 0.05) window.screenLog("Voxel: No Change (Out of bounds?)", "grey");
    }
  }

  flipWinding() {
    if (!this._voxelMesh) return;
    const mesh = this._voxelMesh;
    const fAr = mesh.getFaces();
    // Swap 2nd and 3rd index of every triangle/quad
    for (let i = 0; i < fAr.length; i += 4) {
      if (fAr[i] === Utils.TRI_INDEX) continue; // Should not happen in 4-strided
      const tmp = fAr[i + 1];
      fAr[i + 1] = fAr[i + 2];
      fAr[i + 2] = tmp;
    }
    mesh.updateGeometry();
    mesh.updateBuffers();
    this._main.render();
    console.log("Voxel Mesh Winding Flipped");
  }

  updateXR(picking, isPressed, origin, dir, ctrl) {
    try {
      // VoxelXR Update
      if (!isPressed) return;

      // 1. Transform EnginePos (World) to Grid Local Space
      var localPos = vec3.create();
      vec3.transformMat4(localPos, origin, this._invGridMatrix);

      // Debug: Log Local Pos
      if (window.screenLog && Math.random() < 0.05) {
        // window.screenLog(`Voxel Pos: ${localPos[0].toFixed(2)}, ${localPos[1].toFixed(2)}, ${localPos[2].toFixed(2)}`, "cyan");
      }

      // 2. Add Sphere at LocalPos
      // Radius Source: this._radius (0..100) set by GuiXR
      // Map 0..100 to 0.5..25.0 units?
      // Default _radius is usually 50 around start? GuiXR sets it.
      // Let's assume Map: Radius / 2.0? (50 -> 25).
      // Or Radius * 0.2? (50 -> 10).

      var rawRadius = (this._radius !== undefined) ? this._radius : 25.0;
      // User requested "Radius Slider" support.
      // GuiXR Radius slider goes 0..1 (val) -> setRadius(val * 100).
      // If val=0.5 -> _radius=50.
      // We want ~10.0 units for mid brush.
      var radius = Math.max(0.5, rawRadius * 0.2);

      // Support Voxel Mult Slider if set
      if (this._radiusMult) radius *= this._radiusMult;

      var color = [0.7, 0.65, 0.6]; // Grey Clay

      var changed = this._voxelState.addSphere(localPos, radius, color);

      if (changed) {
        // Throttle logs
        // if (window.screenLog && (this._lastUpdate++ % 30 === 0)) window.screenLog(`Voxel: Mod R=${radius.toFixed(1)}!`, "lime");
        this.updateMesh();
      }
    } catch (e) {
      if (window.screenLog) window.screenLog(`Voxel XR Error: ${e.message}`, "red");
      console.error(e);
    }
  }

  setResolution(res) {
    if (res === this._voxelState.dims[0]) return;
    if (window.screenLog) window.screenLog(`Voxel: Rebuilding Grid (${res}^3)...`, "orange");

    // Preserve size, just change res
    // Current size is 100.0
    this._voxelState = new VoxelState(res, 100.0);
    this._voxelMesh = null; // Forced reset
    this.forceInit();
    if (this._main) this._main.render();
  }

  setRadiusMultiplier(val) {
    this._radiusMult = val;
    if (window.screenLog) window.screenLog(`Voxel: Radius Mult ${val.toFixed(2)}`, "cyan");
  }

  updateMesh() {
    var res = this._voxelState.computeMesh();
    // res has { vertices, faces, colors, materials } (Float32Arrays)

    if (res.vertices.length === 0) {
      if (window.screenLog) window.screenLog("Voxel: Empty Mesh Generated", "red");
      return;
    }

    var isNew = false;
    // If no mesh exists, create it
    if (!this._voxelMesh) {
      this._voxelMesh = new MeshStatic(this._main._gl);
      this._voxelMesh.setMode(this._main._gl.TRIANGLES);
      isNew = true;

      // Set Matrix
      mat4.identity(this._voxelMesh.getMatrix());
      mat4.translate(this._voxelMesh.getMatrix(), this._voxelMesh.getMatrix(), this._voxelState.min);
      // Uniform scale by step
      var step = this._voxelState.step;
      mat4.scale(this._voxelMesh.getMatrix(), this._voxelMesh.getMatrix(), [step, step, step]);

      var worldMat = this._voxelMesh.getMatrix(); // Currently Min+Scale
      var containerMat = this._gridMatrix;

      if (window.screenLog) {
        window.screenLog(`VoxelState: step=${step} min=${this._voxelState.min[0]},${this._voxelState.min[1]},${this._voxelState.min[2]}`, "orange");
        window.screenLog(`GridMat: ${containerMat[12].toFixed(2)},${containerMat[13].toFixed(2)},${containerMat[14].toFixed(2)}`, "orange");
      }

      // M = Container * Translation(Min) * Scale(Step)
      mat4.copy(worldMat, containerMat);
      mat4.translate(worldMat, worldMat, this._voxelState.min);
      mat4.scale(worldMat, worldMat, [step, step, step]);

      if (window.screenLog) {
        window.screenLog(`FinalMat: Pos=${worldMat[12].toFixed(2)},${worldMat[13].toFixed(2)},${worldMat[14].toFixed(2)} Scale=${worldMat[0].toFixed(2)}`, "lime");
      }

      if (window.screenLog) window.screenLog("Voxel: Mesh Created", "green");
    }

    // Update Buffers
    this._voxelMesh.setVertices(res.vertices);
    this._voxelMesh.setFaces(res.faces);
    this._voxelMesh.setColors(res.colors);
    this._voxelMesh.setMaterials(res.materials);

    // Re-init (topology, octree, normals)
    this._voxelMesh.init();

    // CRITICAL: Ensure Render Data / Textures are initialized
    if (!this._voxelMesh.getRenderData()) this._voxelMesh.initRender();

    // Compute Normals (Crucial for rendering)
    this._voxelMesh.updateGeometry();

    // BAND-AID: Fix NaNs and Infinities in Normals
    const normals = this._voxelMesh.getNormals();
    let nanCount = 0;
    let zeroCount = 0;
    let infCount = 0;
    for (let i = 0; i < normals.length; i += 3) {
      if (!Number.isFinite(normals[i]) || !Number.isFinite(normals[i + 1]) || !Number.isFinite(normals[i + 2])) {
        normals[i] = 1.0; normals[i + 1] = 0.0; normals[i + 2] = 0.0;
        infCount++;
      }
      if (isNaN(normals[i]) || isNaN(normals[i + 1]) || isNaN(normals[i + 2])) { // redundant if isFinite used, but keeping for safety
        normals[i] = 1.0; normals[i + 1] = 0.0; normals[i + 2] = 0.0;
        nanCount++;
      }
      // Check for Zero Length Normal
      if (normals[i] === 0 && normals[i + 1] === 0 && normals[i + 2] === 0) {
        normals[i] = 0.0; normals[i + 1] = 1.0; normals[i + 2] = 0.0; // Force UP
        zeroCount++;
      }
    }
    if (nanCount > 0 || zeroCount > 0 || infCount > 0) {
      if (window.screenLog) window.screenLog(`FIXED: NaN:${nanCount} Inf:${infCount} Zero:${zeroCount}`, "orange");
      this._voxelMesh.updateNormalBuffer();
    }

    // BAND-AID: Fix NaN Materials/Colors (Critical for ShaderFlat vMasking)
    const materials = this._voxelMesh.getMaterials();
    let nanMat = 0;
    if (materials) {
      for (let i = 0; i < materials.length; i++) {
        if (isNaN(materials[i])) {
          materials[i] = 0.0; // Reset to 0 (Unmasked, etc)
          nanMat++;
        }
      }
      if (nanMat > 0) {
        if (window.screenLog) window.screenLog(`FIXED: ${nanMat} NaN Materials`, "red");
        this._voxelMesh.updateMaterialBuffer();
      }
    }

    // BAND-AID: Fix NaN Colors
    const colors = this._voxelMesh.getColors();
    let nanColor = 0;
    if (colors) {
      for (let i = 0; i < colors.length; i++) {
        if (!Number.isFinite(colors[i])) {
          colors[i] = 0.0; // Reset to 0 (Black)
          nanColor++;
        }
      }
      if (nanColor > 0) {
        if (window.screenLog) window.screenLog(`FIXED: ${nanColor} NaN/Inf Colors`, "red");
        this._voxelMesh.updateColorBuffer();
      }
    }

    // Set Shader Type AFTER init and data are present
    // FORCE FLAT SHADER (Matcap ignores uFlat, so we must use FLAT shader for faceted look)
    if (this._voxelMesh.getShaderType() !== Enums.Shader.FLAT) {
      this._voxelMesh.setShaderType(Enums.Shader.FLAT);
    }

    // DISABLE FLAT SHADING DERIVATIVES (Debug: rely on vertex normals)
    this._voxelMesh.setFlatShading(false);

    // Set a nice Color (base color for matcap modulation if supported)
    this._voxelMesh.setFlatColor([0.6, 0.6, 0.6]); // Grey

    // Disable picking on the voxel mesh to prevent self-snapping
    this._voxelMesh.isPickable = false;

    // Force DYNAMIC_DRAW
    if (this._voxelMesh.getVertexBuffer()) this._voxelMesh.getVertexBuffer()._hint = this._main._gl.DYNAMIC_DRAW;
    if (this._voxelMesh.getNormalBuffer()) this._voxelMesh.getNormalBuffer()._hint = this._main._gl.DYNAMIC_DRAW;
    if (this._voxelMesh.getColorBuffer()) this._voxelMesh.getColorBuffer()._hint = this._main._gl.DYNAMIC_DRAW;
    if (this._voxelMesh.getMaterialBuffer()) this._voxelMesh.getMaterialBuffer()._hint = this._main._gl.DYNAMIC_DRAW;
    if (this._voxelMesh.getIndexBuffer()) this._voxelMesh.getIndexBuffer()._hint = this._main._gl.DYNAMIC_DRAW;
    if (this._voxelMesh.getWireframeBuffer()) this._voxelMesh.getWireframeBuffer()._hint = this._main._gl.DYNAMIC_DRAW;

    this._voxelMesh.updateBuffers();

    if (isNew) {
      // Add to Scene AFTER init
      if (typeof this._main.addNewMesh === 'function') {
        this._main.addNewMesh(this._voxelMesh);
      } else if (typeof this._main.addMesh === 'function') {
        this._main.addMesh(this._voxelMesh);
      }
      if (window.screenLog) window.screenLog("Voxel: Mesh Added to Scene", "green");
    }

    if (window.screenLog) {
      const nbTris = this._voxelMesh.getNbTriangles();
      const useDA = this._voxelMesh.isUsingDrawArrays();
      // window.screenLog(`Voxel: Validating. Tris:${nbTris} DA:${useDA}`, "grey");
      // console.log(`Voxel: Tris:${nbTris} DA:${useDA} Faces:${res.faces.length / 4}`);
    }
  }

  // Debug Helper: Check vertices for NaN
  checkNaN(arr, name) {
    for (let i = 0; i < arr.length; i++) {
      if (isNaN(arr[i])) {
        return true;
      }
    }
    return false;
  }
}

export default SculptVoxel;
