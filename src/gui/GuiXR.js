class GuiXR {

  constructor(main) {
    this._main = main;
    this._gl = main._gl;

    this._canvas = document.createElement('canvas');
    this._canvas.width = 512;
    this._canvas.height = 512;
    this._ctx = this._canvas.getContext('2d');

    this._texture = null;
    this._needsUpdate = true;
  }

  init(gl) {
    if (this._texture) return; // Already init
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Initial Draw (Static Pattern)
    this.draw();
  }

  draw() {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;

    // Background
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);

    // Header
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, w, 80);

    // Title
    ctx.fillStyle = 'white';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VR Tools (Static)', w / 2, 40);

    // Border
    ctx.strokeStyle = '#00D0FF';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, w, h);

    this._needsUpdate = true;
  }

  updateTexture() {
    if (!this._needsUpdate || !this._texture) return;

    var gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._canvas);
    this._needsUpdate = false;
  }

  getTexture() {
    return this._texture;
  }
}

export default GuiXR;
