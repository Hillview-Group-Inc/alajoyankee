/* ============================================
   FORGOT-PASSWORD.JS
   ============================================ */

'use strict';

(function () {
  const form    = document.getElementById('forgotForm');
  if (!form) return;

  const alertEl = document.getElementById('forgotAlert');
  const btn     = document.getElementById('forgotBtn');
  const btnText = document.getElementById('forgotBtnText');
  const emailEl = document.getElementById('email');

  emailEl.addEventListener('blur', () => {
    const msg = Validate.email(emailEl.value) ? '' : 'Please enter a valid email';
    fieldError('email', msg);
  });
  emailEl.addEventListener('input', () => clearFieldError('email'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!Validate.email(emailEl.value)) {
      fieldError('email', 'Please enter a valid email');
      return;
    }

    btn.classList.add('loading');
    btnText.innerHTML = '<span class="spinner"></span> Sending…';
    hideAlert(alertEl);

    try {
      const data = await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: emailEl.value.trim().toLowerCase() }),
      });
      showAlert(alertEl, 'success', data.message);
      form.reset();
    } catch (err) {
      showAlert(alertEl, 'error', err.message || 'Could not send reset link.');
    } finally {
      btn.classList.remove('loading');
      btnText.textContent = 'Send Reset Link';
    }
  });
})();
