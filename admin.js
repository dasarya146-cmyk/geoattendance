'use strict';

const authOverlay  = document.getElementById('auth-overlay');
const adminHeader  = document.getElementById('admin-header');
const adminMain    = document.getElementById('admin-main');
const emailDisplay = document.getElementById('admin-email-display');
const logoutBtn    = document.getElementById('logout-btn');

// ── Auth Guard ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('admin_logged_in') !== 'true') {
    window.location.replace('./login.html');
    return;
  }

  emailDisplay.textContent = 'Admin User';
  emailDisplay.title       = 'dasarya146@gmail.com';

  authOverlay.style.display = 'none';
  adminHeader.style.display = '';
  adminMain.style.display   = '';
  loadData();
});

// ── Logout ───────────────────────────────────────────────────────
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('admin_logged_in');
  window.location.replace('./login.html');
});

// ── Data & State ───────────────────────────────────────────────────
let allRecords = [];
let filter     = { date: 'today', course: '' };

const $ = id => document.getElementById(id);

async function loadData() {
  showTableState('loading');

  try {
    let dataRecords = [];
    const now = new Date();
    const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    if (!window.BACKEND_URL) {
      console.warn("[Admin] BACKEND_URL is not configured. Falling back to local storage.");
      dataRecords = JSON.parse(localStorage.getItem('attendance_records') || '[]');
      if (filter.date === 'today') {
         dataRecords = dataRecords.filter(r => r.date === todayDate || (r.timestamp && r.timestamp.includes(todayDate)));
      }
    } else {
      // Fetch from Node.js Backend
      const url = `${window.BACKEND_URL}/data?filter=${filter.date}`;
      console.log('[Admin] Fetching data from:', url);
      
      const response = await fetch(url, { 
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[Admin] API Response:', data);
      
      if (!data.success) { 
        showTableState('error', data.error || 'Failed to load records from backend.'); 
        return; 
      }
      dataRecords = data.records || [];
    }

    allRecords = dataRecords;

    // ── Compute stats ──────────────────────────────────────────────
    const todayRecs = filter.date === 'today'
      ? allRecords
      : allRecords.filter(r => r.date === todayDate || (r.timestamp && r.timestamp.includes(todayDate)));

    const todayCount  = todayRecs.length;
    const btechToday  = todayRecs.filter(r => r.course === 'BTech').length;
    const mcaToday    = todayRecs.filter(r => r.course === 'MCA').length;
    const faceToday   = todayRecs.filter(r => r.face_verified).length;

    let totalCount = filter.date === 'all' ? allRecords.length : '—';
    $('stat-today').textContent = todayCount;
    $('stat-total').textContent = totalCount;
    $('stat-btech').textContent = btechToday;
    $('stat-mca').textContent   = mcaToday;
    $('stat-face').textContent  = faceToday;

    if (filter.date === 'today') {
      if (!window.BACKEND_URL) {
        const allLocal = JSON.parse(localStorage.getItem('attendance_records') || '[]');
        $('stat-total').textContent = allLocal.length;
      } else {
        fetch(`${window.BACKEND_URL}/data?filter=all`)
          .then(r => r.json())
          .then(d => { if (d.success) $('stat-total').textContent = d.count || 0; })
          .catch(err => { 
              console.error('[Admin] total count fetch error:', err);
              $('stat-total').textContent = '—'; 
          });
      }
    }

    renderTable();

    $('refresh-note').textContent =
      `Last refreshed: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })} IST`;

  } catch (err) {
    console.error('[Admin] loadData error:', err);
    showTableState('error', `Failed to load records: ${err.message}`);
  }
}

function renderTable() {
  let records = allRecords;
  if (filter.course) records = records.filter(r => r.course === filter.course);

  if (!records.length) { showTableState('empty'); return; }

  const tbody = $('att-tbody');
  tbody.innerHTML = '';

  records.forEach((r, i) => {
    const tr          = document.createElement('tr');
    const courseClass = r.course === 'BTech' ? 'badge-btech' : 'badge-mca';
    const gps         = r.latitude != null
      ? `${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)}`
      : (r.lat != null ? `${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}` : '—');
    const timeStr = r.time || (r.timestamp ? formatISTTime(r.timestamp) : '—');

    tr.innerHTML = `
      <td style="color:var(--color-text-3)">${i + 1}</td>
      <td style="font-weight:600">${esc(r.name)}</td>
      <td>${esc(r.branch)}</td>
      <td>${esc(r.semester)}</td>
      <td><span class="course-badge ${courseClass}">${esc(r.course)}</span></td>
      <td style="font-variant-numeric:tabular-nums">${esc(r.date)}</td>
      <td style="font-family:monospace;font-variant-numeric:tabular-nums">${timeStr}</td>
      <td class="${r.face_verified ? 'face-check-yes' : 'face-check-no'}">${r.face_verified ? '✓' : '✗'}</td>
      <td style="font-family:monospace;font-size:0.72rem;color:var(--color-text-3)">${gps}</td>
      <td style="text-align:center;">
        <button class="delete-btn" title="Delete Record" onclick="deleteRecord('${r.id || r.timestamp}', this)" style="background:var(--color-error);border:none;cursor:pointer;color:#fff;font-size:0.75rem;padding:6px 12px;border-radius:4px;font-weight:600;display:inline-block;box-shadow:0 2px 4px rgba(0,0,0,0.2);">
          Delete
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  $('attendanceTable').style.display     = 'table';
  $('table-loading').style.display = 'none';
  $('table-empty').style.display   = 'none';
  $('table-error').style.display   = 'none';
}

window.deleteRecord = async function(id, btnElement) {
  if (!confirm('Are you sure you want to delete this record?')) return;
  
  // Remove from UI immediately
  if (btnElement) {
    const row = btnElement.closest('tr');
    if (row) row.remove();
  }

  // Fallback locally
  let locals = JSON.parse(localStorage.getItem('attendance_records') || '[]');
  locals = locals.filter(r => String(r.id) !== String(id) && String(r.timestamp) !== String(id)); 
  localStorage.setItem('attendance_records', JSON.stringify(locals));

  if (!window.BACKEND_URL) return;

  try {
     const res = await fetch(`${window.BACKEND_URL}/delete/${id}`, { method: 'DELETE' });
     if (!res.ok) console.warn('Backend DELETE failed, likely unsupported endpoint. Removing from UI temporarily.');
  } catch(e) {
     console.warn('Backend DELETE failed, likely unsupported endpoint. Removing from UI temporarily.');
  }
}

function showTableState(state, msg = '') {
  $('table-loading').style.display = state === 'loading' ? '' : 'none';
  $('table-empty').style.display   = state === 'empty'   ? '' : 'none';
  $('table-error').style.display   = state === 'error'   ? '' : 'none';
  $('attendanceTable').style.display     = 'none';
  if (state === 'error' && msg) $('table-error-msg').textContent = msg;
}

function formatISTTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour12: true,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return '—'; }
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ── CSV Export ─────────────────────────────────────────────────────
$('export-btn').addEventListener('click', () => {
  let data = allRecords;
  if (filter.course) data = data.filter(r => r.course === filter.course);
  if (!data.length) { alert('No records to export.'); return; }

  const headers = ['#','Name','Branch','Semester','Course','Date','Time (IST)','Face Verified','Latitude','Longitude','Distance'];
  const rows = data.map((r, i) => [
    i + 1,
    `"${(r.name     || '').replace(/"/g, '""')}"`,
    `"${(r.branch   || '').replace(/"/g, '""')}"`,
    `"${(r.semester || '').replace(/"/g, '""')}"`,
    r.course,
    r.date,
    `"${r.time || (r.timestamp ? formatISTTime(r.timestamp) : '')}"`,
    r.face_verified ? 'Yes' : 'No',
    r.latitude != null ? r.latitude : (r.lat != null ? r.lat : ''),
    r.longitude != null ? r.longitude : (r.lng != null ? r.lng : ''),
    r.distance  || '',
  ]);

  const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gitam-attendance-${filter.date}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Filters & Refresh ──────────────────────────────────────────────
$('filter-date'  ).addEventListener('change', e => { filter.date   = e.target.value; loadData(); });
$('filter-course').addEventListener('change', e => { filter.course = e.target.value; renderTable(); });
$('refresh-btn'  ).addEventListener('click',  () => loadData());

// Auto-refresh every 60 seconds
setInterval(loadData, 60000);
