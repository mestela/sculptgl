import { mat4 } from 'gl-matrix';
import MeshStatic from 'mesh/meshStatic/MeshStatic';
import Enums from 'misc/Enums';

class VRLaser {

  constructor(gl) {
    this._mesh = new MeshStatic(gl);
    this._mesh.setMode(gl.LINES);
    this._mesh.setUseDrawArrays(true);

    // Line from origin to -5m forward
    const vertices = new Float32Array([
      0.0, 0.0, 0.0,
      0.0, 0.0, -5.0
    ]);

    this._mesh.setVertices(vertices);
    this._mesh.init();
    this._mesh.initRender();
    
    // Red color
    this._mesh.setFlatColor([1.0, 0.0, 0.0]);
    this._mesh.setShaderType(Enums.Shader.FLAT);
  }

  updateMatrices(camera, controllerMatrix) {
    if (controllerMatrix) {
        const m = this._mesh.getMatrix();
        mat4.copy(m, controllerMatrix);
        this._mesh.updateMatrices(camera);
    }
  }

  render(main) {
    this._mesh.render(main);
  }
}

export default VRLaser;
