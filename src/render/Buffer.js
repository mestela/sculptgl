class Buffer {

  constructor(gl, type, hint, tag = "Untagged") {
    this._gl = gl; // webgl context
    this._buffer = gl.createBuffer(); // the buffer
    this._type = type; // the type (vert data vs index)
    this._hint = hint; //the buffer update hint
    this._size = 0; // the size of the buffer
    this._tag = tag;
  }

  bind() {
    if (!this._buffer) this._buffer = this._gl.createBuffer();
    this._gl.bindBuffer(this._type, this._buffer);
  }

  release() {
    this._gl.deleteBuffer(this._buffer);
    this._buffer = null;
    this._size = 0;
  }

  update(data, nbElts) {
    this.bind();

    // Clear previous errors
    while (this._gl.getError() !== this._gl.NO_ERROR) { };

    if (nbElts !== undefined && nbElts !== data.length)
      data = data.subarray(0, nbElts);

    if (data.length > this._size) {
      this._gl.bufferData(this._type, data, this._hint);
      this._size = data.length;
    } else {
      this._gl.bufferSubData(this._type, 0, data);
    }

    var err = this._gl.getError();
    if (err !== this._gl.NO_ERROR) {
      console.error("Buffer Update Error:", err);
      var typeStr = (this._type === 34962) ? "ARRAY_BUFFER" : ((this._type === 34963) ? "ELEMENT_ARRAY_BUFFER" : "UNKNOWN");
      if (window.screenLog) window.screenLog(`Buf Err ${err} (${typeStr}) [${this._tag}] len=${data.length}`, "red");
    }
  }
}

export default Buffer;
