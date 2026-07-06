import { apiFetch, getSession, canWrite, isAdmin, formatTs, statusClass, statusLabel, parseHash, setHash } from './auth.js';

let meta = null;
let visits = [];
let notes = [];
let filters = { stores: [], status: [], lead: '', q: '' };

const STATUS_COLORS = {
  active: '#94a3b8',
  'in-progress': '#f59e0b',
  completed: '#22c55e',
  deleted: '#ef4444',
};

export async function initCalendar(appEl) {
  const session = getSession();
  if (!session?.user) return;

  meta = await apiFetch('/api/calendar/meta');
  if (!window.location.hash) setHash(['week', '2026-07-05']);
  renderShell(appEl, session);
  await loadData();
  renderView();
  bindGlobalHandlers(session);
}

function renderShell(appEl, session) {
  appEl.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <h1>District 1 Calendar</h1>
        <span class="user-badge">${session.user.display_name} · ${session.user.role}</span>
      </div>
      <div class="topbar-actions">
        <input type="search" id="global-search" placeholder="Search stores, leads, notes…" />
        ${isAdmin(session.user.role) ? '<a href="admin.html" class="btn btn-ghost">Manage users</a>' : ''}
        <button type="button" id="btn-sync" class="btn btn-ghost ${isAdmin(session.user.role) ? '' : 'hidden'}">Sync PROD</button>
        <button type="button" id="btn-logout" class="btn btn-ghost">Sign out</button>
      </div>
    </header>
    <section class="filters" id="filters-panel"></section>
    <nav class="view-nav" id="view-nav"></nav>
    <main id="calendar-main"></main>
    <aside id="note-drawer" class="drawer hidden"></aside>
  `;
}

function windowDates() {
  return { from: '2026-07-05', to: '2026-07-18' };
}

async function loadData() {
  const { from, to } = windowDates();
  const params = new URLSearchParams({ from, to });
  if (filters.stores.length) params.set('stores', filters.stores.join(','));
  if (filters.status.length) params.set('status', filters.status.join(','));
  if (filters.lead) params.set('lead', filters.lead);
  if (filters.q) params.set('q', filters.q);
  const data = await apiFetch(`/api/calendar/visits?${params}`);
  visits = data.visits || [];
  notes = data.notes || [];
}

function renderView() {
  const { parts } = parseHash();
  const nav = document.getElementById('view-nav');
  const main = document.getElementById('calendar-main');
  renderFilters(document.getElementById('filters-panel'));

  if (parts[0] === 'day' && parts[1]) {
    nav.innerHTML = `<button class="btn btn-ghost" data-nav="month">← Month</button>
      <button class="btn btn-ghost" data-nav="week/${parts[1]}">← Week</button>
      <span class="nav-title">${parts[1]}</span>`;
    renderDayView(main, parts[1]);
  } else if (parts[0] === 'week' && parts[1]) {
    nav.innerHTML = `<button class="btn btn-ghost" data-nav="month">← Month</button>
      <span class="nav-title">Week of ${parts[1]}</span>`;
    renderWeekView(main, parts[1]);
  } else {
    nav.innerHTML = `<span class="nav-title">July 2026 · P06W3–W4</span>`;
    renderMonthView(main);
  }
}

function renderFilters(el) {
  const storeOpts = (meta?.stores || []).map(
    (s) => `<label><input type="checkbox" data-store="${s}" ${filters.stores.includes(String(s)) ? 'checked' : ''}/> ${s}</label>`,
  ).join('');
  const statusOpts = (meta?.statuses || []).map(
    (st) => `<label><input type="checkbox" data-status="${st.value}" ${filters.status.includes(st.value) ? 'checked' : ''}/> ${st.label}</label>`,
  ).join('');

  el.innerHTML = `
    <details open>
      <summary>Filters</summary>
      <div class="filter-grid">
        <div><strong>Stores</strong><div class="check-list">${storeOpts}</div></div>
        <div><strong>Status</strong><div class="check-list">${statusOpts}</div></div>
        <div><strong>Lead</strong><input type="text" id="filter-lead" value="${filters.lead}" placeholder="Lead name" /></div>
      </div>
    </details>`;

  el.querySelectorAll('[data-store]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      filters.stores = [...el.querySelectorAll('[data-store]:checked')].map((x) => x.dataset.store);
      await loadData();
      renderView();
    });
  });
  el.querySelectorAll('[data-status]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      filters.status = [...el.querySelectorAll('[data-status]:checked')].map((x) => x.dataset.status);
      await loadData();
      renderView();
    });
  });
  el.querySelector('#filter-lead')?.addEventListener('change', async (e) => {
    filters.lead = e.target.value.trim();
    await loadData();
    renderView();
  });
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
    const dots = dayVisits.slice(0, 6).map(
      (v) => `<span class="dot" style="background:${STATUS_COLORS[v.current_status] || '#999'}" title="Store ${v.store_number}"></span>`,
    ).join('');
    cells += `
      <div class="cal-cell" data-day="${iso}">
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
        <button class="week-col-head" data-day="${iso}">${iso}</button>
        <div class="week-col-body">${cards}</div>
      </div>`;
  }).join('');

  main.innerHTML = `<div class="week-grid">${cols}</div>`;
  main.querySelectorAll('[data-day]').forEach((btn) => {
    btn.addEventListener('click', () => setHash(['day', btn.dataset.day]));
  });
}

function renderDayView(main, date) {
  const session = getSession();
  const dayVisits = visitsForDate(date);
  const dayNotes = notesForDate(date);
  const visitHtml = dayVisits.map((v) => visitCardHtml(v, false)).join('') || '<p class="muted">No PROD visits synced for this day.</p>';
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
          ${canWrite(session.user.role) ? `<button class="btn btn-primary" id="btn-add-note" data-date="${date}">Add note</button>` : ''}
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
        <strong>Store ${v.store_number}</strong> · ${v.store_name || ''}
        <span class="status-pill">${statusLabel(v.current_status)}</span>
      </header>
      <p>${v.project_name || ''} ${v.team_name ? `· ${v.team_name}` : ''}</p>
      <p>Lead: ${v.visit_lead || '—'} · ${v.shift_start_time || '?'} – ${v.shift_end_time || '?'}</p>
      ${compact ? '' : `<ul class="roster">${rosterList || '<li>No roster synced</li>'}</ul>`}
      ${!compact ? `<button class="btn btn-ghost btn-sm" data-visit-note data-visit-id="${v.visit_id}" data-store="${v.store_number}">Add visit note</button>` : ''}
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
  const session = getSession();
  if (!canWrite(session.user.role)) return;
  const drawer = document.getElementById('note-drawer');
  drawer.classList.remove('hidden');
  drawer.innerHTML = `
    <div class="drawer-inner">
      <h3>Add note</h3>
      <textarea id="note-body" rows="5" placeholder="What happened? Time is recorded automatically."></textarea>
      <label class="checkbox-row"><input type="checkbox" id="note-quiet" /> Keep quiet — log only, don't email team</label>
      <div class="drawer-actions">
        <button class="btn btn-ghost" id="note-cancel">Cancel</button>
        <button class="btn btn-primary" id="note-save">Save note</button>
      </div>
    </div>`;
  drawer.querySelector('#note-cancel').onclick = () => drawer.classList.add('hidden');
  drawer.querySelector('#note-save').onclick = async () => {
    const body = drawer.querySelector('#note-body').value.trim();
    const quiet = drawer.querySelector('#note-quiet').checked;
    if (!body) return alert('Enter note text');
    await apiFetch('/api/notes', {
      method: 'POST',
      body: JSON.stringify({
        body,
        notify_mode: quiet ? 'quiet' : 'broadcast',
        ...ctx,
      }),
    });
    drawer.classList.add('hidden');
    await loadData();
    renderView();
  };
}

function bindGlobalHandlers(session) {
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    import('./auth.js').then(({ clearSession }) => {
      clearSession();
      window.location.reload();
    });
  });

  document.getElementById('global-search')?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      filters.q = e.target.value.trim();
      await loadData();
      renderView();
    }
  });

  document.getElementById('btn-sync')?.addEventListener('click', async () => {
    if (!isAdmin(session.user.role)) return;
    try {
      const r = await apiFetch('/api/sync/run', { method: 'POST', body: '{}' });
      alert(`Synced ${r.upserted} visits`);
      await loadData();
      renderView();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('view-nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    setHash(btn.dataset.nav.split('/'));
  });

  window.addEventListener('hashchange', () => renderView());
}
