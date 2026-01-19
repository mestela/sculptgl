import { vec3, mat4, quat } from 'gl-matrix';
import getOptionsURL from 'misc/getOptionsURL';
import Enums from 'misc/Enums';
import Utils from 'misc/Utils';
import SculptManager from 'editing/SculptManager';
import Subdivision from 'editing/Subdivision';
import Import from 'files/Import';
import Gui from 'gui/Gui';
import Camera from 'math3d/Camera';
import Picking from 'math3d/Picking';
import Background from 'drawables/Background';
import Mesh from 'mesh/Mesh';
import Multimesh from 'mesh/multiresolution/Multimesh';
import Primitives from 'drawables/Primitives';
import StateManager from 'states/StateManager';
import RenderData from 'mesh/RenderData';
import Rtt from 'drawables/Rtt';
import ShaderLib from 'render/ShaderLib';
import MeshStatic from 'mesh/meshStatic/MeshStatic';
import WebGLCaps from 'render/WebGLCaps';
import GuiXR from 'gui/GuiXR';
import VRMenu from 'drawables/VRMenu';

class Scene {

  constructor() {
    this._gl = null; // webgl context

    this._cameraSpeed = 0.25;

    // cache canvas stuffs
    this._pixelRatio = 1.0;
    this._viewport = document.getElementById('viewport');
    this._canvas = document.getElementById('canvas');
    this._canvasWidth = 0;
    this._canvasHeight = 0;
    this._canvasOffsetLeft = 0;
    this._canvasOffsetTop = 0;

    // core of the app
    this._stateManager = new StateManager(this); // for undo-redo
    this._sculptManager = null;
    this._camera = new Camera(this);
    this._picking = new Picking(this); // the ray picking
    this._pickingSym = new Picking(this, true); // the symmetrical picking

    // TODO primitive builder
    this._meshPreview = null;
    this._torusLength = 0.5;
    this._torusWidth = 0.1;
    this._torusRadius = Math.PI * 2;
    this._torusRadial = 32;
    this._torusTubular = 128;

    // renderable stuffs
    var opts = getOptionsURL();
    this._showContour = opts.outline;
    this._showGrid = opts.grid;
    this._grid = null;
    this._background = null;
    this._meshes = []; // the meshes
    this._selectMeshes = []; // multi selection
    this._mesh = null; // the selected mesh
    this._debugPivotMesh = null; // Debug pink cube for VR pivot

    this._rttContour = null; // rtt for contour
    this._rttMerge = null; // rtt decode opaque + merge transparent
    this._rttOpaque = null; // rtt half float
    this._rttTransparent = null; // rtt rgbm

    // ui stuffs
    this._focusGui = false; // if the gui is being focused
    this._gui = new Gui(this);

    this._preventRender = false; // prevent multiple render per frame
    this._drawFullScene = false; // render everything on the rtt
    this._autoMatrix = opts.scalecenter; // scale and center the imported meshes
    this._vertexSRGB = true; // srgb vs linear colorspace for vertex color

    // VR Interaction State
    this._xrSession = null;
    this._baseRefSpace = null;
    this._xrRefSpace = null;
    this._xrWorldOffset = null;
    this._activeHandedness = 'right';
    this._vrScale = 1.0;

    this._vrGrip = {
      left: { active: false, startPoint: vec3.create() },
      right: { active: false, startPoint: vec3.create() }
    };

    this._vrTwoHanded = {
      active: false,
      latch: false,
      prevMid: vec3.create(),
      prevDist: 0.0,
      prevVec: vec3.create()
    };

    // VR Menu State
    this._guiXR = null;
    this._vrMenu = null;
    this._vrPoseLeft = null;
    this._vrPoseRight = null;
  }

  start() {
    this.initWebGL();
    if (!this._gl)
      return;

    this._sculptManager = new SculptManager(this);
    this._background = new Background(this._gl, this);

    this._rttContour = new Rtt(this._gl, Enums.Shader.CONTOUR, null);
    this._rttMerge = new Rtt(this._gl, Enums.Shader.MERGE, null);
    this._rttOpaque = new Rtt(this._gl, Enums.Shader.FXAA);
    this._rttTransparent = new Rtt(this._gl, null, this._rttOpaque.getDepth(), true);

    this._grid = Primitives.createGrid(this._gl);
    this.initGrid();

    this.loadTextures();
    this._gui.initGui();
    this.onCanvasResize();

    var modelURL = getOptionsURL().modelurl;
    if (modelURL) this.addModelURL(modelURL);
    else this.addSphere();
  }

  addModelURL(url) {
    var fileType = this.getFileType(url);
    if (!fileType)
      return;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    xhr.responseType = fileType === 'obj' ? 'text' : 'arraybuffer';

    xhr.onload = function () {
      if (xhr.status === 200)
        this.loadScene(xhr.response, fileType);
    }.bind(this);

    xhr.send(null);
  }

  getBackground() {
    return this._background;
  }

  getViewport() {
    return this._viewport;
  }

  getCanvas() {
    return this._canvas;
  }

  getPixelRatio() {
    return this._pixelRatio;
  }

  getCanvasWidth() {
    return this._canvasWidth;
  }

  getCanvasHeight() {
    return this._canvasHeight;
  }

  getCamera() {
    return this._camera;
  }

  getGui() {
    return this._gui;
  }

  getMeshes() {
    return this._meshes;
  }

  getMesh() {
    return this._mesh;
  }

  getSelectedMeshes() {
    return this._selectMeshes;
  }

  getPicking() {
    return this._picking;
  }

  getPickingSymmetry() {
    return this._pickingSym;
  }

  getSculptManager() {
    return this._sculptManager;
  }

  getStateManager() {
    return this._stateManager;
  }

  setMesh(mesh) {
    return this.setOrUnsetMesh(mesh);
  }

  setCanvasCursor(style) {
    this._canvas.style.cursor = style;
  }

  initGrid() {
    var grid = this._grid;
    grid.normalizeSize();
    var gridm = grid.getMatrix();
    // mat4.translate(gridm, gridm, [0.0, -0.45, 0.0]); // Reset to 0 for VR
    mat4.translate(gridm, gridm, [0.0, -0.5, 0.0]); // Floor level (sphere is radius 0.25 (scaled 0.005 * 50?))
    var scale = 0.1; // Was 2.5, reduce for VR (1/25th size)
    mat4.scale(gridm, gridm, [scale, scale, scale]);
    this._grid.setShaderType(Enums.Shader.FLAT);
    grid.setFlatColor([0.04, 0.04, 0.04]);
  }

  setOrUnsetMesh(mesh, multiSelect) {
    if (!mesh) {
      this._selectMeshes.length = 0;
    } else if (!multiSelect) {
      this._selectMeshes.length = 0;
      this._selectMeshes.push(mesh);
    } else {
      var id = this.getIndexSelectMesh(mesh);
      if (id >= 0) {
        if (this._selectMeshes.length > 1) {
          this._selectMeshes.splice(id, 1);
          mesh = this._selectMeshes[0];
        }
      } else {
        this._selectMeshes.push(mesh);
      }
    }

    this._mesh = mesh;
    this.getGui().updateMesh();
    this.render();
    return mesh;
  }

  renderSelectOverRtt() {
    if (this._requestRender())
      this._drawFullScene = false;
  }

  _requestRender() {
    if (this._preventRender === true || this._xrSession)
      return false; // render already requested for the next frame

    window.requestAnimationFrame(this.applyRender.bind(this));
    this._preventRender = true;
    return true;
  }

  render() {
    this._drawFullScene = true;
    this._requestRender();
  }

  applyRender(arg) {
    // requestAnimationFrame passes a timestamp (number) as first argument
    // We only want a WebGLFramebuffer or null.
    var targetFBO = (arg && typeof arg === 'object') ? arg : null;

    this._preventRender = false;
    this.updateMatricesAndSort();

    var gl = this._gl;
    if (!gl) return;

    if (this._drawFullScene) this._drawScene();

    gl.disable(gl.DEPTH_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._rttMerge.getFramebuffer());
    this._rttMerge.render(this); // merge + decode

    // render to screen (or target FBO)
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);

    this._rttOpaque.render(this); // fxaa

    gl.enable(gl.DEPTH_TEST);

    this._sculptManager.postRender(); // draw sculpting gizmo stuffs
  }

  // Simplified VR Render (Bypassing RTT/PostProc for now)
  renderVR(glLayer, pose) {
    var gl = this._gl;
    if (!gl) return;

    // FBO is already bound by callee
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Lazy init controllers if missing (and GL is ready)
    if (!this._vrControllerLeft || !this._vrControllerRight) {
      this.initVRControllers();
    }

    var cam = this._camera;
    var meshes = this._meshes;
    var grid = this._grid;

    // VR Controllers
    var ctrls = [];
    if (this._vrControllerLeft) ctrls.push(this._vrControllerLeft);
    if (this._vrControllerRight) ctrls.push(this._vrControllerRight);

    for (const view of pose.views) {
      const viewport = glLayer.getViewport(view);
      gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);

      // --- PASS 1: REAL WORLD (Controllers/Debug) ---
      // Apply raw XR view matrix
      mat4.copy(cam._view, view.transform.inverse.matrix);
      mat4.copy(cam._proj, view.projectionMatrix);

      // Render Controllers (Real World)
      for (const ctrl of ctrls) {
        ctrl.updateMatrices(cam);
        ctrl.render(this);
      }

      // VR Menu (Attached to Left Controller) - Pass 1
      if (this._vrMenu && this._vrPoseLeft) {
        this._vrMenu.updateMatrices(cam, this._vrPoseLeft);
        this._vrMenu.render(this);
      }

      // Debug Pivot (Pink/Green Cube) - Pass 1
      if (this._debugPivotMesh && this._debugPivotMesh.isVisible()) {
        gl.disable(gl.DEPTH_TEST);
        this._debugPivotMesh.updateMatrices(cam);
        this._debugPivotMesh.render(this);
        gl.enable(gl.DEPTH_TEST);
      }

      // Debug Cursor (Moved to Pass 2 to respect Scale/Transform)
      // if (this._debugCursor) { ... } // REMOVED from Pass 1

      // --- PASS 2: SCALED/TRANSFORMED WORLD (Content) ---
      // Apply World Transform to View Matrix
      // View = View * WorldMatrix
      
      if (this._xrWorldOffset) {
         // Apply Translation/Rotation
         const t = this._xrWorldOffset.position;
         const r = this._xrWorldOffset.orientation;
         
         const worldMat = mat4.create();
         mat4.fromRotationTranslation(worldMat, [r.x, r.y, r.z, r.w], [t.x, t.y, t.z]);
         mat4.multiply(cam._view, cam._view, worldMat);
      }

      if (this._vrScale !== 1.0) {
        mat4.scale(cam._view, cam._view, [this._vrScale, this._vrScale, this._vrScale]);
      }

      // Grid
      if (this._showGrid && grid) {
        grid.updateMatrices(cam);
        grid.render(this);
      }

      // Meshes
      for (let i = 0, l = meshes.length; i < l; ++i) {
        if (!meshes[i].isVisible()) continue;
        meshes[i].updateMatrices(cam);
        meshes[i].render(this);
      }
      
      // Wireframe (Pass 2)
      gl.enable(gl.BLEND);
      gl.depthFunc(gl.LESS);
      for (let i = 0, l = meshes.length; i < l; ++i) {
        if (meshes[i].getShowWireframe())
          meshes[i].renderWireframe(this);
      }
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);

      // Debug Cursor (Pass 2 - Scaled Model Space)
      if (this._debugCursor && this._debugCursor.isVisible()) {
         this._debugCursor.updateMatrices(cam);
         this._debugCursor.render(this);
      }
    }
  }

  _drawSceneVR() {
    var gl = this._gl;
    gl.enable(gl.DEPTH_TEST);

    // grid
    if (this._showGrid) this._grid.render(this);

    // VR Controllers (Pass 1: Real World)
    if (this._vrControllerLeft) this._vrControllerLeft.render(this);
    if (this._vrControllerRight) this._vrControllerRight.render(this);

    // Debug Cursor
    if (this._debugCursor && this._debugCursor.isVisible()) this._debugCursor.render(this);

    // Meshes (Pass 2: World Scaled)
    // See renderVR() logic for matrix scaling
    var meshes = this._meshes;
    for (var i = 0, l = meshes.length; i < l; ++i) {
      if (!meshes[i].isVisible()) continue;
      meshes[i].render(this);
    }
  }

  _drawScene() {
    var gl = this._gl;
    var i = 0;
    var meshes = this._meshes;
    var nbMeshes = meshes.length;

    ///////////////
    // CONTOUR 1/2
    ///////////////
    gl.disable(gl.DEPTH_TEST);
    var showContour = this._selectMeshes.length > 0 && this._showContour && ShaderLib[Enums.Shader.CONTOUR].color[3] > 0.0;
    if (showContour) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._rttContour.getFramebuffer());
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (var s = 0, sel = this._selectMeshes, nbSel = sel.length; s < nbSel; ++s)
        sel[s].renderFlatColor(this);
    }
    gl.enable(gl.DEPTH_TEST);

    ///////////////
    // OPAQUE PASS
    ///////////////
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._rttOpaque.getFramebuffer());
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // grid
    if (this._showGrid) this._grid.render(this);

    // VR Controllers
    if (this._vrControllerLeft) this._vrControllerLeft.render(this);
    if (this._vrControllerRight) this._vrControllerRight.render(this);

    // (post opaque pass)
    for (i = 0; i < nbMeshes; ++i) {
      if (meshes[i].isTransparent()) break;
      meshes[i].render(this);
    }
    var startTransparent = i;
    if (this._meshPreview) this._meshPreview.render(this);

    // background
    this._background.render();

    ///////////////
    // TRANSPARENT PASS
    ///////////////
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._rttTransparent.getFramebuffer());
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);

    // wireframe for dynamic mesh has duplicate edges
    gl.depthFunc(gl.LESS);
    for (i = 0; i < nbMeshes; ++i) {
      if (meshes[i].getShowWireframe())
        meshes[i].renderWireframe(this);
    }
    gl.depthFunc(gl.LEQUAL);

    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);

    for (i = startTransparent; i < nbMeshes; ++i) {
      gl.cullFace(gl.FRONT); // draw back first
      meshes[i].render(this);
      gl.cullFace(gl.BACK); // ... and then front
      meshes[i].render(this);
    }

    gl.disable(gl.CULL_FACE);

    ///////////////
    // CONTOUR 2/2
    ///////////////
    if (showContour) {
      this._rttContour.render(this);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /** Pre compute matrices and sort meshes */
  updateMatricesAndSort() {
    var meshes = this._meshes;
    var cam = this._camera;
    if (meshes.length > 0) {
      cam.optimizeNearFar(this.computeBoundingBoxScene());
    }

    for (var i = 0, nb = meshes.length; i < nb; ++i) {
      meshes[i].updateMatrices(cam);
    }

    meshes.sort(Mesh.sortFunction);

    if (this._meshPreview) this._meshPreview.updateMatrices(cam);
    if (this._grid) this._grid.updateMatrices(cam);
  }

  initWebGL() {
    var attributes = {
      antialias: true,
      stencil: true,
      alpha: false,
      xrCompatible: true // Enable WebXR compatibility
    };

    var canvas = document.getElementById('canvas');
    var gl = this._gl = canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes);
    if (!gl) {
      window.alert('Could not initialise WebGL. No WebGL, no SculptGL. Sorry.');
      return;
    }

    WebGLCaps.initWebGLExtensions(gl);
    if (!WebGLCaps.getWebGLExtension('OES_element_index_uint'))
      RenderData.ONLY_DRAW_ARRAYS = true;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    gl.disable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.disable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.disable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /** Load textures (preload) */
  loadTextures() {
    var self = this;
    var gl = this._gl;
    var ShaderMatcap = ShaderLib[Enums.Shader.MATCAP];

    var loadTex = function (path, idMaterial) {
      var mat = new Image();
      mat.src = path;

      mat.onload = function () {
        ShaderMatcap.createTexture(gl, mat, idMaterial);
        self.render();
      };
    };

    for (var i = 0, mats = ShaderMatcap.matcaps, l = mats.length; i < l; ++i)
      loadTex(mats[i].path, i);

    this.initAlphaTextures();
  }

  initAlphaTextures() {
    var alphas = Picking.INIT_ALPHAS_PATHS;
    var names = Picking.INIT_ALPHAS_NAMES;
    for (var i = 0, nbA = alphas.length; i < nbA; ++i) {
      var am = new Image();
      am.src = 'resources/alpha/' + alphas[i];
      am.onload = this.onLoadAlphaImage.bind(this, am, names[i]);
    }
  }

  /** Called when the window is resized */
  onCanvasResize() {
    var viewport = this._viewport;
    var newWidth = viewport.clientWidth * this._pixelRatio;
    var newHeight = viewport.clientHeight * this._pixelRatio;

    this._canvasOffsetLeft = viewport.offsetLeft;
    this._canvasOffsetTop = viewport.offsetTop;
    this._canvasWidth = newWidth;
    this._canvasHeight = newHeight;

    this._canvas.width = newWidth;
    this._canvas.height = newHeight;

    this._gl.viewport(0, 0, newWidth, newHeight);
    this._camera.onResize(newWidth, newHeight);
    this._background.onResize(newWidth, newHeight);

    this._rttContour.onResize(newWidth, newHeight);
    this._rttMerge.onResize(newWidth, newHeight);
    this._rttOpaque.onResize(newWidth, newHeight);
    this._rttTransparent.onResize(newWidth, newHeight);

    this.render();
  }

  computeRadiusFromBoundingBox(box) {
    var dx = box[3] - box[0];
    var dy = box[4] - box[1];
    var dz = box[5] - box[2];
    return 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  computeBoundingBoxMeshes(meshes) {
    var bound = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (var i = 0, l = meshes.length; i < l; ++i) {
      if (!meshes[i].isVisible()) continue;
      var bi = meshes[i].computeWorldBound();
      if (bi[0] < bound[0]) bound[0] = bi[0];
      if (bi[1] < bound[1]) bound[1] = bi[1];
      if (bi[2] < bound[2]) bound[2] = bi[2];
      if (bi[3] > bound[3]) bound[3] = bi[3];
      if (bi[4] > bound[4]) bound[4] = bi[4];
      if (bi[5] > bound[5]) bound[5] = bi[5];
    }
    return bound;
  }

  computeBoundingBoxScene() {
    var scene = this._meshes.slice();
    scene.push(this._grid);
    this._sculptManager.addSculptToScene(scene);
    return this.computeBoundingBoxMeshes(scene);
  }

  normalizeAndCenterMeshes(meshes) {
    var box = this.computeBoundingBoxMeshes(meshes);
    var scale = Utils.SCALE / vec3.dist([box[0], box[1], box[2]], [box[3], box[4], box[5]]);

    var mCen = mat4.create();
    mat4.scale(mCen, mCen, [scale, scale, scale]);
    mat4.translate(mCen, mCen, [-(box[0] + box[3]) * 0.5, -(box[1] + box[4]) * 0.5, -(box[2] + box[5]) * 0.5]);

    for (var i = 0, l = meshes.length; i < l; ++i) {
      var mat = meshes[i].getMatrix();
      mat4.mul(mat, mCen, mat);
    }
  }

  addSphere() {
    // make a cube and subdivide it
    var mesh = new Multimesh(Primitives.createCube(this._gl));
    mesh.normalizeSize();
    // 50cm diameter sphere (0.25 radius, but sphere primitive is radius 100 * scale?)
    // Utils.SCALE is 100.
    // Primitives.createSphere(gl, radius=50 ...)
    // Wait, let's keep it simple. 0.01 was 1m. 0.005 is 50cm.
    // 50cm diameter sphere (0.25 radius), centered at origin for safety.
    // mat4.translate(mesh.getMatrix(), mesh.getMatrix(), [0.0, 1.3, -0.5]); // Reverted due to visibility issues
    mat4.scale(mesh.getMatrix(), mesh.getMatrix(), [0.005, 0.005, 0.005]);
    this.subdivideClamp(mesh);

    // Use PBR
    mesh.setShaderType(Enums.Shader.PBR);

    this.addNewMesh(mesh);
    return mesh;
  }

  addCube() {
    var mesh = new Multimesh(Primitives.createCube(this._gl));
    mesh.normalizeSize();
    mat4.scale(mesh.getMatrix(), mesh.getMatrix(), [0.7, 0.7, 0.7]);
    this.subdivideClamp(mesh, true);
    return this.addNewMesh(mesh);
  }

  addCylinder() {
    var mesh = new Multimesh(Primitives.createCylinder(this._gl));
    mesh.normalizeSize();
    mat4.scale(mesh.getMatrix(), mesh.getMatrix(), [0.7, 0.7, 0.7]);
    this.subdivideClamp(mesh);
    return this.addNewMesh(mesh);
  }

  addTorus(preview) {
    var mesh = new Multimesh(Primitives.createTorus(this._gl, this._torusLength, this._torusWidth, this._torusRadius, this._torusRadial, this._torusTubular));
    if (preview) {
      mesh.setShowWireframe(true);
      var scale = 0.3 * Utils.SCALE;
      mat4.scale(mesh.getMatrix(), mesh.getMatrix(), [scale, scale, scale]);
      this._meshPreview = mesh;
      return;
    }
    mesh.normalizeSize();
    this.subdivideClamp(mesh);
    this.addNewMesh(mesh);
  }

  subdivideClamp(mesh, linear) {
    Subdivision.LINEAR = !!linear;
    while (mesh.getNbFaces() < 50000)
      mesh.addLevel();
    // keep at max 4 multires
    mesh._meshes.splice(0, Math.min(mesh._meshes.length - 4, 4));
    mesh._sel = mesh._meshes.length - 1;
    Subdivision.LINEAR = false;
  }

  addNewMesh(mesh) {
    this._meshes.push(mesh);
    this._stateManager.pushStateAdd(mesh);
    this.setMesh(mesh);
    return mesh;
  }

  loadScene(fileData, fileType) {
    var newMeshes;
    if (fileType === 'obj') newMeshes = Import.importOBJ(fileData, this._gl);
    else if (fileType === 'sgl') newMeshes = Import.importSGL(fileData, this._gl, this);
    else if (fileType === 'stl') newMeshes = Import.importSTL(fileData, this._gl);
    else if (fileType === 'ply') newMeshes = Import.importPLY(fileData, this._gl);

    var nbNewMeshes = newMeshes.length;
    if (nbNewMeshes === 0) {
      return;
    }

    var meshes = this._meshes;
    for (var i = 0; i < nbNewMeshes; ++i) {
      var mesh = newMeshes[i] = new Multimesh(newMeshes[i]);

      if (!this._vertexSRGB && mesh.getColors()) {
        Utils.convertArrayVec3toSRGB(mesh.getColors());
      }

      mesh.init();
      mesh.initRender();
      meshes.push(mesh);
    }

    if (this._autoMatrix) {
      this.normalizeAndCenterMeshes(newMeshes);
    }

    this._stateManager.pushStateAdd(newMeshes);
    this.setMesh(meshes[meshes.length - 1]);
    this.resetCameraMeshes(newMeshes);
    return newMeshes;
  }

  clearScene() {
    this.getStateManager().reset();
    this.getMeshes().length = 0;
    this.getCamera().resetView();
    this.setMesh(null);
    this._action = Enums.Action.NOTHING;
  }

  deleteCurrentSelection() {
    if (!this._mesh)
      return;

    this.removeMeshes(this._selectMeshes);
    this._stateManager.pushStateRemove(this._selectMeshes.slice());
    this._selectMeshes.length = 0;
    this.setMesh(null);
  }

  removeMeshes(rm) {
    var meshes = this._meshes;
    for (var i = 0; i < rm.length; ++i)
      meshes.splice(this.getIndexMesh(rm[i]), 1);
  }

  getIndexMesh(mesh, select) {
    var meshes = select ? this._selectMeshes : this._meshes;
    var id = mesh.getID();
    for (var i = 0, nbMeshes = meshes.length; i < nbMeshes; ++i) {
      var testMesh = meshes[i];
      if (testMesh === mesh || testMesh.getID() === id)
        return i;
    }
    return -1;
  }

  getIndexSelectMesh(mesh) {
    return this.getIndexMesh(mesh, true);
  }

  /** Replace a mesh in the scene */
  replaceMesh(mesh, newMesh) {
    var index = this.getIndexMesh(mesh);
    if (index >= 0) this._meshes[index] = newMesh;
    if (this._mesh === mesh) this.setMesh(newMesh);
  }

  duplicateSelection() {
    var meshes = this._selectMeshes.slice();
    var mesh = null;
    for (var i = 0; i < meshes.length; ++i) {
      mesh = meshes[i];
      var copy = new MeshStatic(mesh.getGL());
      copy.copyData(mesh);

      this.addNewMesh(copy);
    }

    this.setMesh(mesh);
  }

  onLoadAlphaImage(img, name, tool) {
    var can = document.createElement('canvas');
    can.width = img.width;
    can.height = img.height;

    var ctx = can.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var u8rgba = ctx.getImageData(0, 0, img.width, img.height).data;
    var u8lum = u8rgba.subarray(0, u8rgba.length / 4);
    for (var i = 0, j = 0, n = u8lum.length; i < n; ++i, j += 4)
      u8lum[i] = Math.round((u8rgba[j] + u8rgba[j + 1] + u8rgba[j + 2]) / 3);

    name = Picking.addAlpha(u8lum, img.width, img.height, name)._name;

    var entry = {};
    entry[name] = name;
    this.getGui().addAlphaOptions(entry);
    if (tool && tool._ctrlAlpha)
      tool._ctrlAlpha.setValue(name);
  }

  enterXR(session) {
    this._xrSession = session;
    session.addEventListener('end', this.onXREnd.bind(this));

    const gl = this._gl;

    // Ensure context is compatible (some browsers require this even with the flag)
    console.log("enterXR: calling makeXRCompatible...");
    gl.makeXRCompatible().then(() => {
      console.log("enterXR: makeXRCompatible resolved.");
      try {
        const baseLayer = new XRWebGLLayer(session, gl);
        session.updateRenderState({ baseLayer });
        console.log("enterXR: XRWebGLLayer created and set.");

        // Request 'local-floor' space for 6DoF height
        session.requestReferenceSpace('local-floor').then((refSpace) => {
          console.log("enterXR: Got local-floor reference space.");
          this._baseRefSpace = refSpace;

          // If the slider has a value, apply it
          this.updateVROffsets();

          this._logThrottle = 0;
          session.requestAnimationFrame(this.onXRFrame.bind(this));
        });
      } catch (e) {
        console.error("enterXR Critical Error:", e);
      }
    }).catch((err) => {
      console.error("enterXR: makeXRCompatible failed!", err);
    });

    this._preventRender = true;
  }

  updateVROffsets() {
    if (!this._baseRefSpace) return;

    const sliderZ = document.getElementById('offsetZ');
    const valZ = sliderZ ? parseFloat(sliderZ.value) : 0.4;

    const sliderY = document.getElementById('offsetY');
    const valY = sliderY ? parseFloat(sliderY.value) : -1.2;

    // We want to move the "origin" relative to the user.
    // Using simple offset on Y and Z.
    // XRRigidTransform(position, orientation)
    // To move scene UP, we shift reference space DOWN?
    // Or we shift origin... let's try direct translation.
    // If I want the scene to be HIGHER, I need the floor to be lower relative to me?
    // Actually, usually negative Y moves the reference space down (so I feel higher).
    // Positive Y moves reference space up (so I feel lower).
    // Let's assume Y slider = "Scene Height".
    // If I increase Y, scene goes up.

    // Reference Space Offset:
    // "result = base * offset" ?
    // "viewer_in_base = viewer_in_offset * offset_inverse" ?
    // Documentation says: getOffsetReferenceSpace(originOffset)
    // "Creates a new reference space where the origin is offset from the created reference space by the specified transformation."
    // origin_new = origin_old * transform

    // Let's just try mapping directly.
    // offsetZ moves Forward/Back?
    // offsetY moves Up/Down.

    const offset = new XRRigidTransform({ x: 0, y: -valY, z: -valZ });
    // Negating because usually we think "Move Scene Back" (negative Z) or "Move Scene Down" (negative Y)
    // But let's verify behavior. Z=0.5 was "lift scene"?
    // User said "sphere is too low below me". So they want to lift scene (Y+).
    // If valY is positive, and we use -valY, origin moves DOWN.
    // Which means viewer (at 0) is relatively HIGHER.
    // Wait. If Origin moves DOWN, then content (at Origin) moves DOWN.
    // So to lift scene, we need Positive Y offset?
    // Let's stick to -valY and see. If slider is "Height", maybe we want +valY.
    // I'll assume slider is "Viewer Height".
    // If I increase "Viewer Height", I go UP, scene goes DOWN.
    // So -valY makes sense for "Viewer Height".

    this._xrRefSpace = this._baseRefSpace.getOffsetReferenceSpace(offset);

    // Apply accumulated world nav
    if (this._xrWorldOffset) {
      // Silenced for now
      // let p = this._xrWorldOffset.position;
      // console.log(`VR State - Scale: ${this._vrScale.toFixed(3)}, Pos: [${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}]`);

      // Tracking Debug (Throttled)
      if (this._logThrottle % 60 === 0 && this._vrControllerPos) {
        const p = this._vrControllerPos; // Vec3
        // if (window.screenLog) window.screenLog(`Pos: ${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)}`, "yellow");
      }
      // Compose offsets? 
      // We want: Base -> InitialOffset -> WorldNav
      // But getOffsetReferenceSpace takes an XRRigidTransform.
      // We can chain them.
      this._xrRefSpace = this._xrRefSpace.getOffsetReferenceSpace(this._xrWorldOffset);
    }
  }

  moveWorld(delta) {
    if (!this._baseRefSpace) return;

    // Delta is vec3 [dx, dy, dz] in World Space.
    // We want to move World by Delta.
    // E.g. pulling world towards me (+Z).
    // Means RefSpace Origin moves +Z.

    // We need to ACCUMULATE this delta into a transform.
    if (!this._xrWorldOffset) {
      this._xrWorldOffset = new XRRigidTransform({ x: 0, y: 0, z: 0 });
    }

    // Current position
    let pos = this._xrWorldOffset.position;

    // Create new position
    // NOTE: transform.position is ReadOnly usually.
    // We must create a new transform.

    let newPos = {
      x: pos.x + delta[0],
      y: pos.y + delta[1],
      z: pos.z + delta[2],
      w: 1.0 // not needed for dict
    };

    this._xrWorldOffset = new XRRigidTransform(newPos, this._xrWorldOffset.orientation);

    // Re-apply
    this.updateVROffsets();
  }

  onXREnd() {
    this._xrSession = null;
    this._xrRefSpace = null;
    this._preventRender = false;

    this._vrControllerLeft = null;
    this._vrControllerRight = null;
    this.initVRControllers();

    this.render();
  }

  initVRControllers() {
    // Simple 5cm cube for controllers
    var gl = this._gl;
    if (!gl) return; // Wait for GL

    // Helper to make a mesh
    const makeCtrl = (color) => {
      var mesh = new Multimesh(Primitives.createCube(gl));
      mesh.normalizeSize();
      // Start Hidden (Scale 0)
      mat4.scale(mesh.getMatrix(), mat4.create(), [0.0, 0.0, 0.0]);

      mesh.setShaderType(Enums.Shader.FLAT);
      mesh.setFlatColor(color);
      mesh.init();
      mesh.initRender();
      return mesh;
    };

    if (Primitives) {
      this._vrControllerLeft = makeCtrl([0.0, 1.0, 0.0]); // GREEN
      this._vrControllerRight = makeCtrl([0.0, 0.0, 1.0]); // BLUE
      if (window.screenLog) window.screenLog("Created Controllers: Left(Green), Right(Blue)", "lime");
    }

    // Init VR Menu System
    if (!this._guiXR) this._guiXR = new GuiXR(this);
    this._guiXR.init(this._gl);
    if (!this._vrMenu) this._vrMenu = new VRMenu(this._gl, this._guiXR);
  }

  updateVRControllerPose(handedness, position, orientation) {
    var mesh = handedness === 'left' ? this._vrControllerLeft : this._vrControllerRight;
    if (!mesh) return;

    if (window.screenLog && !this._hasLoggedCtrl) {
      window.screenLog(`First Controller Update: ${handedness}`, 'lime');
      this._hasLoggedCtrl = true;
    }

    // Fix: gl-matrix expects Arrays, but WebXR gives DOMPoints.
    // We must convert them manually.
    const pos = [position.x, position.y, position.z];
    const rot = [orientation.x, orientation.y, orientation.z, orientation.w];

    var mat = mesh.getMatrix();
    mat4.fromRotationTranslation(mat, rot, pos);

    // Apply Scale (Controllers are 1.0 size cubes, we want 0.02m = 2cm)
    mat4.scale(mat, mat, [0.02, 0.02, 0.02]);
    
    // DEBUG: Verify Right Controller Position (Fixed)
    // if (handedness === 'right' && window.screenLog && this._logThrottle % 200 === 0) {
    //    window.screenLog("Right Pos: " + vec3.str(pos), "cyan");
    // }
  }

  initDebugCursor() {
    var gl = this._gl;
    if (!gl) return;

    this._debugCursor = new Multimesh(Primitives.createCube(gl));
    this._debugCursor.normalizeSize();

    // Initialize "in the abyss" to prevent initial visual glitch
    mat4.translate(this._debugCursor.getMatrix(), mat4.create(), [0, -9999, 0]);
    this._debugCursor.setVisible(false);

    this._debugCursor.setShaderType(Enums.Shader.FLAT);
    this._debugCursor.setFlatColor([1.0, 1.0, 0.0]); // YELLOW

    this._debugCursor.init();
    this._debugCursor.initRender();
  }

  updateDebugCursor(pos, active) {
    if (!this._debugCursor) this.initDebugCursor();
    if (!this._debugCursor) return;

    if (active && pos) {
      if (!this._debugCursor.isVisible()) {
        console.log("showing debug cursor");
        this._debugCursor.setVisible(true);
      }
      var mat = this._debugCursor.getMatrix();
      mat4.identity(mat);
      mat4.translate(mat, mat, pos);
      mat4.scale(mat, mat, [0.01, 0.01, 0.01]);
    } else {
      if (this._debugCursor.isVisible()) {
        this._debugCursor.setVisible(false);
      }
    }
  }

  updateDebugPivot(pos, active) {
    if (!this._debugPivotMesh) {
       // Lazy Init
       this._debugPivotMesh = new Primitives.Cube(this._gl);
       this._debugPivotMesh.setShader(Enums.Shader.FLAT);
       this._debugPivotMesh.setFlatColor([0.0, 1.0, 0.0]); // GREEN (Test)
       this._debugPivotMesh.init();
       this._debugPivotMesh.initRender();
    }

    if (active && pos) {
      if (!this._debugPivotMesh.isVisible()) this._debugPivotMesh.setVisible(true);
      
      // LOG COORDINATES (Throttle)
       // if (window.screenLog && Math.random() < 0.02) {
       //    window.screenLog(`Pivot Draw: ${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}, ${pos[2].toFixed(2)}`, "green");
       // }

      var mat = this._debugPivotMesh.getMatrix();
      mat4.identity(mat);
      mat4.translate(mat, mat, pos);
      mat4.scale(mat, mat, [0.1, 0.1, 0.1]); // 10cm Cube (HUGE)
    } else {
      if (this._debugPivotMesh && this._debugPivotMesh.isVisible()) {
        this._debugPivotMesh.setVisible(false);
      }
    }
  }

  _drawSceneVR() {
    var gl = this._gl;
    gl.enable(gl.DEPTH_TEST);

    // grid
    if (this._showGrid) this._grid.render(this);

    // VR Controllers
    if (this._vrControllerLeft) this._vrControllerLeft.render(this);
    if (this._vrControllerRight) this._vrControllerRight.render(this);

    // Debug Cursor
    if (this._debugCursor && this._debugCursor.isVisible()) this._debugCursor.render(this);

    // Debug Pivot (Pink Cube)
    if (this._debugPivotMesh && this._debugPivotMesh.isVisible()) {
      gl.disable(gl.DEPTH_TEST);
      this._debugPivotMesh.render(this);
      gl.enable(gl.DEPTH_TEST);
    }

    // Meshes
    // Just render opaque meshes for now
    var meshes = this._meshes;
    for (var i = 0, l = meshes.length; i < l; ++i) {
      if (!meshes[i].isVisible()) continue;
      meshes[i].render(this);
    }
  }

  updateDebugPivot(pos, active) {
    if (!this._debugPivotMesh) {
      // Late Init
      var gl = this._gl;
      if (!gl) return;
      this._debugPivotMesh = new Multimesh(Primitives.createCube(gl));
      this._debugPivotMesh.normalizeSize();
      this._debugPivotMesh.setShaderType(Enums.Shader.FLAT);
      this._debugPivotMesh.setFlatColor([1.0, 0.0, 1.0]); // PINK
      this._debugPivotMesh.init();
      this._debugPivotMesh.initRender();
      if (window.screenLog) window.screenLog("Pivot Mesh Initialized", "magenta");
    }

    if (active && pos) {
      this._debugPivotMesh.setVisible(true);
      var mat = this._debugPivotMesh.getMatrix();
      mat4.identity(mat);
      mat4.translate(mat, mat, pos);
      mat4.scale(mat, mat, [0.04, 0.04, 0.04]); // X-Ray Visible

      // Debug Log (Throttled?)
      // if (window.screenLog && Math.random() < 0.05) window.screenLog(`Pivot: ${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}, ${pos[2].toFixed(2)}`, "magenta");

    } else {
      this._debugPivotMesh.setVisible(false);
    }
  }

  onXRFrame(time, frame) {
    const session = frame.session;
    session.requestAnimationFrame(this.onXRFrame.bind(this));

    // Force use of Base Ref Space (Local Floor) to debug "Flying Cube"
    // The previous offset logic likely doubled up or inverted height.
    const refSpace = this._baseRefSpace; 

    const pose = frame.getViewerPose(refSpace);
    if (pose) {
      const gl = this._gl;
      const glLayer = session.renderState.baseLayer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Handle Input (PoC placeholder)
      if (typeof this.handleXRInput === 'function') {
        try {
          this.handleXRInput(frame, refSpace);
        } catch (e) {
          console.error("XR Input Error:", e);
        }
      }

      // Render to WebXR framebuffer
      this.renderVR(glLayer, pose);
    }
  }

  handleXRInput(frame, refSpace) {
    const session = frame.session;
    const sources = session.inputSources;
    
    let leftGrip = false, rightGrip = false;
    let leftOrigin = null, rightOrigin = null;

    for (const source of sources) {
      if (!source.gripSpace) continue;

      // 1. Common Pose Gathering (for All Tasks)
      const worldPose = frame.getPose(source.gripSpace, refSpace);
      if (worldPose) {
        this.updateVRControllerPose(source.handedness, worldPose.transform.position, worldPose.transform.orientation);

        // Capture Unscaled Poses for Menu Attachment
        const p = worldPose.transform.position;
        const o = worldPose.transform.orientation;
        const mat = mat4.create();
        mat4.fromRotationTranslation(mat, [o.x, o.y, o.z, o.w], [p.x, p.y, p.z]);

        if (source.handedness === 'left') this._vrPoseLeft = mat;
        if (source.handedness === 'right') this._vrPoseRight = mat;
      }

      // 2. Menu Raycasting (Right Hand Only)
      if (source.handedness === 'right' && source.targetRaySpace) {
        const rayPose = frame.getPose(source.targetRaySpace, refSpace);
        if (rayPose && this._vrMenu) {
          const mat = rayPose.transform.matrix;
          // Extract Origin and Direction from Ray Matrix
          // Origin is translation (12,13,14)
          const origin = vec3.fromValues(mat[12], mat[13], mat[14]);
          // Direction is -Z column (8,9,10) ? WebXR ray usually points down -Z.
          const dir = vec3.fromValues(-mat[8], -mat[9], -mat[10]);
          vec3.normalize(dir, dir);

          const hit = this._vrMenu.intersect(origin, dir);
          if (hit) {
            this._guiXR.setCursor(hit.uv[0], hit.uv[1]);

            // Interact if Trigger Pressed (Button 0)
            if (source.gamepad && source.gamepad.buttons[0]) {
              this._guiXR.onInteract(hit.uv[0], hit.uv[1], source.gamepad.buttons[0].pressed);
            }
          } else {
            this._guiXR.setCursor(-1, -1);
          }
        }
      }

    // 3. Navigation Data (Base Space - Stable coordinates)
    if (this._baseRefSpace) {
      const basePose = frame.getPose(source.gripSpace, this._baseRefSpace);
      if (basePose) {
        const originBase = [basePose.transform.position.x, basePose.transform.position.y, basePose.transform.position.z];
        
        // Grip Button (Button 1 or Trigger/Squeeze?)
        // Usually Button 1 is Squeeze. Button 0 is Trigger.
        const isGrip = source.gamepad && source.gamepad.buttons[1] && source.gamepad.buttons[1].pressed;
        
        // DEBUG: Grip Logging (Throttle)
        // if (window.screenLog && isGrip && Math.random() < 0.02) {
        //    window.screenLog(`Grip Active: ${source.handedness}`, "cyan");
        // }

        if (source.handedness === 'left') { leftGrip = isGrip; leftOrigin = originBase; }
        if (source.handedness === 'right') { rightGrip = isGrip; rightOrigin = originBase; }
      }
    }

    // 4. Stylus / Trigger Dominance
    if (source.gamepad && source.gamepad.buttons[0] && source.gamepad.buttons[0].pressed) {
      this._activeHandedness = source.handedness;
    }
  }

  // FORCE PIVOT INIT (Just in case)
  if (!this._debugPivotMesh) this.updateDebugPivot([0,0,0], false);

  // 5. Dispatch Sculpting (Active Hand)
    // XRInputSourceArray is not a real array, so .find() fails.
    let activeSource = null;
    for (const s of sources) {
      if (s.handedness === this._activeHandedness) {
        activeSource = s;
        break;
      }
    }

    if (activeSource) this.processVRSculpting(activeSource, frame, refSpace);
    
    // Sync Debug Cursor specific to Active Hand (or failing that, right hand?)
    // processVRSculpting calls updateDebugCursor internally? No.
    // Actually SculptManager calls picking.intersectionPoint which...
    // Let's check processVRSculpting in Scene.js (I need to read it or just patch it)
    // Wait, I haven't read processVRSculpting in this session.
    // It's likely near line 1300.
    // I will search for it first or just patch handleXRInput if I can.
    
    // 6. Dispatch Navigation (Logic Switch)
    // 6. Dispatch Navigation (Logic Switch)
    // DOUBLE GRIP LATCH: Enforce "Clean Exit"
    const bothGripped = leftGrip && rightGrip && leftOrigin && rightOrigin;

    if (bothGripped) {
      this._vrTwoHanded.latch = true;
      this.processVRTwoHanded(leftOrigin, rightOrigin);
    } else {
      this._vrTwoHanded.active = false;
      if (this.updateDebugPivot) this.updateDebugPivot(null, false);

      if (this._vrTwoHanded.latch) {
        // LATCH BUSY: Block single grip until both inputs are clearly released
        const anyGripped = leftGrip || rightGrip;
        if (!anyGripped) {
          this._vrTwoHanded.latch = false; // RELEASE LATCH
          // if (window.screenLog) window.screenLog("Double Grip Latch Released", "gray");
        }

        // Ensure single states are reset
        this._vrGrip.left.active = false;
        this._vrGrip.right.active = false;
      } else {
      // Standard Single Grip
        if (leftGrip && leftOrigin) this.processVRGripState('left', leftOrigin);
        else this._vrGrip.left.active = false;

        if (rightGrip && rightOrigin) this.processVRGripState('right', rightOrigin);
        else this._vrGrip.right.active = false;
      }
    }
  }

  processVRGripState(handedness, origin) {
    const gState = this._vrGrip[handedness];
    if (!gState.active) {
      gState.active = true;
      vec3.copy(gState.startPoint, origin);
    } else {
      // Delta in Base Space approx World Space delta if orientation aligned
      const delta = vec3.create();
      vec3.sub(delta, origin, gState.startPoint);

      // Threshold for jitter
      if (vec3.length(delta) > 0.0001) {
        this.moveWorld([delta[0], delta[1], delta[2]]);
        vec3.copy(gState.startPoint, origin);
      }
    }
  }

  processVRTwoHanded(lOrig, rOrig) {
    const s = this._vrTwoHanded;
    const l = vec3.fromValues(...lOrig);
    const r = vec3.fromValues(...rOrig);

    const mid = vec3.create();
    vec3.lerp(mid, l, r, 0.5);

    const dist = vec3.distance(l, r);

    const vec = vec3.create();
    vec3.sub(vec, r, l);
    vec3.normalize(vec, vec);

    if (!s.active) {
      s.active = true;
      vec3.copy(s.prevMid, mid);
      s.prevDist = dist;
      vec3.copy(s.prevVec, vec);
      return;
    }

    // 1. Translation
    const deltaT = vec3.create();
    vec3.sub(deltaT, mid, s.prevMid);
    this.moveWorld([deltaT[0], deltaT[1], deltaT[2]]);

    // 2. Scaling
    // Threshold 5cm to prevent jitter when hands are too close
    if (s.prevDist > 0.05 && dist > 0.05) {
      const ratio = dist / s.prevDist;
      // Use Hand Midpoint (mid) as Pivot for Natural Zoom
      if (Math.abs(ratio - 1.0) > 0.0001) this.scaleWorld(ratio, mid);
    }

    // 3. Rotation
    const q = quat.create();
    quat.rotationTo(q, s.prevVec, vec);
    this.rotateWorld(q, mid);

    vec3.copy(s.prevMid, mid);
    s.prevDist = dist;
    vec3.copy(s.prevVec, vec);

    // Show Pink Pivot
    if (this.updateDebugPivot) {
      // if (window.screenLog && this._logThrottle % 60 === 0) {
      //   window.screenLog(`Pivot Update: ${mid[0].toFixed(2)},${mid[1].toFixed(2)},${mid[2].toFixed(2)}`, "magenta");
      // }
      this.updateDebugPivot(mid, true);
    }
  }

  scaleWorld(ratio, pivot) {
    this._vrScale *= ratio;

    // Pivot Lock: If scaling around the origin (0,0,0), skip position math
    if (vec3.length(pivot) < 0.0001) return;

    if (!this._xrWorldOffset) this._xrWorldOffset = new XRRigidTransform({ x: 0, y: 0, z: 0 });

    let pos = vec3.fromValues(this._xrWorldOffset.position.x, this._xrWorldOffset.position.y, this._xrWorldOffset.position.z);
    let diff = vec3.create();
    vec3.sub(diff, pos, pivot);
    vec3.scale(diff, diff, 1.0 / ratio);
    vec3.add(pos, pivot, diff);

    this._xrWorldOffset = new XRRigidTransform({ x: pos[0], y: pos[1], z: pos[2] }, this._xrWorldOffset.orientation);
    this.updateVROffsets();
  }

  rotateWorld(qDelta, pivot) {
    if (!this._xrWorldOffset) this._xrWorldOffset = new XRRigidTransform({ x: 0, y: 0, z: 0 });

    let pos = vec3.fromValues(this._xrWorldOffset.position.x, this._xrWorldOffset.position.y, this._xrWorldOffset.position.z);
    let rot = quat.fromValues(this._xrWorldOffset.orientation.x, this._xrWorldOffset.orientation.y, this._xrWorldOffset.orientation.z, this._xrWorldOffset.orientation.w);

    // Rotate Position around Pivot
    let diff = vec3.create();
    vec3.sub(diff, pos, pivot);
    vec3.transformQuat(diff, diff, qDelta);
    vec3.add(pos, pivot, diff);

    // Rotate Orientation
    quat.multiply(rot, qDelta, rot); // Note: gl-matrix quat multiply order matters

    this._xrWorldOffset = new XRRigidTransform({ x: pos[0], y: pos[1], z: pos[2] }, { x: rot[0], y: rot[1], z: rot[2], w: rot[3] });
    this.updateVROffsets();
  }
  processVRSculpting(source, frame, refSpace) {
    const pose = frame.getPose(source.gripSpace, refSpace);
    if (!pose) return;

    // 1. Array Strictness & Pose Extraction
    const physicalOrigin = [pose.transform.position.x, pose.transform.position.y, pose.transform.position.z];

    // 2. Space Synchronization (Physical -> Model Space)
    // Model = Inv(Scale) * Inv(Rotation) * Inv(Translation) * Physical
    const vrScale = this._vrScale || 1.0;
    const invScale = 1.0 / vrScale;
    
    const enginePos = vec3.create();
    vec3.copy(enginePos, physicalOrigin);

    // Apply Inverse World Transform
    if (this._xrWorldOffset) {
      const t = this._xrWorldOffset.position;
      const r = this._xrWorldOffset.orientation;
      
      // 1. Inverse Translation (P - T)
      vec3.sub(enginePos, enginePos, [t.x, t.y, t.z]);

      // 2. Inverse Rotation (Apply Conjugate/Inverse Rotation)
      const qInv = quat.create();
      const qRot = quat.fromValues(r.x, r.y, r.z, r.w);
      quat.invert(qInv, qRot);
      vec3.transformQuat(enginePos, enginePos, qInv);
    }

    // 3. Inverse Scaling
    vec3.scale(enginePos, enginePos, invScale);

    // CRITICAL: Update shared state for SculptBase/SculptManager parity
    this._vrControllerPos = enginePos; 

    // 3. Picking (Engine Space Units)
    // Radius: Read from VR Menu (0.0 to 1.0)
    // Note: this._guiXR might be missing if not initialized, fallback to 0.15 (1.5cm) for "Spike" feel
    const sliderVal = (this._guiXR) ? this._guiXR._radius : 0.15;
    const physicalRadius = sliderVal * 0.1; // Map to 0-10cm physical range
    const pickingRadius = physicalRadius * invScale; 

    let picked = this._picking.intersectionSphereMeshes(this._meshes, enginePos, pickingRadius);

    // 4. Picking State Synchronization
    if (picked) {
      // CRITICAL FIX: The picking logic expects the squared radius in ENGINE units
      this._picking._rWorld2 = pickingRadius * pickingRadius;

      // Optional: Sync local radius if using per-mesh scaling (usually not in VR)
      const mesh = this._picking.getMesh();
      if (mesh) {
        this._picking._rLocal2 = this._picking._rWorld2 / mesh.getScale2();
      }
    }

    // 5. Stroke Lifecycle (Corrected API)
    const buttons = source.gamepad.buttons;
    const isTriggerPressed = buttons[0].pressed;

    // DEBUG: Cursor Drift
    // enginePos is Scaled Model Space.
    // RenderVR Pass 2 uses Scaled Matrix.
    // So enginePos should map 1:1 to Physical Hand visually IF rendered in Pass 2.
    if (this._debugCursor) {
      this.updateDebugCursor(enginePos, true);
      
      // Fix Red Cube Blobbing: Inverse Scale to maintain physical size
      const currentMat = this._debugCursor.getMatrix();
      
      // We want to scale it by invScale RELATIVE to its current 1.0 size.
      // updateDebugCursor sets scale to 0.02 (2cm).
      // If World is 10x bigger (scale 10), we want Cube to be 2cm * 0.1?
      // No, if World is 10x, and we render in scaled world, a 2cm cube becomes 20cm?
      // Pass 2 renders in SCALED space.
      // So if I want 2cm PHYSICAL size, and world is scaled by S.
      // I need to scale mesh by 1/S?
      // Yes. 2cm * 1/S * S = 2cm.
      if (typeof invScale !== 'undefined') {
        // Red Cube Debugging
        // Simplification: Just set it to 1.5cm absolute.
        // If the world is NOT scaled by matrix, this should look like 1.5cm.
        // If the world IS scaled by matrix, this will look tiny/huge.
        // User reports "Smaller as world smaller".
        // World Smaller usually means "Zoomed Out" (Scale < 1)? 
        // Or "World is small object" (Scale < 1)?
        // If Scale < 1, invScale > 1.
        
        mat4.identity(currentMat);
        mat4.translate(currentMat, currentMat, enginePos);
        
        // TRY: Constant size 1.5cm (0.015).
        // If this grows/shrinks, then Render Matrix IS scaling.
        const size = 0.015; 
        mat4.scale(currentMat, currentMat, [size, size, size]);
      }
    }

    // Allow Start ONLY if Picked. Allow Continue ALWAYS if Trigger is held.
    const canSculpt = isTriggerPressed && (picked || this._vrSculpting);

    if (canSculpt) {
      if (!this._vrSculpting) {
        this._vrSculpting = true;

        // Deep Trace: Start Stroke
        if (window.screenLog && this._logThrottle++ % 60 === 0) {
          window.screenLog("Sculpt: START STROKE (r=" + sliderVal.toFixed(2) + ")", "lime");
        }

        this._sculptManager.start(false);
        this._action = Enums.Action.SCULPT_EDIT;
      }
      this._sculptManager.preUpdate(); // Sync position

      // CRITICAL: pass picking to updateXR if supported, else standard update
      if (this._sculptManager.updateXR) {
        this._sculptManager.updateXR(this._picking);
      } else {
        this._sculptManager.update();
      }
    } else {
      if (this._vrSculpting) {
        this._vrSculpting = false;

        // Deep Trace: End Stroke
        if (window.screenLog) window.screenLog("Sculpt: END STROKE", "lime");

        this._sculptManager.end();
        this._action = Enums.Action.NOTHING;
      }
    }

    // 5. Debug Cursor (Visual Feedback)
    if (this.updateDebugCursor) {
      if (picked) {
        const mesh = this._picking.getMesh();
        if (mesh) {
          const localInter = this._picking.getIntersectionPoint();
          const worldInter = vec3.create();
          vec3.transformMat4(worldInter, localInter, mesh.getMatrix());
          this.updateDebugCursor(worldInter, true);
          // Yellow for Hit
          if (this._debugCursor) this._debugCursor.setFlatColor([1.0, 1.0, 0.0]);
        }
      } else {
        // Show at Controller Tip (Red) - The Constant Probe Pattern
        this.updateDebugCursor(enginePos, true);
        if (this._debugCursor) this._debugCursor.setFlatColor([1.0, 0.0, 0.0]);
      }
    }
  }
}



export default Scene;
