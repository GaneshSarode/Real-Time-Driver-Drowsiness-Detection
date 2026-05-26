import './styles/design-system.css';
import './styles/landing.css';
import { initTheme } from './lib/theme.js';
import { initClerk } from './lib/clerk.js';

async function init() {
  // Theme toggle
  initTheme('btn-theme-toggle');

  // Clerk auth check (optional — works without keys)
  const clerk = await initClerk();

  // If already signed in, update CTA text
  if (clerk && clerk.user) {
    const cta = document.getElementById('hero-cta');
    if (cta) {
      cta.innerHTML = `Go to Dashboard <svg class="icon" width="18" height="18"><use href="/icons.svg#icon-arrow-right"/></svg>`;
    }
  }

  // Handle ?sign-in=true URL param (redirect from protected pages)
  const params = new URLSearchParams(window.location.search);
  if (params.get('sign-in') === 'true' && clerk) {
    clerk.openSignIn();
  }

  // Scroll reveal animation with IntersectionObserver
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));
}

init();
