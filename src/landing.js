import './styles/design-system.css';
import './styles/landing.css';
import { initTheme } from './lib/theme.js';

function init() {
  // Theme toggle
  initTheme('btn-theme-toggle');

  // Scroll reveal animation — runs immediately, never blocked
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));

  // CTA button — ALWAYS navigates to /dashboard.html via the href
  // We only update the text if user is already logged in
  const cta = document.getElementById('hero-cta');

  // Load Clerk in background — only used to update CTA text, never blocks navigation
  (async () => {
    try {
      const { initClerk } = await import('./lib/clerk.js');
      const clerk = await initClerk();
      if (!clerk) return;

      if (clerk.user && cta) {
        // Already logged in — just update button text, href still works
        cta.innerHTML = `Go to Dashboard <svg class="icon" width="18" height="18"><use href="/icons.svg#icon-arrow-right"/></svg>`;
      }
    } catch (err) {
      console.warn('[Aegis] Clerk failed to load (non-blocking):', err);
    }
  })();
}

init();
