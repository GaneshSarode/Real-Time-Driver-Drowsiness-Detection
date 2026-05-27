import './styles/design-system.css';
import './styles/landing.css';
import { initTheme } from './lib/theme.js';
import { initClerk } from './lib/clerk.js';

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

  // CTA button — default behavior is direct navigation to dashboard
  const cta = document.getElementById('hero-cta');

  // Load Clerk in background — enhance CTA when ready
  (async () => {
    try {
      const clerk = await initClerk();
      if (!clerk) return; // No Clerk keys — CTA stays as direct link

      if (clerk.user) {
        // Already logged in — update button text
        if (cta) {
          cta.innerHTML = `Go to Dashboard <svg class="icon" width="18" height="18"><use href="/icons.svg#icon-arrow-right"/></svg>`;
        }
      } else {
        // Clerk loaded but user not signed in — intercept to show modal
        if (cta) {
          cta.addEventListener('click', (e) => {
            e.preventDefault();
            clerk.openSignIn({
              forceRedirectUrl: '/dashboard.html',
              fallbackRedirectUrl: '/dashboard.html'
            });
          });
        }
      }

      // Handle ?sign-in=true URL param
      const params = new URLSearchParams(window.location.search);
      if (params.get('sign-in') === 'true') {
        clerk.openSignIn({
          forceRedirectUrl: '/dashboard.html',
          fallbackRedirectUrl: '/dashboard.html'
        });
      }
    } catch (err) {
      console.warn('[Aegis] Clerk failed to load (non-blocking):', err);
    }
  })();
}

init();
