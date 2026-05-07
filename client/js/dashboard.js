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
      if (name === 'savings')  loadSavingsPanel();
      if (name === 'admin' && window.AdminPanel)    window.AdminPanel.activate();
    }
  }

  // ── Reveal admin sidebar entry if user is admin ──
  if (user && user.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
  }

  // ── Notifications dropdown ──
  setupNotifications();

  // ── Initial overview load ──
  loadOverview();

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

  // ── Overview cards: Total Saved + Active Groups + Next Contribution ──
  async function loadOverview() {
    const upcomingEl = document.getElementById('upcomingContainer');
    try {
      const [poolsData, rotData, payData] = await Promise.all([
        apiRequest('/pools/active'),
        apiRequest('/rotations/current'),
        apiRequest('/payments/mine'),
      ]);

      const pools     = poolsData.pools     || [];
      const rotations = rotData.rotations   || [];
      const payments  = payData.payments    || [];

      // Total Saved (verified contributions)
      setEl('statTotalSaved',      `$${Number(payData.totalVerified || 0).toLocaleString()}`);
      setEl('statTotalSavedLabel', (payData.totalPending || 0) > 0
        ? `+ $${Number(payData.totalPending).toLocaleString()} pending verification`
        : 'Verified contributions only');

      // Active Groups
      setEl('statActiveGroups', String(pools.length));
      setEl('statActiveGroupsLabel', pools.length === 0
        ? 'Join your first pool to get started'
        : `${pools.filter(p => p.PoolStatus === 'filled').length} active · ${pools.filter(p => p.PoolStatus === 'open').length} forming`);

      // Next Contribution = earliest future ContributionDueDate
      const today = new Date(); today.setHours(0,0,0,0);
      const upcoming = rotations
        .filter(r => new Date(r.ContributionDueDate) >= today)
        .sort((a, b) => new Date(a.ContributionDueDate) - new Date(b.ContributionDueDate));

      if (upcoming.length > 0) {
        const next = upcoming[0];
        setEl('statNextAmount', `$${Number(next.ContributionDue).toLocaleString()}`);
        setEl('statNextDate',   `Due ${new Date(next.ContributionDueDate).toLocaleDateString()}`);
      } else {
        setEl('statNextAmount', '—');
        setEl('statNextDate',   'No upcoming contribution');
      }

      // Activity feed = recent payments + upcoming due dates, merged
      const activity = [];
      payments.slice(0, 8).forEach(p => activity.push({
        date:  new Date(p.PaymentDate),
        kind:  'payment',
        title: `Payment ${p.Status.toLowerCase()}`,
        sub:   p.PoolSizeName,
        amount: Number(p.Amount),
        status: p.Status,
      }));
      upcoming.slice(0, 5).forEach(r => activity.push({
        date:  new Date(r.ContributionDueDate),
        kind:  'due',
        title: `Contribution due`,
        sub:   `${r.PoolSizeName} · rank #${r.Rank}`,
        amount: Number(r.ContributionDue),
        status: 'Upcoming',
      }));
      activity.sort((a, b) => b.date - a.date);

      if (!activity.length) {
        upcomingEl.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--color-text-muted);">
          <div style="font-size:2.4rem;margin-bottom:8px;">📭</div>
          No activity yet. <a href="join-pool.html" style="color:var(--color-primary);font-weight:600;">Join a pool</a> to start saving.
        </div>`;
      } else {
        upcomingEl.innerHTML = `
          <table class="data-table">
            <thead><tr><th>Date</th><th>Activity</th><th>Pool</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              ${activity.slice(0, 10).map(a => {
                const badgeClass =
                  a.status === 'Verified' ? 'badge-green' :
                  a.status === 'Pending'  ? 'badge-gold'  :
                  a.status === 'Upcoming' ? ''            : '';
                const amountColor = a.kind === 'payment'
                  ? (a.status === 'Verified' ? 'var(--color-success)' : 'var(--color-text)')
                  : 'var(--color-accent)';
                return `
                  <tr>
                    <td style="white-space:nowrap;font-size:.85rem;color:var(--color-text-muted);">${a.date.toLocaleDateString()}</td>
                    <td>${escHtml(a.title)}</td>
                    <td>${escHtml(a.sub)}</td>
                    <td style="color:${amountColor};font-weight:600;">$${a.amount.toLocaleString()}</td>
                    <td><span class="badge ${badgeClass}">${escHtml(a.status)}</span></td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      }
    } catch (err) {
      upcomingEl.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span>Could not load: ${escHtml(err.message)}</span></div>`;
    }
  }

  // ── My Savings panel: list of pools ──
  async function loadSavingsPanel() {
    const wrap = document.getElementById('savingsPoolsContainer');
    if (!wrap) return;
    try {
      const { pools } = await apiRequest('/pools/active');
      if (!pools.length) {
        wrap.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px 16px;color:var(--color-text-muted);">
          <div style="font-size:2.4rem;margin-bottom:8px;">🌱</div>
          You haven't joined any pools yet.
        </div>`;
        return;
      }
      const palette = [
        ['var(--color-primary-dark)',   'var(--color-primary-light)'],
        ['var(--color-secondary-dark)', 'var(--color-secondary-light)'],
        ['#8b3a1e',                     '#c0522a'],
      ];
      wrap.innerHTML = pools.map((p, i) => {
        const [c1, c2] = palette[i % palette.length];
        return `
          <div style="background:linear-gradient(135deg,${c1},${c2});border-radius:var(--radius-lg);padding:32px;color:white;">
            <div style="font-size:.82rem;text-transform:uppercase;letter-spacing:.1em;opacity:.75;margin-bottom:12px;">
              ${escHtml(p.PoolSizeName)}
            </div>
            <div style="font-family:var(--font-display);font-size:2.4rem;font-weight:800;margin-bottom:8px;">
              $${Number(p.ContributionAmount).toLocaleString()}
            </div>
            <div style="opacity:.8;font-size:.9rem;margin-bottom:20px;">
              Your rank: #${p.Rank} of ${p.PoolSizeValue} · ${escHtml(p.PoolStatus)}
            </div>
            <div style="background:rgba(255,255,255,.15);border-radius:var(--radius-md);padding:12px 16px;display:flex;justify-content:space-between;">
              <span style="font-size:.85rem;opacity:.8;">${p.MemberCount}/${p.PoolSizeValue} members</span>
              <span style="font-size:.85rem;font-weight:600;">${escHtml(p.RotationScheduleName)}</span>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      wrap.innerHTML = `<div style="grid-column:1/-1;" class="alert alert-error">
        <span class="alert-icon">❌</span><span>${escHtml(err.message)}</span></div>`;
    }
  }

  // ── Notifications ──
  async function setupNotifications() {
    const btn      = document.getElementById('notifBtn');
    const dropdown = document.getElementById('notifDropdown');
    const list     = document.getElementById('notifList');
    const badge    = document.getElementById('notifBadge');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
      if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    try {
      const { notifications } = await apiRequest('/notifications/mine?limit=20');
      if (!notifications.length) {
        list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--color-text-muted);font-size:.9rem;">
          No notifications yet.
        </div>`;
        badge.style.display = 'none';
        return;
      }
      // Use unsent count as the "unread" badge
      const unreadCount = notifications.filter(n => !n.IsSent).length;
      if (unreadCount > 0) {
        badge.textContent = String(unreadCount);
        badge.style.display = 'inline-block';
      }
      list.innerHTML = notifications.map(n => `
        <div style="padding:12px 16px;border-bottom:1px solid var(--color-border);">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:4px;">
            <strong style="font-size:.9rem;">${escHtml(n.Title)}</strong>
            <span style="font-size:.7rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em;">${n.Type}</span>
          </div>
          <div style="font-size:.82rem;color:var(--color-text-muted);white-space:pre-wrap;line-height:1.4;max-height:80px;overflow:hidden;">${escHtml(n.Message)}</div>
          <div style="font-size:.72rem;color:var(--color-text-muted);margin-top:6px;">${new Date(n.CreatedAt).toLocaleString()}</div>
        </div>
      `).join('');
    } catch (err) {
      list.innerHTML = `<div style="padding:16px;color:var(--color-error);font-size:.85rem;">Could not load.</div>`;
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
