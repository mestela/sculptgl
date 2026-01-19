
console.log("%c SCENE v75 ZERO IMPORTS ", "background: purple; color: white; font-size: 20px");

class Scene {
  constructor(gl, stateManager) {
    this._gl = gl;
    console.log("Scene Zero Import constructor");
  }
  onXREnd() { }
  enterXR() { }
  render() { }
}

export default Scene;
