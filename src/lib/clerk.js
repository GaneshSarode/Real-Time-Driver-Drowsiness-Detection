// ==========================================================================
// Aegis Drive — Clerk Authentication Module
// ==========================================================================

import { Clerk } from '@clerk/clerk-js';

let clerkInstance = null;

/**
 * Initialize Clerk and load the session.
 * Must be called before any other auth functions.
 * @returns {Promise<Clerk>} The loaded Clerk instance
 */
export async function initClerk() {
  if (clerkInstance) return clerkInstance;

  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!key || key === 'pk_test_REPLACE_ME') {
    console.warn('[Aegis Auth] Clerk publishable key not configured. Auth disabled.');
    return null;
  }

  try {
    clerkInstance = new Clerk(key);
    await clerkInstance.load();
    return clerkInstance;
  } catch (err) {
    console.error('[Aegis Auth] Failed to initialize Clerk:', err);
    return null;
  }
}

/**
 * Get the Clerk instance (must call initClerk first).
 */
export function getClerk() {
  return clerkInstance;
}

/**
 * Get the current authenticated user, or null.
 */
export function getUser() {
  return clerkInstance?.user ?? null;
}

/**
 * Get the current user's Clerk ID for database storage.
 */
export function getUserId() {
  return clerkInstance?.user?.id ?? null;
}

/**
 * Require authentication on a page. If not authenticated,
 * redirects to the landing page with sign-in prompt.
 * @returns {Promise<Clerk|null>} Clerk instance if authenticated
 */
export async function requireAuth() {
  const clerk = await initClerk();

  // If Clerk isn't configured, allow access (dev mode)
  if (!clerk) return null;

  if (!clerk.user) {
    window.location.href = '/?sign-in=true';
    return null;
  }

  return clerk;
}

/**
 * Sign the user out and redirect to landing page.
 */
export async function signOut() {
  if (clerkInstance) {
    await clerkInstance.signOut({ redirectUrl: '/' });
  } else {
    window.location.href = '/';
  }
}

/**
 * Mount the Clerk UserButton component into a container element.
 * Shows avatar, name, and sign-out dropdown.
 * @param {HTMLElement} container - DOM element to mount into
 */
export function mountUserButton(container) {
  if (clerkInstance && clerkInstance.user && container) {
    clerkInstance.mountUserButton(container);
  }
}

/**
 * Open the Clerk sign-in modal overlay.
 */
export function openSignIn() {
  if (clerkInstance) {
    clerkInstance.openSignIn();
  }
}

/**
 * Open the Clerk sign-up modal overlay.
 */
export function openSignUp() {
  if (clerkInstance) {
    clerkInstance.openSignUp();
  }
}
