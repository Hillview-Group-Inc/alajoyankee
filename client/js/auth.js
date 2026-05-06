/* ============================================
   AUTH.JS — Sign Up & Sign In Logic
   ============================================ */

'use strict';

/* ════════════════════════════════════════════
   SIGN UP
   ════════════════════════════════════════════ */
(function initSignup() {
  const form = document.getElementById('signupForm');
  if (!form) return;

  // Redirect if already logged in
  if (Auth.isLoggedIn()) {
    window.location.href = 'dashboard.html';
    return;
  }

  // Password strength meter
  const passwordInput   = document.getElementById('password');
  const strengthEl      = document.getElementById('passwordStrength');
  const strengthFill    = document.getElementById('strengthFill');
  const strengthText    = document.getElementById('strengthText');

  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      const val = passwordInput.value;
      if (!val) { strengthEl.style.display = 'none'; return; }
      strengthEl.style.display = 'block';
      const { level, label } = Validate.passwordStrength(val);
      strengthFill.className  = `strength-fill ${level}`;
      strengthText.className  = `strength-text ${level}`;
      strengthText.textContent = label;
    });
  }

  // Password visibility toggles
  setupToggle('togglePassword', 'password');
  setupToggle('toggleConfirmPassword', 'confirmPassword');

  // Inline validation on blur
  addBlurValidation('firstName', v => Validate.notEmpty(v) ? '' : 'First name is required');
  addBlurValidation('lastName',  v => Validate.notEmpty(v) ? '' : 'Last name is required');
  addBlurValidation('email',     v => Validate.email(v)    ? '' : 'Please enter a valid email address');
  addBlurValidation('password',  v => {
    if (!Validate.notEmpty(v)) return 'Password is required';
    const { score } = Validate.passwordStrength(v);
    return score < 3 ? 'Password is too weak — include uppercase, numbers, and symbols' : '';
  });
  addBlurValidation('confirmPassword', v => {
    const pass = document.getElementById('password')?.value || '';
    return v === pass ? '' : 'Passwords do not match';
  });

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateSignupForm()) return;

    const btn     = document.getElementById('signupBtn');
    const btnText = document.getElementById('signupBtnText');
    const alertEl = document.getElementById('signupAlert');

    btn.classList.add('loading');
    btnText.innerHTML = '<span class="spinner"></span> Creating Account...';
    hideAlert(alertEl);

    const payload = {
      firstName:       form.firstName.value.trim(),
      lastName:        form.lastName.value.trim(),
      email:           form.email.value.trim().toLowerCase(),
      password:        form.password.value,
    };

    try {
      const data = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      Auth.save(data.token, data.user);
      showToast('Account Created!', 'success', 'Welcome to Alajo Yankee 🎉');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);

    } catch (err) {
      showAlert(alertEl, 'error', err.message || 'Registration failed. Please try again.');
      btn.classList.remove('loading');
      btnText.textContent = 'Create Account';
    }
  });

  function validateSignupForm() {
    let valid = true;

    if (!Validate.notEmpty(form.firstName.value)) {
      fieldError('firstName', 'First name is required'); valid = false;
    }
    if (!Validate.notEmpty(form.lastName.value)) {
      fieldError('lastName', 'Last name is required'); valid = false;
    }
    if (!Validate.email(form.email.value)) {
      fieldError('email', 'Please enter a valid email address'); valid = false;
    }
    const { score } = Validate.passwordStrength(form.password.value);
    if (!form.password.value || score < 3) {
      fieldError('password', 'Password is too weak — include uppercase, numbers, and symbols'); valid = false;
    }
    if (form.password.value !== form.confirmPassword.value) {
      fieldError('confirmPassword', 'Passwords do not match'); valid = false;
    }
    if (!form.agreeTerms.checked) {
      fieldError('terms', 'You must agree to the Terms of Service'); valid = false;
    }
    return valid;
  }
})();

/* ════════════════════════════════════════════
   SIGN IN
   ════════════════════════════════════════════ */
(function initSignin() {
  const form = document.getElementById('signinForm');
  if (!form) return;

  // Redirect if already logged in
  if (Auth.isLoggedIn()) {
    window.location.href = 'dashboard.html';
    return;
  }

  setupToggle('togglePassword', 'password');

  addBlurValidation('email',    v => Validate.email(v)    ? '' : 'Please enter a valid email');
  addBlurValidation('password', v => Validate.notEmpty(v) ? '' : 'Password is required');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!Validate.email(form.email.value)) {
      fieldError('email', 'Please enter a valid email'); return;
    }
    if (!Validate.notEmpty(form.password.value)) {
      fieldError('password', 'Password is required'); return;
    }

    const btn     = document.getElementById('signinBtn');
    const btnText = document.getElementById('signinBtnText');
    const alertEl = document.getElementById('signinAlert');

    btn.classList.add('loading');
    btnText.innerHTML = '<span class="spinner"></span> Signing In...';
    hideAlert(alertEl);

    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email:    form.email.value.trim().toLowerCase(),
          password: form.password.value,
        }),
      });

      Auth.save(data.token, data.user);
      showToast('Welcome back!', 'success', `Good to see you, ${data.user.firstName}!`);
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);

    } catch (err) {
      showAlert(alertEl, 'error', err.message || 'Invalid email or password.');
      btn.classList.remove('loading');
      btnText.textContent = 'Sign In';
    }
  });
})();

/* ════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════ */
function setupToggle(btnId, inputId) {
  const btn   = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const isPass = input.type === 'password';
    input.type   = isPass ? 'text' : 'password';
    btn.textContent = isPass ? '🙈' : '👁';
    btn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
  });
}

function addBlurValidation(fieldId, validateFn) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  input.addEventListener('blur', () => {
    const msg = validateFn(input.value);
    if (msg) fieldError(fieldId, msg);
    else fieldSuccess(fieldId);
  });
  input.addEventListener('input', () => clearFieldError(fieldId));
}

function showAlert(el, type, message) {
  if (!el) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  el.className = `alert alert-${type}`;
  el.innerHTML = `<span class="alert-icon">${icons[type]||''}</span><span>${message}</span>`;
  el.style.display = 'flex';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAlert(el) {
  if (el) el.style.display = 'none';
}

window.setupToggle   = setupToggle;
window.showAlert     = showAlert;
window.hideAlert     = hideAlert;
