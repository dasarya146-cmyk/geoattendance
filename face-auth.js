/* ================================================================
   face-auth.js — Face Authentication Module
   Uses @vladmandic/face-api loaded from jsDelivr CDN
   ================================================================ */

'use strict';

const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/';
const VERIFY_HOLD_MS = 2000; // Must hold face for 2 seconds continuously

class FaceAuth {
  /**
   * @param {Object} opts
   * @param {HTMLVideoElement}  opts.videoEl
   * @param {HTMLCanvasElement} opts.canvasEl
   * @param {HTMLElement}       opts.statusEl
   * @param {HTMLElement}       opts.progressBarEl
   * @param {HTMLElement}       opts.placeholderEl
   * @param {HTMLElement}       opts.verifiedOverlayEl
   * @param {Function}          opts.onVerified
   * @param {Function}          opts.onError
   */
  constructor(opts) {
    this.videoEl           = opts.videoEl;
    this.canvasEl          = opts.canvasEl;
    this.statusEl          = opts.statusEl;
    this.progressBarEl     = opts.progressBarEl;
    this.placeholderEl     = opts.placeholderEl;
    this.verifiedOverlayEl = opts.verifiedOverlayEl;
    this.onVerified        = opts.onVerified || (() => {});
    this.onError           = opts.onError   || (() => {});

    this._verified         = false;
    this._stream           = null;
    this._animFrameId      = null;
    this._detectionStart   = null;
    this._modelLoaded      = false;
    this._running          = false;
  }

  // ── Public API ──────────────────────────────────────────────────

  get isVerified() { return this._verified; }

  /** Start model load + camera */
  async start() {
    if (this._running) return;
    this._running = true;

    try {
      this._setStatus('loading', 'Loading face detection model...');

      if (!this._modelLoaded) {
        await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
        this._modelLoaded = true;
      }

      this._setStatus('loading', 'Starting camera...');
      await this._startCamera();
      this._runDetectionLoop();
    } catch (err) {
      this._running = false;
      const msg = this._friendlyError(err);
      this._setStatus('error', msg);
      this.onError(err, msg);
    }
  }

  /** Stop camera and detection */
  stop() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this.videoEl.srcObject = null;
    this._running = false;
  }

  /** Reset to initial state (allows re-verification) */
  reset() {
    this.stop();
    this._verified = false;
    this._detectionStart = null;
    if (this.progressBarEl) this.progressBarEl.style.width = '0%';
    if (this.verifiedOverlayEl) this.verifiedOverlayEl.hidden = true;
    if (this.placeholderEl) this.placeholderEl.style.display = '';
    this._setStatus('idle', 'Camera not started');
  }

  // ── Private Methods ─────────────────────────────────────────────

  async _startCamera() {
    const constraints = {
      video: {
        facingMode: 'user',
        width:  { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
      },
      audio: false,
    };

    this._stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.videoEl.srcObject = this._stream;
    this.videoEl.setAttribute('playsinline', 'true'); // Required for iOS Safari

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Video load timeout')), 12000);
      this.videoEl.onloadedmetadata = () => {
        clearTimeout(timeout);
        this.videoEl.play().then(resolve).catch(reject);
      };
    });

    // Hide placeholder, show video
    if (this.placeholderEl) this.placeholderEl.style.display = 'none';
  }

  _runDetectionLoop() {
    this._setStatus('scanning', 'Position your face in the frame...');

    const loop = async () => {
      // Stop if verified or camera stopped
      if (this._verified || !this._running) return;

      // Wait for video to be ready
      if (!this.videoEl.readyState || this.videoEl.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        this._animFrameId = requestAnimationFrame(loop);
        return;
      }

      try {
        const detection = await faceapi.detectSingleFace(
          this.videoEl,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
        );

        this._drawOverlay(detection);

        if (detection) {
          // Face found — start/continue hold timer
          if (!this._detectionStart) this._detectionStart = Date.now();
          const elapsed  = Date.now() - this._detectionStart;
          const progress = Math.min((elapsed / VERIFY_HOLD_MS) * 100, 100);

          if (this.progressBarEl) this.progressBarEl.style.width = `${progress}%`;

          if (elapsed >= VERIFY_HOLD_MS) {
            this._onFaceVerified();
            return; // Do not request another frame
          }

          const remaining = Math.ceil((VERIFY_HOLD_MS - elapsed) / 1000);
          this._setStatus('detecting', `Face detected! Hold still... ${remaining}s`);
        } else {
          // No face — reset hold timer
          this._detectionStart = null;
          if (this.progressBarEl) this.progressBarEl.style.width = '0%';
          this._setStatus('scanning', 'Position your face in the frame...');
        }
      } catch (_err) {
        // Suppress individual frame errors; model may not be ready yet
      }

      this._animFrameId = requestAnimationFrame(loop);
    };

    this._animFrameId = requestAnimationFrame(loop);
  }

  _drawOverlay(detection) {
    const ctx = this.canvasEl.getContext('2d');
    const displaySize = {
      width:  this.videoEl.offsetWidth  || 320,
      height: this.videoEl.offsetHeight || 240,
    };
    faceapi.matchDimensions(this.canvasEl, displaySize);
    ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

    if (!detection) return;

    const resized = faceapi.resizeResults(detection, displaySize);
    const { x, y, width, height } = resized.box;
    const cornerLen = Math.min(width, height) * 0.25;

    ctx.strokeStyle = '#00c47a';
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#00c47a';
    ctx.shadowBlur  = 10;
    ctx.lineCap     = 'round';

    ctx.beginPath();
    // Top-left corner
    ctx.moveTo(x, y + cornerLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLen, y);
    // Top-right corner
    ctx.moveTo(x + width - cornerLen, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + cornerLen);
    // Bottom-right corner
    ctx.moveTo(x + width, y + height - cornerLen);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width - cornerLen, y + height);
    // Bottom-left corner
    ctx.moveTo(x + cornerLen, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + height - cornerLen);
    ctx.stroke();
  }

  _onFaceVerified() {
    this._verified = true;
    if (this.progressBarEl)     this.progressBarEl.style.width = '100%';
    if (this.verifiedOverlayEl) {
       this.verifiedOverlayEl.hidden = false;
       setTimeout(() => {
         if (this.verifiedOverlayEl) this.verifiedOverlayEl.hidden = true;
       }, 2500);
    }
    this._setStatus('verified', 'Face Verified ✓');
    this.stop(); // Release camera after verification
    this.onVerified();
  }

  _setStatus(state, text) {
    if (this.statusEl) {
      this.statusEl.setAttribute('data-state', state);
      this.statusEl.textContent = text;
    }
  }

  _friendlyError(err) {
    if (!err) return 'Unknown error occurred.';
    const name = err.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
      return 'Camera permission denied. Please allow camera access in your browser settings and try again.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
      return 'No camera found. Please use a device with a front-facing camera.';
    if (name === 'NotSupportedError')
      return 'Camera is not supported on this browser. Please use Chrome or Safari.';
    if (name === 'NotReadableError' || name === 'TrackStartError')
      return 'Camera is in use by another application. Please close it and try again.';
    if (name === 'OverconstrainedError')
      return 'Camera does not meet requirements. Try a different device.';
    if (err.message && err.message.includes('timeout'))
      return 'Camera took too long to start. Please refresh and try again.';
    return `Camera error: ${err.message || err.toString()}`;
  }
}
