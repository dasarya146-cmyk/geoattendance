/* ================================================================
   app.js — Main Application Logic (Firebase Edition)
   Geo Attendance System v3.0 — GITAM Bhubaneswar
   ================================================================ */

'use strict';

// ── Campus / Attendance Config ────────────────────────────────────
const CONFIG = {
  campus: { lat: 20.2169125, lon: 85.6829219, maxMeters: 700 }, // updated
  window: { startH: 9, startM: 0, endH: 9, endM: 45 },
  gps: { timeout: 10000, maximumAge: 0, enableHighAccuracy: true },
};

// ── State ─────────────────────────────────────────────────────────
const state = {
  location: { captured: false, lat: null, lon: null, accuracy: null, distance: null },
  face: { verified: false },
  form: { valid: false },
  timeOk: false,
  submitting: false,
};

// ── DOM ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = {
  clock: $('live-clock'),
  windowDot: $('window-dot'),
  windowLabel: $('window-label'),
  banner: $('status-banner'),
  stepLocation: $('step-location'),
  stepFace: $('step-face'),
  stepForm: $('step-form'),
  locationBox: $('location-status-box'),
  locPrimary: $('loc-primary'),
  locSecondary: $('loc-secondary'),
  locationDetail: $('location-detail'),
  distanceVal: $('distance-val'),
  accuracyVal: $('accuracy-val'),
  campusStatusVal: $('campus-status-val'),
  captureBtn: $('capture-location-btn'),
  captureBtnLabel: $('capture-btn-label'),
  locationError: $('location-error'),
  faceVideo: $('face-video'),
  faceCanvas: $('face-canvas'),
  faceStatus: $('face-status'),
  detectProgress: $('detect-progress-bar'),
  cameraPlaceholder: $('camera-placeholder'),
  verifiedOverlay: $('verified-overlay'),
  startCameraBtn: $('start-camera-btn'),
  cameraBtnLabel: $('camera-btn-label'),
  faceError: $('face-error'),
  form: $('attendance-form'),
  nameInput: $('name'),
  branchInput: $('branch'),
  semesterInput: $('semester'),
  courseSelect: $('course'),
  nameErr: $('name-err'),
  branchErr: $('branch-err'),
  semesterErr: $('semester-err'),
  courseErr: $('course-err'),
  submitBtn: $('submit-btn'),
  condTime: $('cond-time'),
  condLocation: $('cond-location'),
  condFace: $('cond-face'),
  condForm: $('cond-form'),
  resultMsg: $('result-msg'),
  resultIcon: $('result-icon'),
  resultText: $('result-text'),
  resultDetails: $('result-details'),
  footerYear: $('footer-year'),
  pwaPrompt: $('pwa-prompt'),
  pwaInstallBtn: $('pwa-install-btn'),
  pwaDismissBtn: $('pwa-dismiss-btn'),
};

// ── FaceAuth Instance ─────────────────────────────────────────────
let faceAuth = null;
let deferredInstallPrompt = null;

// ══════════════════════════════════════════════════════════════════
// CLOCK & TIME WINDOW
// ══════════════════════════════════════════════════════════════════

function getISTInfo() {
  const now = new Date();
  const h24 = now.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', hour12: false,
    hour: '2-digit', minute: '2-digit',
  });
  const [hStr, mStr] = h24.split(':');
  const hour = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10);
  const winStart = CONFIG.window.startH * 60 + CONFIG.window.startM;
  const winEnd = CONFIG.window.endH * 60 + CONFIG.window.endM;
  const current = hour * 60 + minute;
  return { hour, minute, inWindow: current >= winStart && current <= winEnd };
}

function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour12: true,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  if (el.clock) el.clock.textContent = timeStr;

  const { inWindow } = getISTInfo();
  state.timeOk = inWindow;

  if (el.windowDot)
    el.windowDot.className = 'status-dot ' + (inWindow ? 'dot-open' : 'dot-closed');
  if (el.windowLabel)
    el.windowLabel.textContent = inWindow
      ? 'Attendance window is OPEN (9:00 – 9:45 AM)'
      : 'Window closed — opens 9:00 AM daily';
  if (el.banner) {
    el.banner.classList.toggle('banner-open', inWindow);
    el.banner.classList.toggle('banner-closed', !inWindow);
  }
  updateConditions();
}

// ══════════════════════════════════════════════════════════════════
// GPS LOCATION
// ══════════════════════════════════════════════════════════════════

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function setLocationState(boxState, primary, secondary = '') {
  if (el.locationBox) el.locationBox.setAttribute('data-state', boxState);
  if (el.locPrimary) el.locPrimary.textContent = primary;
  if (el.locSecondary) el.locSecondary.textContent = secondary;
}

async function captureLocation() {
  if (!navigator.geolocation) {
    setLocationState('error', 'GPS not supported', 'Please use a modern mobile browser (Chrome/Safari).');
    return;
  }
  state.location.captured = false;
  clearFieldError(el.locationError);
  el.captureBtn.disabled = true;
  el.captureBtnLabel.textContent = 'Detecting location...';
  setLocationState('loading', 'Detecting GPS location...', 'Please wait. This may take a few seconds.');
  if (el.locationDetail) el.locationDetail.hidden = true;
  setStep('location', 'active');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      const distance = haversine(lat, lon, CONFIG.campus.lat, CONFIG.campus.lon);
      const onCampus = distance <= CONFIG.campus.maxMeters;

      state.location = { captured: true, lat, lon, accuracy, distance };

      if (el.distanceVal) el.distanceVal.textContent = `${Math.round(distance)}m`;
      if (el.accuracyVal) el.accuracyVal.textContent = `±${Math.round(accuracy)}m`;
      if (el.campusStatusVal) {
        el.campusStatusVal.textContent = onCampus ? '✓ On Campus' : '✗ Off Campus';
        el.campusStatusVal.style.color = onCampus ? 'var(--color-success)' : 'var(--color-error)';
      }
      if (el.locationDetail) el.locationDetail.hidden = false;

      if (onCampus) {
        setLocationState('success', `✓ Location verified — ${Math.round(distance)}m from campus`, `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`);
        setStep('location', 'done');
        el.captureBtn.textContent = '✓ Location Captured';
      } else {
        setLocationState('error', `⚠ Too far from campus (${Math.round(distance)}m)`, `You must be within ${CONFIG.campus.maxMeters}m of GITAM Bhubaneswar.`);
        showFieldError(el.locationError, `${Math.round(distance)}m away — needs ${CONFIG.campus.maxMeters}m or less. Move closer and try again.`);
        setStep('location', 'active');
        el.captureBtn.disabled = false;
        el.captureBtnLabel.textContent = 'Retry Location';
      }
      
      const dirBtn = document.getElementById('directions-btn');
      if (dirBtn) {
        dirBtn.style.display = 'flex';
        dirBtn.onclick = () => {
          window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${CONFIG.campus.lat},${CONFIG.campus.lon}`, '_blank');
        };
      }
      
      updateConditions();
    },
    (err) => {
      state.location.captured = false;
      el.captureBtn.disabled = false;
      el.captureBtnLabel.textContent = 'Retry Location';
      setStep('location', 'pending');
      const msgs = {
        1: 'Location permission denied. Please allow GPS access in your browser settings.',
        2: 'Location unavailable. Enable GPS and make sure you have a clear outdoor view.',
        3: 'Location request timed out. Please try again.',
      };
      const msg = msgs[err.code] || 'GPS error. Please try again.';
      setLocationState('error', 'Location failed', msg);
      showFieldError(el.locationError, msg);
      updateConditions();
    },
    {
      enableHighAccuracy: CONFIG.gps.enableHighAccuracy,
      timeout: CONFIG.gps.timeout,
      maximumAge: CONFIG.gps.maximumAge,
    }
  );
}

// ══════════════════════════════════════════════════════════════════
// FACE AUTH
// ══════════════════════════════════════════════════════════════════

function initFaceAuth() {
  if (!faceAuth) {
    faceAuth = new FaceAuth({
      videoEl: el.faceVideo,
      canvasEl: el.faceCanvas,
      statusEl: el.faceStatus,
      progressBarEl: el.detectProgress,
      placeholderEl: el.cameraPlaceholder,
      verifiedOverlayEl: el.verifiedOverlay,
      onVerified: () => {
        state.face.verified = true;
        setStep('face', 'done');
        el.startCameraBtn.disabled = true;
        el.cameraBtnLabel.textContent = '✓ Face Verified';
        clearFieldError(el.faceError);
        updateConditions();
      },
      onError: (_err, msg) => {
        showFieldError(el.faceError, msg);
        el.startCameraBtn.disabled = false;
        el.cameraBtnLabel.textContent = 'Retry Camera';
        setStep('face', 'pending');
      },
    });
  }
}

function startCamera() {
  if (state.face.verified) return;
  initFaceAuth();
  el.startCameraBtn.disabled = true;
  el.cameraBtnLabel.textContent = 'Starting camera...';
  clearFieldError(el.faceError);
  setStep('face', 'active');
  faceAuth.start()
    .then(() => {
      el.startCameraBtn.disabled = false;
      el.cameraBtnLabel.textContent = 'Camera Active';
    })
    .catch(() => {
      el.startCameraBtn.disabled = false;
      el.cameraBtnLabel.textContent = 'Retry Camera';
    });
}

// ══════════════════════════════════════════════════════════════════
// FORM VALIDATION
// ══════════════════════════════════════════════════════════════════

function validateForm(showErrors = false) {
  const name = el.nameInput?.value?.trim() || '';
  const branch = el.branchInput?.value?.trim() || '';
  const semester = el.semesterInput?.value?.trim() || '';
  const course = el.courseSelect?.value || '';

  let valid = true;
  if (showErrors) {
    clearFieldError(el.nameErr);
    clearFieldError(el.branchErr);
    clearFieldError(el.semesterErr);
    clearFieldError(el.courseErr);
  }
  if (!name || name.length < 2) {
    if (showErrors) showFieldError(el.nameErr, 'Please enter your full name (min 2 characters).');
    valid = false;
  }
  if (!branch || branch.length < 2) {
    if (showErrors) showFieldError(el.branchErr, 'Please enter your branch or specialization.');
    valid = false;
  }
  if (!semester) {
    if (showErrors) showFieldError(el.semesterErr, 'Please enter your semester.');
    valid = false;
  }
  if (!course || !['BTech', 'MCA'].includes(course)) {
    if (showErrors) showFieldError(el.courseErr, 'Please select your course.');
    valid = false;
  }
  state.form.valid = valid;
  if (valid) setStep('form', 'done');
  else if (name || branch || semester || course) setStep('form', 'active');
  return valid;
}

// ══════════════════════════════════════════════════════════════════
// CONDITIONS & SUBMIT BUTTON
// ══════════════════════════════════════════════════════════════════

function updateConditions() {
  const locationOk = state.location.captured &&
    state.location.distance !== null &&
    state.location.distance <= CONFIG.campus.maxMeters;
  const faceOk = state.face.verified;
  const formOk = state.form.valid;
  const timeOk = state.timeOk;

  setCondition('cond-time', timeOk);
  setCondition('cond-location', locationOk);
  setCondition('cond-face', faceOk);
  setCondition('cond-form', formOk);

  const allMet = timeOk && locationOk && faceOk && formOk;
  if (el.submitBtn) el.submitBtn.disabled = !allMet || state.submitting;
}

function setCondition(id, met) {
  const e = $(id);
  if (e) e.setAttribute('data-met', met ? 'true' : 'false');
}

function setStep(name, status) {
  const stepEl = { location: el.stepLocation, face: el.stepFace, form: el.stepForm }[name];
  if (stepEl) stepEl.setAttribute('data-status', status);
}

// ══════════════════════════════════════════════════════════════════
// FORM SUBMISSION — Firestore
// ══════════════════════════════════════════════════════════════════

/**
 * Sanitise a user-supplied string — strip angle brackets, quotes, backslashes
 */
function sanitize(str, maxLen = 100) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>"'\/\\]/g, '').substring(0, maxLen);
}

async function handleSubmit() {
  if (state.submitting) return;
  hideResult();

  // Client-side gate checks
  const { inWindow } = getISTInfo();
  if (!inWindow) {
    showResult(false, 'Attendance window is closed. Please submit between 9:00 AM and 9:45 AM IST.');
    return;
  }
  if (!state.location.captured || state.location.distance > CONFIG.campus.maxMeters) {
    showResult(false, 'Please capture your GPS location within 120m of campus first.');
    return;
  }
  if (!state.face.verified) {
    showResult(false, 'Face verification is required before submitting.');
    return;
  }
  if (!validateForm(true)) {
    const firstErr = document.querySelector('.field-error:not(:empty)');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Sanitise inputs
  const cleanName = sanitize(el.nameInput.value, 100);
  const cleanBranch = sanitize(el.branchInput.value, 100);
  const cleanSemester = sanitize(el.semesterInput.value, 20);
  const cleanCourse = el.courseSelect.value;

  if (cleanName.length < 2) { showResult(false, 'Please enter your full name (min 2 characters).'); return; }
  if (!['BTech', 'MCA'].includes(cleanCourse)) { showResult(false, 'Course must be BTech or MCA.'); return; }

  // Check for duplicate attendance today
  const today = window.getTodayIST();
  const duplicateKey = `att_${today}_${cleanName.toLowerCase()}_${cleanBranch.toLowerCase()}`;
  if (localStorage.getItem(duplicateKey)) {
    showResult(false, 'You have already marked attendance today.');
    return;
  }

  state.submitting = true;
  el.submitBtn.disabled = true;
  el.submitBtn.classList.add('is-loading');

  const nowRaw = new Date();
  const timestamp = nowRaw.toISOString();

  // Prepare local record
  const localRecord = {
    name: cleanName,
    branch: cleanBranch,
    semester: cleanSemester,
    course: cleanCourse,
    latitude: state.location.lat,
    longitude: state.location.lon,
    face_verified: true,
    date: today,
    timestamp: timestamp,
    time: nowRaw.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }),
    distanceFromCampus: Math.round(state.location.distance) + 'm'
  };

  try {
    let sheetsSuccess = false;
    let data;

    if (window.SHEETS_API_URL && !window.SHEETS_API_URL.includes('REPLACE_WITH')) {
      // ── POST to Google Apps Script Web App ────────────────────────
      const response = await fetch(window.SHEETS_API_URL, {
        method:   'POST',
        headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
        body:     JSON.stringify({
          name:         cleanName,
          branch:       cleanBranch,
          semester:     cleanSemester,
          course:       cleanCourse,
          latitude:     state.location.lat,
          longitude:    state.location.lon,
          face_verified: true,
          timestamp:    timestamp
        }),
        redirect: 'follow',
      });

      if (!response.ok) throw new Error(`Server responded with HTTP ${response.status}`);

      data = await response.json();
      if (!data.success) {
        showResult(false, data.error || 'Submission failed. Please try again.');
        return;
      }
      sheetsSuccess = true;
    }

    // Save to frontend LocalStorage
    const stored = JSON.parse(localStorage.getItem('attendance_records') || '[]');
    stored.push(localRecord);
    localStorage.setItem('attendance_records', JSON.stringify(stored));
    localStorage.setItem(duplicateKey, "true");

    if (sheetsSuccess && data) {
      showResult(true, data.message, localRecord); // use data.data if provided, or localRecord
    } else {
      showResult(true, "Attendance recorded successfully (Local Storage fallback).", localRecord);
    }
    resetForm();

  } catch (err) {
    console.error('[Submit Error]', err);
    if (!navigator.onLine) {
      showResult(false, 'You appear to be offline. Please check your internet connection and try again.');
    } else {
      showResult(false, 'Could not submit attendance. Please try again in a moment.');
    }
  } finally {
    state.submitting = false;
    el.submitBtn.classList.remove('is-loading');
    updateConditions();
  }
}

function resetForm() {
  el.form?.reset();
  state.form.valid = false;

  state.location = { captured: false, lat: null, lon: null, accuracy: null, distance: null };
  setLocationState('idle', 'Location not captured', 'Press the button below to detect GPS');
  if (el.locationDetail) el.locationDetail.hidden = true;
  el.captureBtn.disabled = false;
  el.captureBtnLabel.textContent = 'Capture My Location';
  setStep('location', 'pending');

  state.face.verified = false;
  if (faceAuth) faceAuth.reset();
  el.startCameraBtn.disabled = false;
  el.cameraBtnLabel.textContent = 'Start Camera';
  setStep('face', 'pending');
  setStep('form', 'pending');

  updateConditions();
}

// ══════════════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════════════

function showResult(isSuccess, message, details = null) {
  if (!el.resultMsg) return;
  el.resultMsg.hidden = false;
  el.resultMsg.className = `result-msg ${isSuccess ? 'is-success' : 'is-error'}`;
  el.resultIcon.textContent = isSuccess ? '✅' : '❌';
  el.resultText.textContent = message;
  el.resultDetails.innerHTML = '';

  if (details && isSuccess) {
    const rows = [
      ['Name', details.name],
      ['Course', details.course],
      ['Date', details.date],
      ['Time', details.time + ' IST'],
      ['Distance', details.distanceFromCampus],
    ];
    rows.forEach(([label, value]) => {
      if (!value) return;
      const p = document.createElement('p');
      p.className = 'result-detail-line';
      p.innerHTML = `<span>${label}:</span> <strong>${escHtml(value)}</strong>`;
      el.resultDetails.appendChild(p);
    });
  }
  el.resultMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResult() {
  if (el.resultMsg) el.resultMsg.hidden = true;
}

function showFieldError(errorEl, msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  const inputId = errorEl.id?.replace('-err', '').replace('-error', '');
  const input = inputId ? $(inputId) : null;
  if (input) input.classList.add('has-error');
}

function clearFieldError(errorEl) {
  if (!errorEl) return;
  errorEl.textContent = '';
  const inputId = errorEl.id?.replace('-err', '').replace('-error', '');
  const input = inputId ? $(inputId) : null;
  if (input) input.classList.remove('has-error');
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ══════════════════════════════════════════════════════════════════
// PWA
// ══════════════════════════════════════════════════════════════════

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    setTimeout(() => { if (el.pwaPrompt) el.pwaPrompt.hidden = false; }, 4000);
  }
});

// ══════════════════════════════════════════════════════════════════
// SERVICE WORKER
// ══════════════════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Failed:', err));
  });
}

// ══════════════════════════════════════════════════════════════════
// INIT & EVENT BINDINGS
// ══════════════════════════════════════════════════════════════════

function init() {
  if (el.footerYear) el.footerYear.textContent = new Date().getFullYear();

  updateClock();
  setInterval(updateClock, 1000);

  el.captureBtn?.addEventListener('click', captureLocation);
  el.startCameraBtn?.addEventListener('click', startCamera);

  [el.nameInput, el.branchInput, el.semesterInput].forEach(inp => {
    inp?.addEventListener('input', () => {
      if (inp.value.trim().length >= 1)
        clearFieldError(inp.id === 'name' ? el.nameErr : inp.id === 'branch' ? el.branchErr : el.semesterErr);
      validateForm(false);
      updateConditions();
    });
  });
  el.courseSelect?.addEventListener('change', () => {
    clearFieldError(el.courseErr);
    validateForm(false);
    updateConditions();
  });

  el.submitBtn?.addEventListener('click', handleSubmit);

  el.pwaInstallBtn?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') el.pwaPrompt.hidden = true;
    deferredInstallPrompt = null;
  });
  el.pwaDismissBtn?.addEventListener('click', () => {
    if (el.pwaPrompt) el.pwaPrompt.hidden = true;
  });

  updateConditions();
}

document.addEventListener('DOMContentLoaded', init);