/* ============================================
   MAIN.JS — Nav, Loader, Toast, Utils
   ============================================ */

'use strict';

/* ── Config ── */
const API_BASE = '/api';

/* ════════════════════════════════════════════
   PAGE LOADER
   ════════════════════════════════════════════ */
window.addEventListener('load', () => {
  const loader = document.getElementById('pageLoader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 500);
  }
});

/* ════════════════════════════════════════════
   NAVBAR — Scroll + Hero mode + Mobile Toggle
   ════════════════════════════════════════════ */
(function initNav() {
  const navbar   = document.getElementById('navbar');
  const toggle   = document.getElementById('navToggle');
  const drawer   = document.getElementById('navDrawer');
  if (!navbar) return;

  const isHeroMode = navbar.classList.contains('hero-mode');

  function updateNavbarStyle() {
    const scrolled = window.scrollY > 50;
    navbar.classList.toggle('scrolled', scrolled);
    if (isHeroMode) {
      navbar.classList.toggle('hero-mode', !scrolled);
    }
  }

  window.addEventListener('scroll', updateNavbarStyle, { passive: true });
  updateNavbarStyle();

  // Mobile toggle
  if (toggle && drawer) {
    toggle.addEventListener('click', () => {
      const isOpen = drawer.classList.toggle('open');
      toggle.classList.toggle('open', isOpen);
      toggle.setAttribute('aria-expanded', isOpen);
    });

    // Close drawer when clicking outside
    document.addEventListener('click', (e) => {
      if (!navbar.contains(e.target) && !drawer.contains(e.target)) {
        drawer.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', false);
      }
    });
  }
})();

/* ════════════════════════════════════════════
   FOOTER YEAR
   ════════════════════════════════════════════ */
document.querySelectorAll('#year').forEach(el => {
  el.textContent = new Date().getFullYear();
});

/* ════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ════════════════════════════════════════════ */
function showToast(title, type = 'success', message = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-title">${icons[type] || '•'} ${title}</div>
    ${message ? `<div class="toast-msg">${message}</div>` : ''}
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
window.showToast = showToast;

/* ════════════════════════════════════════════
   ACCORDION
   ════════════════════════════════════════════ */
function toggleAccordion(header) {
  const item = header.closest('.accordion-item');
  const isOpen = item.classList.toggle('open');
  header.setAttribute('aria-expanded', isOpen);
}
window.toggleAccordion = toggleAccordion;

/* ════════════════════════════════════════════
   FORM VALIDATION HELPERS
   ════════════════════════════════════════════ */
const Validate = {
  email(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  },
  phone(val) {
    if (!val.trim()) return true; // optional
    return /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(val.trim());
  },
  minLength(val, n) {
    return val.trim().length >= n;
  },
  notEmpty(val) {
    return val.trim().length > 0;
  },
  passwordStrength(password) {
    let score = 0;
    if (password.length >= 8)  score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const levels = ['', 'weak', 'fair', 'good', 'strong', 'strong'];
    const labels = ['', 'Too Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    return { score, level: levels[score], label: labels[score] };
  }
};
window.Validate = Validate;

/* ── Show/hide field error ── */
function fieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}-error`);
  if (input)   input.classList.toggle('error', !!message);
  if (errorEl) {
    errorEl.textContent = message || '';
    errorEl.style.display = message ? 'flex' : 'none';
  }
}
window.fieldError = fieldError;

function clearFieldError(fieldId) {
  fieldError(fieldId, '');
  const input = document.getElementById(fieldId);
  if (input) input.classList.remove('error', 'success');
}
window.clearFieldError = clearFieldError;

function fieldSuccess(fieldId) {
  const input = document.getElementById(fieldId);
  if (input) {
    input.classList.remove('error');
    input.classList.add('success');
  }
  const errorEl = document.getElementById(`${fieldId}-error`);
  if (errorEl) errorEl.style.display = 'none';
}
window.fieldSuccess = fieldSuccess;

/* ── Throttle ── */
function throttle(fn, delay = 300) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= delay) { last = now; fn(...args); }
  };
}
window.throttle = throttle;

/* ════════════════════════════════════════════
   API HELPER (wraps fetch with auth header)
   ════════════════════════════════════════════ */
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('ay_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({ message: 'Unexpected server response' }));

  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}
window.apiRequest = apiRequest;

/* ════════════════════════════════════════════
   AUTH HELPERS
   ════════════════════════════════════════════ */
const Auth = {
  getToken()   { return localStorage.getItem('ay_token'); },
  getUser()    {
    try { return JSON.parse(localStorage.getItem('ay_user') || 'null'); }
    catch { return null; }
  },
  isLoggedIn() { return !!this.getToken(); },
  save(token, user) {
    localStorage.setItem('ay_token', token);
    localStorage.setItem('ay_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('ay_token');
    localStorage.removeItem('ay_user');
  },
  logout() {
    this.clear();
    window.location.href = 'index.html';
  }
};
window.Auth = Auth;

/* ════════════════════════════════════════════
   PASSWORD TOGGLE
   ════════════════════════════════════════════ */
document.querySelectorAll('.password-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.closest('.input-group').querySelector('input');
    if (!input) return;
    const isPass = input.type === 'password';
    input.type   = isPass ? 'text' : 'password';
    btn.textContent = isPass ? '🙈' : '👁';
  });
});

/* ════════════════════════════════════════════
   SCROLL ANIMATIONS (Intersection Observer)
   ════════════════════════════════════════════ */
(function initScrollAnimations() {
  if (!('IntersectionObserver' in window)) return;

  const cards = document.querySelectorAll('.card, .stat-item, .feature-item, .contact-info-item');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, i * 60);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  cards.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity .5s ease, transform .5s ease';
    obs.observe(el);
  });
})();

/* ════════════════════════════════════════════
   LAZY LOADING IMAGES
   ════════════════════════════════════════════ */
document.querySelectorAll('img[data-src]').forEach(img => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
      observer.disconnect();
    }
  });
  observer.observe(img);
});
