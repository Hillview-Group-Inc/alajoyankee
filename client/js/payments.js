/* ============================================
   PAYMENTS.JS — submit + view payments
   ============================================ */

'use strict';

(function () {
  if (!Auth.isLoggedIn()) {
    window.location.href = 'signin.html';
    return;
  }

  const escHtml = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmt$    = (n) => `$${Number(n).toLocaleString()}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

  loadAll();

  async function loadAll() {
    await Promise.all([loadDue(), loadHistory()]);
  }

  /* ── Contributions due (from current rotations) ── */
  async function loadDue() {
    const wrap = document.getElementById('dueContainer');
    try {
      const [{ rotations }, { payments }] = await Promise.all([
        apiRequest('/rotations/current'),
        apiRequest('/payments/mine'),
      ]);

      // Skip rotation details that already have a Pending or Verified payment.
      // Match on (RotationID, due-date) — paymentDate is set to the submission time
      // not the due-date, so this is a best-effort filter using RotationID alone.
      const paidRotationIDs = new Set(
        payments.filter(p => p.Status !== 'Failed').map(p => p.RotationID)
      );

      const today = new Date(); today.setHours(0,0,0,0);
      const due = rotations.filter(r => !paidRotationIDs.has(r.RotationID))
                           .sort((a,b) => new Date(a.ContributionDueDate) - new Date(b.ContributionDueDate));

      if (!due.length) {
        wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--color-text-muted);">
          <div style="font-size:2rem;margin-bottom:6px;">🎯</div>
          You have no contributions due right now. Nice work!
        </div>`;
        return;
      }

      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Due</th><th>Pool</th><th>Rank</th><th>Amount</th><th></th>
          </tr></thead>
          <tbody>
            ${due.map(r => {
              const overdue = new Date(r.ContributionDueDate) < today;
              return `
                <tr data-rdid="${r.RotationDetailID}" data-amt="${r.ContributionDue}">
                  <td>
                    ${fmtDate(r.ContributionDueDate)}
                    ${overdue ? '<span class="badge" style="background:#fef2f2;color:var(--color-error);margin-left:6px;">overdue</span>' : ''}
                  </td>
                  <td>${escHtml(r.PoolSizeName)}<br><span style="font-size:.78rem;color:var(--color-text-muted);">${escHtml(r.RotationScheduleName)}</span></td>
                  <td>#${r.Rank}</td>
                  <td style="font-weight:600;">${fmt$(r.ContributionDue)}</td>
                  <td><button class="btn btn-primary btn-sm" data-pay>Pay Now</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>`;

      wrap.querySelectorAll('button[data-pay]').forEach(btn => {
        btn.addEventListener('click', () => {
          const tr = btn.closest('tr');
          submitPayment(parseInt(tr.dataset.rdid, 10), Number(tr.dataset.amt));
        });
      });
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span>${escHtml(err.message)}</span></div>`;
    }
  }

  async function submitPayment(rotationDetailID, amount) {
    if (!confirm(`Submit a payment of ${fmt$(amount)}? An admin will verify it before it counts.`)) return;
    try {
      await apiRequest('/payments/submit', {
        method: 'POST',
        body: JSON.stringify({ rotationDetailID, amount }),
      });
      showToast('Submitted', 'success', 'Awaiting admin verification.');
      loadAll();
    } catch (err) {
      showToast('Submit failed', 'error', err.message);
    }
  }

  /* ── History ── */
  async function loadHistory() {
    const wrap = document.getElementById('historyContainer');
    try {
      const data = await apiRequest('/payments/mine');
      document.getElementById('payTotalVerified').textContent = fmt$(data.totalVerified);
      document.getElementById('payTotalPending').textContent  = fmt$(data.totalPending);

      const payments = data.payments || [];
      if (!payments.length) {
        wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--color-text-muted);">No payments yet.</div>`;
        return;
      }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Date</th><th>Pool</th><th>Amount</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${payments.map(p => `
              <tr>
                <td style="font-size:.85rem;color:var(--color-text-muted);">${fmtDate(p.PaymentDate)}</td>
                <td>${escHtml(p.PoolSizeName)}<br><span style="font-size:.78rem;color:var(--color-text-muted);">${escHtml(p.RotationName)}</span></td>
                <td style="font-weight:600;">${fmt$(p.Amount)}</td>
                <td>
                  <span class="badge ${p.Status === 'Verified' ? 'badge-green' : (p.Status === 'Failed' ? '' : 'badge-gold')}"
                        ${p.Status === 'Failed' ? 'style="background:#fef2f2;color:var(--color-error);"' : ''}>
                    ${escHtml(p.Status)}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span>${escHtml(err.message)}</span></div>`;
    }
  }
})();
