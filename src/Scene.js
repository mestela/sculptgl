import { vec3, mat3, mat4, quat } from 'gl-matrix';
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
import VRLaser from 'drawables/VRLaser';
import Gnomon from 'drawables/Gnomon';
import VRMenu from 'drawables/VRMenu';

class Scene {

  constructor() {
    this._gl = null; // webgl context
    console.log("SCENE.JS LOADED: v=debug4 (Deep Trace Active)");

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
    var scale = 0.5; // Reasonable grid size for VR
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

    // Debug Logging (User Request)
    if (this._logThrottle === undefined) this._logThrottle = 0;
    if (this._logThrottle++ > 60) {
      this._logThrottle = 0;
      if (this._xrWorldOffset) {
        let p = this._xrWorldOffset.position;
        console.log(`VR State - Scale: ${this._vrScale.toFixed(3)}, Pos: [${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}]`);
      }
    }

    if (this._vrScale === undefined) this._vrScale = 1.0;

    // FBO is already bound by callee
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Lazy init controllers
    if (!this._vrControllerLeft || !this._vrControllerRight) {
      this.initVRControllers();
    }

    var cam = this._camera;
    var meshes = this._meshes;
    var grid = this._grid;

    var ctrls = [];
    var ctrls = [];
    if (this._vrControllerLeft) ctrls.push(this._vrControllerLeft);
    // Right Controller (Gnomon) is handled separately in the specialized block below
    // if (this._vrControllerRight) ctrls.push(this._vrControllerRight);

    for (const view of pose.views) {
      const viewport = glLayer.getViewport(view);
      gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);

      // --- PASS 1: REAL WORLD (Controllers/Debug) ---
      mat4.copy(cam._view, view.transform.inverse.matrix);
      mat4.copy(cam._proj, view.projectionMatrix);

      for (let j = 0; j < ctrls.length; ++j) {
        ctrls[j].updateMatrices(cam);
        ctrls[j].render(this);
      }

      // VR Menu (Attached to Left Controller) - Pass 1 (Real World)
      if (this._vrMenu && this._vrPoseLeft) {
        this._vrMenu.updateMatrices(cam, this._vrPoseLeft);
        this._vrMenu.render(this);
      }

      // VR Laser & Interaction (Attached to Right Controller)
      // Use Ray Pose for Laser
      const matRay = this._vrPoseRightRay;
      this._vrLaser.updateMatrices(cam, matRay);
      this._vrLaser.render(this);

      // Interaction Logic uses Ray Pose
      if (this._vrMenu) {
        // Compute Ray from Raw Pose
        const origin = vec3.fromValues(matRay[12], matRay[13], matRay[14]);

        // Forward is -Z
        const target = vec3.create();
        vec3.transformMat4(target, [0, 0, -1], matRay);
        const dir = vec3.create();
        vec3.sub(dir, target, origin);
        vec3.normalize(dir, dir);

        const hit = this._vrMenu.intersect(origin, dir);
        if (hit) {
          this._guiXR.setCursor(hit.uv[0], hit.uv[1]);
          // Throttle debug log
          if (!this._hitLogThrottle) this._hitLogThrottle = 0;
          if (this._hitLogThrottle++ > 30) {
            this._hitLogThrottle = 0;
            console.log(`Hit: UV[${hit.uv[0].toFixed(2)}, ${hit.uv[1].toFixed(2)}]`);
          }
        } else {
          this._guiXR.setCursor(-1, -1);
          // Throttle Miss Log?
          if (!this._missLogThrottle) this._missLogThrottle = 0;
          if (this._missLogThrottle++ > 180) { // ~3s
            this._missLogThrottle = 0;
            // Debug Origin/Dir
            console.log("Miss: Origin", origin, "Dir", dir);
          }
        }
      }

      // Render Gnomon (at Grip Pose)
      if (this._vrControllerRight && this._vrPoseRightGrip) {
        this._vrControllerRight.updateMatrices(cam, this._vrPoseRightGrip);
        this._vrControllerRight.render(this);
      }

      // --- PASS 2: SCALED WORLD (Content) ---
      if (this._vrScale !== 1.0) {
        mat4.scale(cam._view, cam._view, [this._vrScale, this._vrScale, this._vrScale]);
      }

      if (this._showGrid && grid) {
        grid.updateMatrices(cam);
        grid.render(this);
      }

      // Brush Ring (Projected)
      if (this._sculptManager) {
        gl.enable(gl.DEPTH_TEST);
        // Use GuiXR radius if available, else default 0.05
        const radius = this._guiXR ? this._guiXR._radius : 0.05;
        this._sculptManager.getSelection().renderVR(this, cam, radius);
      }

      for (let i = 0, l = meshes.length; i < l; ++i) {
      if (!meshes[i].isVisible()) continue;
        meshes[i].updateMatrices(cam);
      meshes[i].render(this);
    }
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

    // VR Menu Scaffolding
    this._guiXR = new GuiXR(this);
    this._guiXR.init(gl);
    this._vrMenu = new VRMenu(gl, this._guiXR);
    this._vrLaser = new VRLaser(gl);
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
    // 50cm diameter sphere (0.25 radius)
    mat4.scale(mesh.getMatrix(), mesh.getMatrix(), [0.25, 0.25, 0.25]);
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
    this._vrScale = 0.037; // User calibrated preference

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

          // Initial Calibrated Offset (Total)
          // Combines user preference for Height (Y) and Depth (Z)
          this._xrWorldOffset = new XRRigidTransform({
            x: -0.035,
            y: 0.995,
            z: -0.609,
            w: 1.0
          });

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

    // Simply apply the current World Offset to the Base Space
    if (this._xrWorldOffset) {
      this._xrRefSpace = this._baseRefSpace.getOffsetReferenceSpace(this._xrWorldOffset);
    } else {
      this._xrRefSpace = this._baseRefSpace;
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

  rotateWorld(qDelta, pivot) {
    if (!this._xrWorldOffset) this._xrWorldOffset = new XRRigidTransform({ x: 0, y: 0, z: 0 });

    // 1. Convert transform to math types
    let pos = vec3.fromValues(this._xrWorldOffset.position.x, this._xrWorldOffset.position.y, this._xrWorldOffset.position.z);
    let rot = quat.fromValues(this._xrWorldOffset.orientation.x, this._xrWorldOffset.orientation.y, this._xrWorldOffset.orientation.z, this._xrWorldOffset.orientation.w);

    // 2. Rotate Position around Pivot
    // P_new = Pivot + qDelta * (P_old - Pivot)
    let diff = vec3.create();
    vec3.sub(diff, pos, pivot);
    vec3.transformQuat(diff, diff, qDelta);
    vec3.add(pos, pivot, diff);

    // 3. Rotate Orientation
    // Q_new = qDelta * Q_old
    quat.multiply(rot, qDelta, rot);

    this._xrWorldOffset = new XRRigidTransform(
      { x: pos[0], y: pos[1], z: pos[2], w: 1.0 },
      { x: rot[0], y: rot[1], z: rot[2], w: rot[3] }
    );
    this.updateVROffsets();
  }

  scaleWorld(ratio, pivot) {
    if (this._vrScale === undefined) this._vrScale = 1.0;

    // 1. Update Scale
    this._vrScale *= ratio;

    // 2. Update Position to maintain Pivot
    // If pivoting around Origin (0,0,0), we don't need to move the world origin.
    if (vec3.length(pivot) < 0.0001) {
      // Just Scale. Position of Origin stays same in Base Space?
      // Actually, if we Scale World, and Origin is at (0,0,0).
      // Origin stays at (0,0,0).
      // So no offset change needed.
      return;
    }

    // Origin_new = Pivot + (Origin_old - Pivot) / ratio
    if (!this._xrWorldOffset) this._xrWorldOffset = new XRRigidTransform({ x: 0, y: 0, z: 0 });
    let pos = vec3.fromValues(this._xrWorldOffset.position.x, this._xrWorldOffset.position.y, this._xrWorldOffset.position.z);

    let diff = vec3.create();
    vec3.sub(diff, pos, pivot);
    vec3.scale(diff, diff, 1.0 / ratio);
    vec3.add(pos, pivot, diff);

    this._xrWorldOffset = new XRRigidTransform(
      { x: pos[0], y: pos[1], z: pos[2], w: 1.0 },
      this._xrWorldOffset.orientation
    );
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
    var gl = this._gl;
    if (!gl) return;

    this._vrPoseLeft = mat4.create(); // Grip
    this._vrPoseRightGrip = mat4.create();
    this._vrPoseRightRay = mat4.create();

    const makeCtrl = (color) => {
      var mesh = new Multimesh(Primitives.createCube(gl));
      mesh.normalizeSize();
      mat4.scale(mesh.getMatrix(), mat4.create(), [0.0, 0.0, 0.0]); // Start hidden
      mesh.setShaderType(Enums.Shader.FLAT);
      mesh.setFlatColor(color);
      mesh.init();
      mesh.initRender();
      return mesh;
    };

    if (Primitives) {
      this._vrControllerLeft = makeCtrl([0.0, 1.0, 0.0]); // GREEN
      // Right Controller is now a Gnomon
      this._vrControllerRight = new Gnomon(gl);
    }
  }

  updateVRControllerPose(handedness, position, orientation, spaceType = 'grip') {
    // Convert DOMPoint (WebXR) to Array (gl-matrix) if needed
    const pos = (position.length !== undefined) ? position : [position.x, position.y, position.z];
    const rot = (orientation.length !== undefined) ? orientation : [orientation.x, orientation.y, orientation.z, orientation.w];

    if (handedness === 'left') {
      // Left: Update Pose Data
      mat4.fromRotationTranslation(this._vrPoseLeft, rot, pos);
      if (this._vrControllerLeft) {
        var mat = this._vrControllerLeft.getMatrix();
        mat4.copy(mat, this._vrPoseLeft);
        mat4.scale(mat, mat, [0.02, 0.02, 0.02]);
      }
    } else {
      // Right
      let targetMat = (spaceType === 'grip') ? this._vrPoseRightGrip : this._vrPoseRightRay;

      if (targetMat) {
        mat4.fromRotationTranslation(targetMat, rot, pos);

        // Debug Log for Ray
        if (spaceType === 'ray') {
          if (!this._rayLogThrottle) this._rayLogThrottle = 0;
          if (this._rayLogThrottle++ % 120 === 0) {
            console.log(`VR Ray Update: Pos=[${pos[0].toFixed(3)}, ${pos[1].toFixed(3)}, ${pos[2].toFixed(3)}] Mat=[${targetMat[12].toFixed(3)}, ${targetMat[13].toFixed(3)}, ${targetMat[14].toFixed(3)}]`);
          }
        }
      }
    }
  }

  initDebugCursor() {
    var gl = this._gl;
    if (!gl) return;

    this._debugCursor = Primitives.createCube(gl);
    // this._debugCursor.normalizeSize(); // Unnecessary as we reset matrix

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
      mat4.scale(mat, mat, [0.05, 0.05, 0.05]);
    } else {
      if (this._debugCursor.isVisible()) {
        this._debugCursor.setVisible(false);
      }
    }
  }

  _drawSceneVR() {
    var gl = this._gl;
    gl.enable(gl.DEPTH_TEST);

    // Important: Update Matrices with VR Camera
    var cam = this.getCamera();

    // grid
    if (this._showGrid) {
      this._grid.updateMatrices(cam);
      this._grid.render(this);
    }

    // VR Controllers
    if (this._vrControllerLeft) {
      this._vrControllerLeft.updateMatrices(cam);
      this._vrControllerLeft.render(this);
    }
    if (this._vrControllerRight && this._vrPoseRightGrip) {
      this._vrControllerRight.updateMatrices(cam, this._vrPoseRightGrip);
      this._vrControllerRight.render(this);
    }

    // Meshes (Opaque)
    var meshes = this._meshes;
    for (var i = 0, l = meshes.length; i < l; ++i) {
      if (!meshes[i].isVisible()) continue;
      meshes[i].updateMatrices(cam);
      meshes[i].render(this);
    }

    // Debug Cursor (Last + X-Ray)
    if (this._debugCursor) {
      // Unconditional Debug Logging
      if (!this._vrLogThrottle) this._vrLogThrottle = 0;
      if (this._vrLogThrottle++ % 120 === 0) {
        const cursorMat = this._debugCursor.getMatrix();
        const rightMat = this._vrControllerRight ? this._vrControllerRight.getMatrix() : null;
        console.log("VR Debug:",
          "Vis:", this._debugCursor.isVisible(),
          "Cursor:", cursorMat.slice(12, 15),
          "RightCtrl:", rightMat ? rightMat.slice(12, 15) : "N/A"
        );
      }

      if (this._debugCursor.isVisible()) {
        this._debugCursor.updateMatrices(cam);
        gl.disable(gl.DEPTH_TEST); // X-Ray
        this._debugCursor.render(this);
        gl.enable(gl.DEPTH_TEST);
      }
    }
  }

  onXRFrame(time, frame) {
    const session = frame.session;
    session.requestAnimationFrame(this.onXRFrame.bind(this));

    const pose = frame.getViewerPose(this._xrRefSpace);
    if (pose) {
      const gl = this._gl;
      const glLayer = session.renderState.baseLayer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Log Input Sources (First 200 frames always, then throttled)
      if (!this._logFrameCount) this._logFrameCount = 0;
      this._logFrameCount++;

      if (this._logFrameCount < 200 || (this._logFrameCount % 120 === 0)) {
        const sources = frame.session.inputSources;
        let msg = `XR Frame (i=${this._logFrameCount}): ${sources.length} inputs. `;
        for (const s of sources) {
          msg += `[${s.handedness}, Ray:${!!s.targetRaySpace}, Grip:${!!s.gripSpace}] `;
        }
        console.log(msg);
      }

      // Handle Input (Bypass Legacy "handleXRInput" for Interaction)
      this.handleXRInput(frame, this._xrRefSpace); // Keep for button clicks/grip
      this.updateVRInteractionSimple(frame, this._xrRefSpace); // New Direct Ray Path

      // Render to WebXR framebuffer
      this.renderVR(glLayer, pose);
    }
  }

  // --- NEW SIMPLE INTERACTION PATH ---
  updateVRInteractionSimple(frame, refSpace) {
    const session = frame.session;
    let rightSource = null;

    // 1. Find Right Controller
    for (const source of session.inputSources) {
      if (source.handedness === 'right') {
        rightSource = source;
        break;
      }
    }

    // Logging Pulse (Every ~2s)
    const doLog = (this._logFrameCount % 120 === 0);

    if (!rightSource || !rightSource.targetRaySpace) {
      if (doLog) console.log("[SimpleRay] No Right Ray Space found.");
      return;
    }

    // 2. Get Pose
    const pose = frame.getPose(rightSource.targetRaySpace, refSpace);
    if (!pose) {
      if (doLog) console.log("[SimpleRay] No Pose for Right Ray.");
      return;
    }

    // 3. Direct Matrix Use
    // WebXR matrix is Float32Array(16) column-major, same as gl-matrix
    const mat = pose.transform.matrix;

    // Update internal state for rendering (optional but good for visual debugging)
    if (this._vrPoseRightRay) {
      mat4.copy(this._vrPoseRightRay, mat);
    }

    // 4. Calculate Origin & Direction
    // Origin is translation (elements 12, 13, 14)
    const origin = vec3.fromValues(mat[12], mat[13], mat[14]);

    // Direction is -Z transformed by rotation
    // We can extract forward vector from matrix (3rd column, negated)
    const dir = vec3.fromValues(-mat[8], -mat[9], -mat[10]);
    vec3.normalize(dir, dir);

    // Logging Pulse (Every ~2s)
    // const doLog = (this._logFrameCount % 120 === 0);

    // 5. Intersect Menu
    if (this._vrMenu) {
      const hit = this._vrMenu.intersect(origin, dir);
      if (hit) {
        this._guiXR.setCursor(hit.uv[0], hit.uv[1]);
      } else {
        this._guiXR.setCursor(-1, -1);
      }
    }
  }

  handleXRInput(frame, refSpace) {
    const session = frame.session;

    for (let i = 0; i < session.inputSources.length; i++) {
      const source = session.inputSources[i];
      if (!source.gripSpace && !source.targetRaySpace) continue;

      if (source.handedness === 'left') {
        if (source.gripSpace) {
          const pose = frame.getPose(source.gripSpace, refSpace);
          if (pose) this.updateVRControllerPose('left', pose.transform.position, pose.transform.orientation, 'grip');
        }
      } else if (source.handedness === 'right') {
        // Right Hand: Separate Grip & Ray

        // Debug Tracing (Throttled but active)
        const doLog = (this._logFrameCount % 120 === 0);

        // 1. Grip
        if (source.gripSpace) {
          const pose = frame.getPose(source.gripSpace, refSpace);
          if (pose) this.updateVRControllerPose('right', pose.transform.position, pose.transform.orientation, 'grip');
        }

        // 2. Ray Logic
        let rayPose = null;
        if (source.targetRaySpace) {
          rayPose = frame.getPose(source.targetRaySpace, refSpace);
        }

        if (doLog) console.log(`[Right Trace] HasRaySpace: ${!!source.targetRaySpace} GotFromFrame: ${!!rayPose}`);

        // Fallback to Grip if Ray is missing or suspicious (0,0,0)
        let isSuspicious = false;
        if (rayPose) {
          const p = rayPose.transform.position;
          // DOMPoint or Array check
          const px = p.x ?? p[0];
          const py = p.y ?? p[1];
          const pz = p.z ?? p[2];

          if (Math.abs(px) < 0.0001 && Math.abs(py) < 0.0001 && Math.abs(pz) < 0.0001) {
            isSuspicious = true;
          }
        }

        if (doLog && rayPose) console.log(`[Right Trace] Suspicious: ${isSuspicious}`);

        if ((!rayPose || isSuspicious) && source.gripSpace) {
          rayPose = frame.getPose(source.gripSpace, refSpace);
          if (doLog) console.log(`[Right Trace] Used Fallback to Grip`);
        }

        if (rayPose) {
          if (doLog) console.log(`[Right Trace] Calling updateVRControllerPose for RAY`);
          this.updateVRControllerPose('right', rayPose.transform.position, rayPose.transform.orientation, 'ray');
        }


        // Gamepad Input
        if (source.gamepad) {
          const gp = source.gamepad;
          // Trigger (Button 0) - Click
          if (gp.buttons.length > 0) {
            const trigger = gp.buttons[0];
            if (trigger.pressed && !this._lastTrigger) {
              if (this._guiXR && this._guiXR._cx >= 0) {
                this._guiXR.click();
              }
            }
            this._lastTrigger = trigger.pressed;
          }

          // Grip (Button 1) - Calibration Mode
          if (gp.buttons.length > 1) {
            const grip = gp.buttons[1];
            if (grip.pressed) {
              if (gp.axes.length >= 2) {
                const stickX = (Math.abs(gp.axes[2]) > 0.1) ? gp.axes[2] : gp.axes[0];
                const stickY = (Math.abs(gp.axes[3]) > 0.1) ? gp.axes[3] : gp.axes[1];

                if (Math.abs(stickX) > 0.1 || Math.abs(stickY) > 0.1) {
                  const speed = 0.05;
                  if (this._vrMenu) {
                    this._vrMenu.adjustRotation(stickY * speed, stickX * speed, 0);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}



export default Scene;
