import Enums from 'misc/Enums';

class GuiXR {

  constructor(main) {
    this._main = main;
    this._gl = main._gl;

    this._canvas = document.createElement('canvas');
    this._canvas.width = 512;
    this._canvas.height = 512;
    this._ctx = this._canvas.getContext('2d');

    this._needsUpdate = true;
    this._textureAllocated = false;

    // Widgets State
    this._widgets = [
      // Sliders
      { type: 'slider', id: 'radius', x: 20, y: 80, w: 200, h: 40, label: 'Radius', value: 0.5 },
      { type: 'slider', id: 'intensity', x: 20, y: 140, w: 200, h: 40, label: 'Intensity', value: 0.5 },

      // Tools (Grid 2xN)
      { type: 'button', id: Enums.Tools.BRUSH, label: 'Brush', x: 20, y: 220, w: 100, h: 40 },
      { type: 'button', id: Enums.Tools.INFLATE, label: 'Inflate', x: 130, y: 220, w: 100, h: 40 },

      { type: 'button', id: Enums.Tools.SMOOTH, label: 'Smooth', x: 20, y: 270, w: 100, h: 40 },
      { type: 'button', id: Enums.Tools.FLATTEN, label: 'Flatten', x: 130, y: 270, w: 100, h: 40 },

      { type: 'button', id: Enums.Tools.PINCH, label: 'Pinch', x: 20, y: 320, w: 100, h: 40 },
      { type: 'button', id: Enums.Tools.CREASE, label: 'Crease', x: 130, y: 320, w: 100, h: 40 },

      { type: 'button', id: Enums.Tools.DRAG, label: 'Drag', x: 20, y: 370, w: 100, h: 40 },
      { type: 'button', id: Enums.Tools.MOVE, label: 'Move', x: 130, y: 370, w: 100, h: 40 },

      { type: 'button', id: Enums.Tools.PAINT, label: 'Paint', x: 20, y: 420, w: 100, h: 40 },
      { type: 'button', id: Enums.Tools.MASKING, label: 'Mask', x: 130, y: 420, w: 100, h: 40 }
    ];
    this._cursor = { x: -1, y: -1, active: false };
    this._radius = 0.5; // Expose for VR Scene
  }

  init(gl) {
    if (this._texture) return; // Already init
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.draw();
  }

  setCursor(u, v) {
    if (u < 0) {
      this._cursor.active = false;
    } else {
      this._cursor.active = true;
      this._cursor.x = u * this._canvas.width;
      this._cursor.y = v * this._canvas.height;
    }
    this._needsUpdate = true;
    this.draw();
  }

  onInteract(u, v, isPressed) {
    if (!this._cursor.active || !isPressed) return;

    const cx = this._cursor.x;
    const cy = this._cursor.y;

    for (let w of this._widgets) {
      if (cx >= w.x && cx <= w.x + w.w && cy >= w.y && cy <= w.y + w.h) {

        if (w.type === 'slider') {
          // Hit Slider
          const val = Math.max(0, Math.min(1, (cx - w.x) / w.w));
          w.value = val;
          this._needsUpdate = true;
          this.draw();

          // Callback (Throttled 30Hz)
          const now = performance.now();
          if (!this._lastCallback) this._lastCallback = 0;

          if (this._main && (now - this._lastCallback > 30)) {
            this._lastCallback = now;
            // Explicit lightweight setters to avoid lag
            if (w.id === 'radius') {
              this._radius = val;
              this._main.getSculptManager().getTool().setRadius(val * 100);
            }
            if (w.id === 'intensity') this._main.getSculptManager().getTool().setIntensity(val);
          }
        } else if (w.type === 'button') {
          // Hit Button
          // Throttle button clicks strictly to avoid spam
          const now = performance.now();
          if (!this._lastClick) this._lastClick = 0;
          if (now - this._lastClick > 200) { // 200ms debounce
            this._lastClick = now;
            if (this._main) {
              this._main.getSculptManager().setToolIndex(w.id);
              this._needsUpdate = true;
              this.draw();
            }
          }
        }
      }
    }
  }

  click() {
    if (!this._cursor.active) return;
    this.onInteract(this._cursor.x / this._canvas.width, this._cursor.y / this._canvas.height, true);
  }

  draw() {
    // Throttle Draw (30fps)
    const now = performance.now();
    if (!this._lastDraw) this._lastDraw = 0;
    if (now - this._lastDraw < 30) return;
    this._lastDraw = now;

    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;

    // Background
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);

    // Header
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, w, 60); // Smaller header
    ctx.fillStyle = 'white';
    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VR Tools (Step 3)', w / 2, 30);

    // Active Tool
    let activeTool = -1;
    if (this._main && this._main.getSculptManager && this._main.getSculptManager()) {
      activeTool = this._main.getSculptManager().getToolIndex();
    }

    // Widgets
    for (let w of this._widgets) {
      if (w.type === 'slider') {
        // Bg
        ctx.fillStyle = '#555';
        ctx.fillRect(w.x, w.y, w.w, w.h);

        // Fill based on value
        ctx.fillStyle = '#0070A0';
        ctx.fillRect(w.x, w.y, w.w * w.value, w.h);

        // Border
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 2;
        ctx.strokeRect(w.x, w.y, w.w, w.h);

        // Custom Label
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.font = '20px sans-serif';
        ctx.fillText(w.label, w.x + 10, w.y + 25);

      } else if (w.type === 'button') {
        // Check active
        const isActive = (w.id === activeTool);

        // Bg
        ctx.fillStyle = isActive ? '#00A040' : '#444'; // Green if active
        ctx.fillRect(w.x, w.y, w.w, w.h);

        // Border
        ctx.strokeStyle = isActive ? '#fff' : '#888';
        ctx.lineWidth = isActive ? 3 : 1;
        ctx.strokeRect(w.x, w.y, w.w, w.h);

        // Label
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.font = '18px sans-serif';
        ctx.fillText(w.label, w.x + w.w / 2, w.y + w.h / 2);
      }
    }

    // Cursor (Red Ring)
    if (this._cursor.active) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(this._cursor.x, this._cursor.y, 10, 0, Math.PI * 2);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(this._cursor.x, this._cursor.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = '#00D0FF';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, w, h);

    this._needsUpdate = true;
  }

  updateTexture() {
    if (!this._needsUpdate || !this._texture) return;

    // Throttle: Limit to 30fps (every ~33ms)
    const now = performance.now();
    if (!this._lastUpload) this._lastUpload = 0;
    if (now - this._lastUpload < 30) return;

    this._lastUpload = now;
    const gl = this._gl;

    // Save previous texture binding
    const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    if (this._textureAllocated) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._canvas);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._canvas);
      this._textureAllocated = true;
    }

    // Restore
    if (prevTex) gl.bindTexture(gl.TEXTURE_2D, prevTex);

    this._needsUpdate = false;
  }

  getTexture() {
    return this._texture;
  }
}

export default GuiXR;
