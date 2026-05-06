/* ============================================
   CONTACT.JS — Contact Form Submission
   ============================================ */

'use strict';

(function initContactForm() {
  const form    = document.getElementById('contactForm');
  const success = document.getElementById('contactFormSuccess');
  if (!form) return;

  // Inline validation on blur
  const rules = {
    'contact-name':    v => Validate.notEmpty(v)  ? '' : 'Name is required',
    'contact-email':   v => Validate.email(v)      ? '' : 'Please enter a valid email',
    'contact-phone':   v => Validate.phone(v)      ? '' : 'Please enter a valid phone number',
    'contact-message': v => Validate.minLength(v, 20) ? '' : 'Message must be at least 20 characters',
  };

  Object.keys(rules).forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('blur',  () => {
      const msg = rules[id](input.value);
      fieldError(id, msg);
      if (!msg) fieldSuccess(id);
    });
    input.addEventListener('input', () => clearFieldError(id));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate all
    let valid = true;
    Object.keys(rules).forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      const msg = rules[id](input.value);
      if (msg) { fieldError(id, msg); valid = false; }
    });
    if (!valid) return;

    const btn     = document.getElementById('contactSubmitBtn');
    const btnText = document.getElementById('contactBtnText');
    btn.classList.add('loading');
    btnText.innerHTML = '<span class="spinner"></span> Sending...';

    const payload = {
      name:    document.getElementById('contact-name').value.trim(),
      email:   document.getElementById('contact-email').value.trim(),
      phone:   document.getElementById('contact-phone').value.trim(),
      message: document.getElementById('contact-message').value.trim(),
    };

    try {
      await apiRequest('/contact', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Show success
      form.style.display   = 'none';
      success.style.display = 'block';
      showToast('Message sent!', 'success', 'We\'ll be in touch within 1–2 business days.');

    } catch (err) {
      showToast('Send failed', 'error', err.message || 'Please try again.');
      btn.classList.remove('loading');
      btnText.textContent = 'Send Message';
    }
  });
})();
