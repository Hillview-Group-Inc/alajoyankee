/* ============================================
   DASHBOARD.JS — Auth Guard, Panels, Profile
   ============================================ */

'use strict';

(function initDashboard() {
  // ── Auth Guard ──
  if (!Auth.isLoggedIn()) {
    window.location.href = 'signin.html';
    return;
  }

  const user = Auth.getUser();
  const layout = document.getElementById('dashboardLayout');
  if (layout) layout.style.display = 'grid';

  // ── Populate user info ──
  if (user) {
    const initials = `${(user.firstName || '?')[0]}${(user.lastName || '?')[0]}`.toUpperCase();
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

    setEl('welcomeMsg',      `Welcome back, ${user.firstName || 'Member'}! 👋`);
    setEl('userDisplayName', fullName);
    setEl('userEmailDisplay', user.email || '');
    setEl('userAvatar',      initials);
    setEl('profileAvatar',   initials);
    setEl('profileName',     fullName);
    setEl('profileEmail',    user.email || '');
    setEl('profileFirst',    user.firstName || '—');
    setEl('profileLast',     user.lastName  || '—');
    setEl('profileEmailFull', user.email || '—');
    setEl('profileJoined',   user.createdAt
      ? new Date(user.createdAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
      : 'January 2024');
  }

  // ── Panel switching ──
  const sidebarLinks = document.querySelectorAll('.sidebar-link[data-panel]');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const panel = link.dataset.panel;
      switchPanel(panel);

      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  function switchPanel(name) {
    document.querySelectorAll('[id^="panel-"]').forEach(p => p.style.display = 'none');
    const target = document.getElementById(`panel-${name}`);
    if (target) {
      target.style.display = 'block';
      if (name === 'messages') loadMessages();
    }
  }

  // ── Logout ──
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      Auth.clear();
      showToast('Signed out', 'info', 'See you next time!');
      setTimeout(() => { window.location.href = 'index.html'; }, 800);
    });
  }

  // ── Load Messages (admin) ──
  async function loadMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--color-text-muted);">
      <div class="loader-ring" style="margin:0 auto 12px;"></div>
      <p>Loading messages...</p>
    </div>`;

    try {
      const data = await apiRequest('/messages');
      const messages = data.messages || data || [];

      if (!messages.length) {
        container.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--color-text-muted);">
          <div style="font-size:3rem;margin-bottom:16px;">📭</div>
          <p>No contact messages yet.</p>
        </div>`;
        return;
      }

      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Name</th><th>Email</th><th>Phone</th><th>Message</th>
            </tr>
          </thead>
          <tbody>
            ${messages.map(m => `
              <tr>
                <td style="white-space:nowrap;font-size:.82rem;color:var(--color-text-muted);">
                  ${m.SubmittedAt ? new Date(m.SubmittedAt).toLocaleDateString() : '—'}
                </td>
                <td style="font-weight:600;">${escHtml(m.Name || '')}</td>
                <td>${escHtml(m.Email || '')}</td>
                <td>${escHtml(m.Phone || '—')}</td>
                <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${escHtml(m.Message || '')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:48px 24px;">
        <div class="alert alert-error">
          <span class="alert-icon">❌</span>
          <span>Could not load messages: ${escHtml(err.message)}</span>
        </div>
      </div>`;
    }
  }

  // ── Helpers ──
  function setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
