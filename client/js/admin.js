/* ============================================
   ADMIN.JS — Pending payments, pools, rotations, configuration
   ============================================ */

'use strict';

(function () {
  const escHtml = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmt$    = (n) => `$${Number(n).toLocaleString()}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

  let activated = false;

  window.AdminPanel = {
    activate() {
      if (activated) return;
      activated = true;
      bindTabs();
      loadPayments();
      bindConfigForms();
    },
  };

  function bindTabs() {
    document.querySelectorAll('.admin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');
        const pane = document.getElementById(`admin-${tab}`);
        if (pane) pane.style.display = 'block';

        if (tab === 'payments')  loadPayments();
        if (tab === 'pools')     loadPools();
        if (tab === 'rotations') loadRotations();
        if (tab === 'config')    loadConfig();
      });
    });
  }

  /* ── Pending Payments ── */
  async function loadPayments() {
    const wrap = document.getElementById('adminPaymentsContainer');
    wrap.innerHTML = 'Loading...';
    try {
      const { payments } = await apiRequest('/payments/pending');
      if (!payments.length) {
        wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--color-text-muted);">No pending payments.</div>`;
        return;
      }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Submitted</th><th>Member</th><th>Pool</th><th>Amount</th><th>Action</th>
          </tr></thead>
          <tbody>
            ${payments.map(p => `
              <tr data-pid="${p.PaymentID}">
                <td style="font-size:.85rem;color:var(--color-text-muted);">${fmtDate(p.PaymentDate)}</td>
                <td>
                  <div>${escHtml(p.FirstName)} ${escHtml(p.LastName)}</div>
                  <div style="font-size:.78rem;color:var(--color-text-muted);">${escHtml(p.Email)}</div>
                </td>
                <td>${escHtml(p.PoolSizeName)}<br><span style="font-size:.78rem;color:var(--color-text-muted);">${escHtml(p.RotationName)}</span></td>
                <td style="font-weight:600;">${fmt$(p.Amount)}</td>
                <td>
                  <button class="btn btn-primary btn-sm" data-action="verify" data-pid="${p.PaymentID}">Verify</button>
                  <button class="btn btn-outline btn-sm" data-action="fail"   data-pid="${p.PaymentID}" style="color:var(--color-error);border-color:var(--color-error);">Reject</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
      wrap.querySelectorAll('button[data-action]').forEach(b => {
        b.addEventListener('click', () => verify(parseInt(b.dataset.pid, 10), b.dataset.action === 'verify' ? 'Verified' : 'Failed'));
      });
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span>${escHtml(err.message)}</span></div>`;
    }
  }

  async function verify(paymentID, status) {
    try {
      const data = await apiRequest('/payments/verify', {
        method: 'POST',
        body: JSON.stringify({ paymentID, status }),
      });
      showToast(status === 'Verified' ? 'Verified' : 'Rejected', 'success', data.rotationCompleted ? 'Rotation completed!' : '');
      loadPayments();
    } catch (err) {
      showToast('Action failed', 'error', err.message);
    }
  }

  /* ── All Pools ── */
  async function loadPools() {
    const wrap = document.getElementById('adminPoolsContainer');
    wrap.innerHTML = 'Loading...';
    try {
      const { pools } = await apiRequest('/admin/pools');
      if (!pools.length) {
        wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--color-text-muted);">No pools yet.</div>`;
        return;
      }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Pool</th><th>Members</th><th>Schedule</th><th>Amount</th><th>Status</th><th>Rotation</th>
          </tr></thead>
          <tbody>
            ${pools.map(p => `
              <tr>
                <td>${escHtml(p.PoolSizeName)}<br><span style="font-size:.78rem;color:var(--color-text-muted);">#${p.PoolID}</span></td>
                <td>${p.MemberCount}/${p.PoolSizeValue}</td>
                <td>${escHtml(p.RotationScheduleName)}</td>
                <td>${fmt$(p.ContributionAmount)}</td>
                <td><span class="badge ${p.Status === 'filled' ? 'badge-green' : (p.Status === 'completed' ? 'badge-gold' : '')}">${escHtml(p.Status)}</span></td>
                <td style="font-size:.85rem;color:var(--color-text-muted);">
                  ${p.RotationID ? `${escHtml(p.RotationStatus)} · ${fmtDate(p.RotationStartDate)} → ${fmtDate(p.RotationEndDate)}` : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span>${escHtml(err.message)}</span></div>`;
    }
  }

  /* ── All Rotations ── */
  async function loadRotations() {
    const wrap = document.getElementById('adminRotationsContainer');
    wrap.innerHTML = 'Loading...';
    try {
      const { rotations } = await apiRequest('/admin/rotations');
      if (!rotations.length) {
        wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--color-text-muted);">No rotations yet.</div>`;
        return;
      }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Rotation</th><th>Members</th><th>Verified Payments</th><th>Status</th><th>Window</th>
          </tr></thead>
          <tbody>
            ${rotations.map(r => `
              <tr>
                <td>${escHtml(r.RotationName)}<br><span style="font-size:.78rem;color:var(--color-text-muted);">${escHtml(r.PoolSizeName)} · ${fmt$(r.ContributionAmount)}</span></td>
                <td>${r.MemberCount}</td>
                <td>${r.VerifiedPayments} / ${r.MemberCount}</td>
                <td><span class="badge ${r.Status === 'completed' ? 'badge-gold' : 'badge-green'}">${escHtml(r.Status)}</span></td>
                <td style="font-size:.85rem;color:var(--color-text-muted);">${fmtDate(r.RotationStartDate)} → ${fmtDate(r.RotationEndDate)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span>${escHtml(err.message)}</span></div>`;
    }
  }

  /* ── Configuration ── */
  async function loadConfig() {
    try {
      const { poolSizes, schedules, amounts } = await apiRequest('/admin/config');
      renderConfig('cfgPoolSizesList', poolSizes,
        s => `${escHtml(s.PoolSizeName)} <span style="color:var(--color-text-muted);">(${s.PoolSizeValue} members)</span>`,
        s => ({ id: s.PoolSizeID,           active: s.IsActive, kind: 'pool-sizes' }));
      renderConfig('cfgSchedulesList', schedules,
        s => `${escHtml(s.RotationScheduleName)} <span style="color:var(--color-text-muted);">(${s.ValueInDays} days)</span>`,
        s => ({ id: s.RotationScheduleID,   active: s.IsActive, kind: 'schedules' }));
      renderConfig('cfgAmountsList', amounts,
        a => fmt$(a.Amount),
        a => ({ id: a.ContributionAmountID, active: a.IsActive, kind: 'amounts' }));
    } catch (err) {
      showToast('Could not load config', 'error', err.message);
    }
  }

  function renderConfig(elID, rows, labelFn, metaFn) {
    const el = document.getElementById(elID);
    if (!rows.length) { el.innerHTML = `<div style="color:var(--color-text-muted);font-size:.9rem;">None defined.</div>`; return; }
    el.innerHTML = rows.map(r => {
      const m = metaFn(r);
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--color-border);">
          <div>${labelFn(r)}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge ${m.active ? 'badge-green' : ''}">${m.active ? 'Active' : 'Inactive'}</span>
            <button class="btn btn-outline btn-sm" data-toggle data-kind="${m.kind}" data-id="${m.id}" data-active="${!m.active}">${m.active ? 'Disable' : 'Enable'}</button>
          </div>
        </div>`;
    }).join('');
    el.querySelectorAll('button[data-toggle]').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await apiRequest(`/admin/config/${b.dataset.kind}/${b.dataset.id}/active`, {
            method: 'PATCH',
            body: JSON.stringify({ active: b.dataset.active === 'true' }),
          });
          loadConfig();
        } catch (err) {
          showToast('Update failed', 'error', err.message);
        }
      });
    });
  }

  function bindConfigForms() {
    bindForm('cfgPoolSizeForm', '/admin/config/pool-sizes',
      f => ({ name: f.name.value.trim(), value: parseInt(f.value.value, 10) }));
    bindForm('cfgScheduleForm', '/admin/config/schedules',
      f => ({ name: f.name.value.trim(), valueInDays: parseInt(f.valueInDays.value, 10) }));
    bindForm('cfgAmountForm',   '/admin/config/amounts',
      f => ({ amount: Number(f.amount.value) }));
  }

  function bindForm(formID, endpoint, payloadFn) {
    const form = document.getElementById(formID);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiRequest(endpoint, { method: 'POST', body: JSON.stringify(payloadFn(form)) });
        showToast('Added', 'success');
        form.reset();
        loadConfig();
      } catch (err) {
        showToast('Add failed', 'error', err.message);
      }
    });
  }
})();
