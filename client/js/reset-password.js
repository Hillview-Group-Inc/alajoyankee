/* ============================================
   RESET-PASSWORD.JS
   ============================================ */

'use strict';

(function () {
  const form = document.getElementById('resetForm');
  if (!form) return;

  const alertEl     = document.getElementById('resetAlert');
  const btn         = document.getElementById('resetBtn');
  const btnText     = document.getElementById('resetBtnText');
  const passEl      = document.getElementById('password');
  const confirmEl   = document.getElementById('confirmPassword');
  const strengthEl  = document.getElementById('passwordStrength');
  const strengthFill = document.getElementById('strengthFill');
  const strengthText = document.getElementById('strengthText');

  // Pull token from query string
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');

  if (!token) {
    showAlert(alertEl, 'error', 'This page must be opened from a valid password-reset email link.');
    btn.disabled = true;
    return;
  }

  // Password toggles + strength meter
  setupToggle('togglePassword',        'password');
  setupToggle('toggleConfirmPassword', 'confirmPassword');

  passEl.addEventListener('input', () => {
    const v = passEl.value;
    if (!v) { strengthEl.style.display = 'none'; return; }
    strengthEl.style.display = 'block';
    const { level, label } = Validate.passwordStrength(v);
    strengthFill.className = `strength-fill ${level}`;
    strengthText.className = `strength-text ${level}`;
    strengthText.textContent = label;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let valid = true;
    const { score } = Validate.passwordStrength(passEl.value);
    if (!passEl.value || score < 3) {
      fieldError('password', 'Password is too weak — include uppercase, numbers, and symbols');
      valid = false;
    }
    if (passEl.value !== confirmEl.value) {
      fieldError('confirmPassword', 'Passwords do not match');
      valid = false;
    }
    if (!valid) return;

    btn.classList.add('loading');
    btnText.innerHTML = '<span class="spinner"></span> Updating…';
    hideAlert(alertEl);

    try {
      const data = await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password: passEl.value }),
      });
      showAlert(alertEl, 'success', data.message);
      showToast('Password updated', 'success', 'Redirecting to sign in…');
      setTimeout(() => { window.location.href = 'signin.html'; }, 1500);
    } catch (err) {
      showAlert(alertEl, 'error', err.message || 'Reset failed.');
      btn.classList.remove('loading');
      btnText.textContent = 'Update Password';
    }
  });

  function setupToggle(btnId, inputId) {
    const b = document.getElementById(btnId);
    const i = document.getElementById(inputId);
    if (!b || !i) return;
    b.addEventListener('click', () => {
      const isPass = i.type === 'password';
      i.type = isPass ? 'text' : 'password';
      b.textContent = isPass ? '🙈' : '👁';
    });
  }
})();
