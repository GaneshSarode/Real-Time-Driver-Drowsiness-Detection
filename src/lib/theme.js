// ==========================================================================
// Aegis Drive — Theme Toggle Module (Dark/Light)
// ==========================================================================

import { icon } from './icons.js';

const STORAGE_KEY = 'aegis-drive-theme';

/**
 * Initialize the theme from localStorage and set up toggle button.
 * Call this on every page load.
 * @param {string} [toggleBtnId='btn-theme-toggle'] - ID of the toggle button
 */
export function initTheme(toggleBtnId = 'btn-theme-toggle') {
  const saved = localStorage.getItem(STORAGE_KEY);

  // Apply saved theme (default: dark)
  if (saved === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }

  // Set up toggle button
  const btn = document.getElementById(toggleBtnId);
  if (btn) {
    updateToggleIcon(btn);
    btn.addEventListener('click', () => {
      toggleTheme();
      updateToggleIcon(btn);
    });
  }
}

/**
 * Toggle between dark and light themes.
 */
export function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');
  return isLight;
}

/**
 * Get the current theme.
 * @returns {'dark'|'light'}
 */
export function getTheme() {
  return document.body.classList.contains('light-theme') ? 'light' : 'dark';
}

/**
 * Update the toggle button icon based on current theme.
 * @param {HTMLElement} btn - The toggle button element
 */
function updateToggleIcon(btn) {
  const isLight = document.body.classList.contains('light-theme');
  btn.innerHTML = isLight ? icon('moon', 18) : icon('sun', 18);
  btn.title = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
}
