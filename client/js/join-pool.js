/* ============================================
   JOIN-POOL.JS — Enrollment + active pool list
   ============================================ */

'use strict';

(function initJoinPool() {
  if (!Auth.isLoggedIn()) {
    window.location.href = 'signin.html';
    return;
  }

  const form        = document.getElementById('enrollForm');
  const sizeSel     = document.getElementById('poolSizeID');
  const schedSel    = document.getElementById('rotationScheduleID');
  const amtSel      = document.getElementById('contributionAmountID');
  const preview     = document.getElementById('enrollPreview');
  const previewBody = document.getElementById('enrollPreviewBody');
  const alertEl     = document.getElementById('enrollAlert');
  const btn         = document.getElementById('enrollBtn');
  const btnText     = document.getElementById('enrollBtnText');

  let options = { poolSizes: [], schedules: [], amounts: [] };

  loadOptions();
  loadMyPools();

  /* ── Load lookups ── */
  async function loadOptions() {
    try {
      const data = await apiRequest('/pools/options');
      options = data;
      fillSelect(sizeSel,  data.poolSizes, o => ({ value: o.PoolSizeID,           label: `${o.PoolSizeName} · ${o.PoolSizeValue} members` }));
      fillSelect(schedSel, data.schedules, o => ({ value: o.RotationScheduleID,   label: `${o.RotationScheduleName} · every ${o.ValueInDays} days` }));
      fillSelect(amtSel,   data.amounts,   o => ({ value: o.ContributionAmountID, label: `$${Number(o.Amount).toLocaleString()}` }));
    } catch (err) {
      showAlert(alertEl, 'error', `Could not load options: ${err.message}`);
    }
  }

  function fillSelect(sel, rows, mapFn) {
    sel.innerHTML = '<option value="">Choose one…</option>' +
      rows.map(r => {
        const { value, label } = mapFn(r);
        return `<option value="${value}">${label}</option>`;
      }).join('');
    sel.addEventListener('change', updatePreview);
  }

  function updatePreview() {
    const size  = options.poolSizes.find(o => o.PoolSizeID == sizeSel.value);
    const sched = options.schedules.find(o => o.RotationScheduleID == schedSel.value);
    const amt   = options.amounts.find(o => o.ContributionAmountID == amtSel.value);
    if (!size || !sched || !amt) {
      preview.style.display = 'none';
      return;
    }
    const totalCycle = size.PoolSizeValue * Number(amt.Amount);
    const cycleDays  = (size.PoolSizeValue - 1) * sched.ValueInDays;
    previewBody.innerHTML = `
      <div><strong>${size.PoolSizeValue}</strong> members contribute <strong>$${Number(amt.Amount).toLocaleString()}</strong> every <strong>${sched.ValueInDays} days</strong>.</div>
      <div>Each rotation pays out a total of <strong>$${totalCycle.toLocaleString()}</strong>.</div>
      <div>Full cycle length: roughly <strong>${cycleDays} days</strong> from start to last contribution.</div>
    `;
    preview.style.display = 'block';
  }

  /* ── Load active pools ── */
  async function loadMyPools() {
    const wrap = document.getElementById('myPools');
    try {
      const { pools } = await apiRequest('/pools/active');
      if (!pools.length) {
        wrap.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--color-text-muted);">
          <div style="font-size:2.4rem;margin-bottom:8px;">🌱</div>
          You're not in any pools yet. Pick one above to get started.
        </div>`;
        return;
      }
      wrap.innerHTML = pools.map(p => `
        <div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong>${escHtml(p.PoolSizeName)}</strong>
            <span class="badge ${p.PoolStatus === 'filled' ? 'badge-green' : 'badge-gold'}">
              ${p.PoolStatus === 'filled' ? '✓ Filled' : 'Open · ' + p.MemberCount + '/' + p.PoolSizeValue}
            </span>
          </div>
          <div style="font-size:.88rem;color:var(--color-text-muted);">
            ${escHtml(p.RotationScheduleName)} · $${Number(p.ContributionAmount).toLocaleString()} per cycle · Your rank: <strong>#${p.Rank}</strong>
          </div>
          ${p.RotationStartDate ? `
            <div style="font-size:.82rem;color:var(--color-text-muted);margin-top:6px;">
              Starts ${new Date(p.RotationStartDate).toLocaleDateString()} · Ends ${new Date(p.RotationEndDate).toLocaleDateString()}
            </div>
          ` : ''}
        </div>
      `).join('');
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error"><span class="alert-icon">❌</span><span>${escHtml(err.message)}</span></div>`;
    }
  }

  /* ── Submit ── */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let valid = true;
    if (!sizeSel.value)  { fieldError('poolSizeID',           'Pool size is required'); valid = false; }
    if (!schedSel.value) { fieldError('rotationScheduleID',   'Rotation schedule is required'); valid = false; }
    if (!amtSel.value)   { fieldError('contributionAmountID', 'Contribution amount is required'); valid = false; }
    if (!valid) return;

    btn.classList.add('loading');
    btnText.innerHTML = '<span class="spinner"></span> Enrolling…';
    hideAlert(alertEl);

    try {
      const data = await apiRequest('/pools/enroll', {
        method: 'POST',
        body: JSON.stringify({
          poolSizeID:           parseInt(sizeSel.value, 10),
          rotationScheduleID:   parseInt(schedSel.value, 10),
          contributionAmountID: parseInt(amtSel.value, 10),
        }),
      });

      showAlert(alertEl, 'success', data.message);
      showToast('Enrolled', 'success', data.filled ? 'The pool is full — rotation has started!' : `You're rank #${data.rank}.`);
      loadMyPools();
      btn.classList.remove('loading');
      btnText.textContent = 'Enroll Me';
    } catch (err) {
      showAlert(alertEl, 'error', err.message || 'Enrollment failed.');
      btn.classList.remove('loading');
      btnText.textContent = 'Enroll Me';
    }
  });

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
