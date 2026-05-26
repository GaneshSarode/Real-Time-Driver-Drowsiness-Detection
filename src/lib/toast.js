// ==========================================================================
// Aegis Drive — Toast Notification System
// ==========================================================================

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

/**
 * Show a toast notification.
 * @param {string} message - Text to display
 * @param {'success'|'error'|'info'} [type='info'] - Toast type
 * @param {number} [duration=3000] - Auto-dismiss duration in ms
 */
export function showToast(message, type = 'info', duration = 3000) {
  const parent = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;

  parent.appendChild(toast);

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, duration);
}
