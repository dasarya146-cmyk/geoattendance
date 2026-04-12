/* ================================================================
   firebase-config.js — Firebase Auth Initialization
   Geo Attendance System v3.0 — GITAM Bhubaneswar
   ================================================================
   Only Firebase Auth is used now. Attendance data is stored in
   Google Sheets via the Apps Script backend (sheets-config.js).

   Required CDN scripts (load BEFORE this file):
     firebase-app-compat.js
     firebase-auth-compat.js
   ================================================================ */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBq-qDmJ7wXKHb_pgqxf09OfJ_hT-ZiLk",
  authDomain:        "geoattendance-arya.firebaseapp.com",
  projectId:         "geoattendance-arya",
  storageBucket:     "geoattendance-arya.firebasestorage.app",
  messagingSenderId: "840798867052",
  appId:             "1:840798867052:web:9370a866eae36b41d6d249",
  measurementId:     "G-21R6HQQPTB",
};

// ── Initialise only once ─────────────────────────────────────────
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

// ── Firebase Auth instance ───────────────────────────────────────
// NOTE: Firestore is no longer used — data goes to Google Sheets.
window.auth = firebase.auth();

// ── Google Auth Provider ─────────────────────────────────────────
const _googleProvider = new firebase.auth.GoogleAuthProvider();
_googleProvider.setCustomParameters({ prompt: 'select_account' });
window.googleProvider = _googleProvider;

// ── Admin Access Control ─────────────────────────────────────────
// Only this Google account may access the admin dashboard.
window.ADMIN_EMAIL = 'dasarya146@gmail.com';

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Returns today's date in IST as "YYYY-MM-DD"
 */
function getTodayIST() {
  const ist = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  // en-IN gives "DD/MM/YYYY"
  const [dd, mm, yyyy] = ist.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

window.getTodayIST = getTodayIST;
