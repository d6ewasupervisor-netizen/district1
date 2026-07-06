import { apiFetch, getSession, isAdmin, formatTs } from './auth.js';

export async function initAdmin() {
  const session = getSession();
  if (!session?.user || !isAdmin(session.user.role)) {
    window.location.href = 'index.html';
    return;
  }

  const app = document.getElementById('admin-app');
  app.innerHTML = `
    <header class="topbar">
      <div class="brand"><h1>Manage users</h1></div>
      <a href="index.html" class="btn btn-ghost">← Calendar</a>
    </header>
    <section class="admin-grid">
      <form id="invite-form" class="card">
        <h2>Invite user</h2>
        <label>Email<input type="email" name="email" required /></label>
        <label>Display name<input type="text" name="display_name" required /></label>
        <label>Role
          <select name="role">
            <option value="viewer">Viewer — read only</option>
            <option value="modifier">Modifier — add notes</option>
            <option value="admin">Admin — full access</option>
          </select>
        </label>
        <button type="submit" class="btn btn-primary">Send invite</button>
        <p id="invite-msg" class="muted"></p>
      </form>
      <div class="card">
        <h2>Team</h2>
        <div id="users-table"></div>
      </div>
    </section>`;

  await loadUsers();
  document.getElementById('invite-form').addEventListener('submit', onInvite);
}

async function loadUsers() {
  const data = await apiFetch('/api/users');
  const el = document.getElementById('users-table');
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
      <tbody>
        ${data.users.map((u) => `
          <tr data-id="${u.id}">
            <td>${u.display_name}</td>
            <td>${u.email}</td>
            <td>
              <select class="role-select" data-id="${u.id}">
                <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>viewer</option>
                <option value="modifier" ${u.role === 'modifier' ? 'selected' : ''}>modifier</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
              </select>
            </td>
            <td>${u.status}</td>
            <td>${u.last_login_at ? formatTs(u.last_login_at) : '—'}</td>
            <td>
              ${u.status === 'active'
    ? `<button class="btn btn-ghost btn-sm deactivate" data-id="${u.id}">Deactivate</button>`
    : `<button class="btn btn-ghost btn-sm reactivate" data-id="${u.id}">Reactivate</button>`}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  el.querySelectorAll('.role-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await apiFetch(`/api/users/${sel.dataset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: sel.value }),
      });
    });
  });

  el.querySelectorAll('.deactivate').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Deactivate this user?')) return;
      try {
        await apiFetch(`/api/users/${btn.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'deactivated' }),
        });
        await loadUsers();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  el.querySelectorAll('.reactivate').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await apiFetch(`/api/users/${btn.dataset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      await loadUsers();
    });
  });
}

async function onInvite(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const msg = document.getElementById('invite-msg');
  try {
    await apiFetch('/api/users/invite', {
      method: 'POST',
      body: JSON.stringify({
        email: fd.get('email'),
        display_name: fd.get('display_name'),
        role: fd.get('role'),
      }),
    });
    msg.textContent = 'Invite sent — magic link emailed.';
    e.target.reset();
    await loadUsers();
  } catch (err) {
    msg.textContent = err.message;
  }
}
