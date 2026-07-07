import {
  apiFetch, canWrite, isAdmin, formatTs, statusClass, statusLabel, parseHash, setHash, signOut,
} from './auth.js';

let meta = null;
let visits = [];
let notes = [];
let currentUser = null;
let syncStatus = { alive: false };
let filters = { store: '', status: '', lead: '', q: '' };

const STATUS_COLORS = {
  active: '#94a3b8',
  'in-progress': '#f59e0b',
  completed: '#22c55e',
  deleted: '#ef4444',
};

export async function initCalendar(appEl, user) {
  currentUser = user;
  meta = await apiFetch('/api/calendar/meta');
  if (!window.location.hash) setHash(['week', '2026-07-05']);
  renderShell(appEl);
  await refreshSyncStatus();
  await loadData();
  renderView();
  bindGlobalHandlers();
  setInterval(refreshSyncStatus, 60_000);
}

function windowDates() {
  return meta?.initialWindow || { from: '2026-07-05', to: '2026-07-18' };
}

async function refreshSyncStatus() {
  try {
    const data = await apiFetch('/api/sync/status');
    syncStatus = data.sas || { alive: false };
    updateProdBadge();
  } catch {
    syncStatus = { alive: false };
    updateProdBadge();
  }
}

function updateProdBadge() {
  const el = document.getElementById('prod-badge');
  if (!el) return;
  el.className = `prod-badge ${syncStatus.alive ? 'prod-live' : 'prod-off'}`;
  el.textContent = syncStatus.alive ? 'PROD connected' : 'PROD syncing…';
  el.title = syncStatus.receivedAt
    ? `Session received ${formatTs(syncStatus.receivedAt)}`
    : 'Schedule syncs automatically from eod-api';
}

function renderShell(appEl) {
  appEl.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <h1>D1 Calendar</h1>
        <span class="user-badge">${currentUser.display_name}</span>
      </div>
      <div class="topbar-actions">
        <span id="prod-badge" class="prod-badge prod-off" title="Auto-sync from PROD">PROD…</span>
        <button type="button" id="btn-menu" class="btn btn-ghost btn-icon" aria-label="Menu">☰</button>
      </div>
    </header>
    <div id="menu-panel" class="menu-panel hidden">
      <input type="search" id="global-search" placeholder="Search…" value="${escapeAttr(filters.q)}" />
      ${isAdmin(currentUser.role) ? '<a href="admin.html" class="btn btn-ghost btn-block">Manage users</a>' : ''}
      <button type="button" id="btn-logout" class="btn btn-ghost btn-block">Sign out</button>
    </div>
    <section class="toolbar" id="toolbar"></section>
    <nav class="view-nav" id="view-nav"></nav>
    <main id="calendar-main"></main>
    <aside id="note-drawer" class="drawer hidden"></aside>
  `;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

async function loadData() {
  const { from, to } = windowDates();
  const params = new URLSearchParams({ from, to });
  if (filters.store) params.set('stores', filters.store);
  if (filters.status) params.set('status', filters.status);
  if (filters.lead) params.set('lead', filters.lead);
  if (filters.q) params.set('q', filters.q);
  const data = await apiFetch(`/api/calendar/visits?${params}`);
  visits = data.visits || [];
  notes = data.notes || [];
}

function uniqueLeads() {
  const set = new Set();
  for (const v of visits) {
    if (v.visit_lead) set.add(v.visit_lead);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function currentViewMode() {
  const { parts } = parseHash();
  if (parts[0] === 'day') return 'day';
  if (parts[0] === 'week') return 'week';
  return 'month';
}

function renderToolbar() {
  const el = document.getElementById('toolbar');
  if (!el) return;

  const storeOpts = ['<option value="">All stores</option>']
    .concat((meta?.stores || []).map(
      (s) => `<option value="${s}" ${filters.store === String(s) ? 'selected' : ''}>Store ${s}</option>`,
    )).join('');

  const statusOpts = ['<option value="">All statuses</option>']
    .concat((meta?.statuses || []).map(
      (st) => `<option value="${st.value}" ${filters.status === st.value ? 'selected' : ''}>${st.label}</option>`,
    )).join('');

  const leadOpts = ['<option value="">All leads</option>']
    .concat(uniqueLeads().map(
      (l) => `<option value="${escapeAttr(l)}" ${filters.lead === l ? 'selected' : ''}>${escapeHtml(l)}</option>`,
    )).join('');

  const view = currentViewMode();
  const { parts } = parseHash();
  const anchor = parts[1] || '2026-07-05';

  el.innerHTML = `
    <div class="toolbar-row">
      <label class="toolbar-field">
        <span>View</span>
        <select id="filter-view">
          <option value="month" ${view === 'month' ? 'selected' : ''}>Month</option>
          <option value="week" ${view === 'week' ? 'selected' : ''}>Week</option>
          <option value="day" ${view === 'day' ? 'selected' : ''}>Day</option>
        </select>
      </label>
      <label class="toolbar-field">
        <span>Store</span>
        <select id="filter-store">${storeOpts}</select>
      </label>
      <label class="toolbar-field">
        <span>Status</span>
        <select id="filter-status">${statusOpts}</select>
      </label>
      <label class="toolbar-field">
        <span>Lead</span>
        <select id="filter-lead">${leadOpts}</select>
      </label>
    </div>`;

  el.querySelector('#filter-view')?.addEventListener('change', (e) => {
    const mode = e.target.value;
    if (mode === 'month') setHash(['month']);
    else if (mode === 'week') setHash(['week', anchor]);
    else setHash(['day', anchor]);
  });

  const onFilterChange = async () => {
    filters.store = el.querySelector('#filter-store')?.value || '';
    filters.status = el.querySelector('#filter-status')?.value || '';
    filters.lead = el.querySelector('#filter-lead')?.value || '';
    await loadData();
    renderView();
  };

  el.querySelector('#filter-store')?.addEventListener('change', onFilterChange);
  el.querySelector('#filter-status')?.addEventListener('change', onFilterChange);
  el.querySelector('#filter-lead')?.addEventListener('change', onFilterChange);
}

function renderView() {
  renderToolbar();
  const { parts } = parseHash();
  const nav = document.getElementById('view-nav');
  const main = document.getElementById('calendar-main');

  if (parts[0] === 'day' && parts[1]) {
    nav.innerHTML = `
      <button class="btn btn-ghost btn-sm" data-nav="month">Month</button>
      <button class="btn btn-ghost btn-sm" data-nav="week/${parts[1]}">Week</button>
      <span class="nav-title">${formatDayTitle(parts[1])}</span>`;
    renderDayView(main, parts[1]);
  } else if (parts[0] === 'week' && parts[1]) {
    nav.innerHTML = `
      <button class="btn btn-ghost btn-sm" data-nav="month">Month</button>
      <span class="nav-title">Week of ${parts[1]}</span>`;
    renderWeekView(main, parts[1]);
  } else {
    nav.innerHTML = `<span class="nav-title">July 2026 · P06W3–W4</span>`;
    renderMonthView(main);
  }
}

function formatDayTitle(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function visitsForDate(date) {
  return visits.filter((v) => v.scheduled_date?.slice(0, 10) === date);
}

function notesForDate(date) {
  return notes.filter((n) => n.scope_date?.slice(0, 10) === date || n.scope_type === 'day');
}

function renderMonthView(main) {
  const year = 2026;
  const month = 7;
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  let cells = '';
  for (let i = 0; i < startPad; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-07-${String(d).padStart(2, '0')}`;
    const dayVisits = visitsForDate(iso);
    const dayNotes = notesForDate(iso);
    const dots = dayVisits.slice(0, 8).map(
      (v) => `<span class="dot" style="background:${STATUS_COLORS[v.current_status] || '#999'}" title="Store ${v.store_number}"></span>`,
    ).join('');
    cells += `
      <div class="cal-cell" data-day="${iso}" tabindex="0" role="button">
        <div class="cal-day-num">${d}</div>
        <div class="cal-dots">${dots}</div>
        ${dayNotes.length ? `<span class="note-badge">${dayNotes.length}</span>` : ''}
      </div>`;
  }

  main.innerHTML = `
    <div class="cal-month">
      <div class="cal-head">Sun</div><div class="cal-head">Mon</div><div class="cal-head">Tue</div>
      <div class="cal-head">Wed</div><div class="cal-head">Thu</div><div class="cal-head">Fri</div><div class="cal-head">Sat</div>
      ${cells}
    </div>`;

  main.querySelectorAll('[data-day]').forEach((cell) => {
    cell.addEventListener('click', () => setHash(['day', cell.dataset.day]));
  });
}

function weekStartSunday(iso) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function renderWeekView(main, anchorDate) {
  const start = weekStartSunday(anchorDate);
  const dates = [];
  const base = new Date(start + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  const cols = dates.map((iso) => {
    const dayVisits = visitsForDate(iso);
    const cards = dayVisits.map((v) => visitCardHtml(v, true)).join('') || '<p class="muted">No visits</p>';
    return `
      <div class="week-col">
        <button class="week-col-head" data-day="${iso}">${formatDayTitle(iso)}</button>
        <div class="week-col-body">${cards}</div>
      </div>`;
  }).join('');

  main.innerHTML = `<div class="week-grid">${cols}</div>`;
  main.querySelectorAll('[data-day]').forEach((btn) => {
    btn.addEventListener('click', () => setHash(['day', btn.dataset.day]));
  });
}

function renderDayView(main, date) {
  const dayVisits = visitsForDate(date);
  const dayNotes = notesForDate(date);
  const visitHtml = dayVisits.map((v) => visitCardHtml(v, false)).join('')
    || '<p class="muted">No PROD visits for this day yet — sync runs automatically.</p>';
  const notesHtml = dayNotes.map((n) => noteHtml(n)).join('') || '<p class="muted">No notes yet.</p>';

  main.innerHTML = `
    <div class="day-layout">
      <section>
        <h2>Visits</h2>
        ${visitHtml}
      </section>
      <section>
        <div class="section-head">
          <h2>Notes</h2>
          ${canWrite(currentUser.role) ? `<button class="btn btn-primary btn-sm" id="btn-add-note" data-date="${date}">Add note</button>` : ''}
        </div>
        <div id="notes-list">${notesHtml}</div>
      </section>
    </div>`;

  main.querySelector('#btn-add-note')?.addEventListener('click', () => openNoteForm({ scope_type: 'day', scope_date: date }));
  main.querySelectorAll('[data-visit-note]').forEach((btn) => {
    btn.addEventListener('click', () => openNoteForm({
      scope_type: 'visit',
      scope_date: date,
      scope_visit_id: Number(btn.dataset.visitId),
      scope_store_number: Number(btn.dataset.store),
    }));
  });
}

function parseRoster(v) {
  const r = v.roster_json;
  if (Array.isArray(r)) return r;
  if (r && typeof r === 'object') return r;
  try { return JSON.parse(r || '[]'); } catch { return []; }
}

function visitCardHtml(v, compact) {
  const roster = parseRoster(v);
  const rosterList = roster.map((r) => `<li>${r.is_lead ? '★ ' : ''}${r.employee || '—'}</li>`).join('');
  return `
    <article class="visit-card ${statusClass(v.current_status)}">
      <header>
        <strong>Store ${v.store_number}</strong>
        <span class="status-pill">${statusLabel(v.current_status)}</span>
      </header>
      <p class="visit-meta">${v.store_name || ''} ${v.project_name ? `· ${v.project_name}` : ''}</p>
      <p class="visit-meta">Lead: ${v.visit_lead || '—'} · ${v.shift_start_time || '?'} – ${v.shift_end_time || '?'}</p>
      ${compact ? '' : `<ul class="roster">${rosterList || '<li>No roster synced</li>'}</ul>`}
      ${!compact && canWrite(currentUser.role)
    ? `<button class="btn btn-ghost btn-sm" data-visit-note data-visit-id="${v.visit_id}" data-store="${v.store_number}">Add note</button>`
    : ''}
    </article>`;
}

function noteHtml(n) {
  return `
    <div class="note-card">
      <div class="note-meta">${n.author_name} · ${formatTs(n.created_at)} ${n.notify_mode === 'quiet' ? '· quiet' : ''}</div>
      <p>${escapeHtml(n.body)}</p>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openNoteForm(ctx) {
  if (!canWrite(currentUser.role)) return;
  const drawer = document.getElementById('note-drawer');
  drawer.classList.remove('hidden');
  drawer.innerHTML = `
    <div class="drawer-inner">
      <h3>Add note</h3>
      <textarea id="note-body" rows="5" placeholder="What happened? Time is recorded automatically."></textarea>
      <label class="checkbox-row"><input type="checkbox" id="note-quiet" /> Keep quiet — log only, no email</label>
      <div class="drawer-actions">
        <button class="btn btn-ghost" id="note-cancel">Cancel</button>
        <button class="btn btn-primary" id="note-save">Save</button>
      </div>
    </div>`;
  drawer.querySelector('#note-cancel').onclick = () => drawer.classList.add('hidden');
  drawer.querySelector('#note-save').onclick = async () => {
    const body = drawer.querySelector('#note-body').value.trim();
    const quiet = drawer.querySelector('#note-quiet').checked;
    if (!body) return;
    await apiFetch('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ body, notify_mode: quiet ? 'quiet' : 'broadcast', ...ctx }),
    });
    drawer.classList.add('hidden');
    await loadData();
    renderView();
  };
}

function bindGlobalHandlers() {
  document.getElementById('btn-logout')?.addEventListener('click', signOut);

  document.getElementById('btn-menu')?.addEventListener('click', () => {
    document.getElementById('menu-panel')?.classList.toggle('hidden');
  });

  document.getElementById('global-search')?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      filters.q = e.target.value.trim();
      await loadData();
      renderView();
    }
  });

  document.getElementById('view-nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    setHash(btn.dataset.nav.split('/'));
  });

  window.addEventListener('hashchange', () => renderView());
}
