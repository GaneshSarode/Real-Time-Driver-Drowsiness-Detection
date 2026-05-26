// ==========================================================================
// Aegis Drive — Supabase Client Module
// ==========================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseAnonKey &&
    supabaseUrl !== 'https://REPLACE_ME.supabase.co' &&
    supabaseAnonKey !== 'REPLACE_ME') {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('[Aegis DB] Supabase credentials not configured. Database features disabled.');
}

export { supabase };

// ==========================================================================
// Driving Session CRUD Helpers
// ==========================================================================

/**
 * Create a new driving session row in Supabase.
 * @param {string} userId - Clerk user ID
 * @returns {Promise<Object|null>} The created session row, or null on error
 */
export async function createSession(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('driving_sessions')
    .insert({
      user_id: userId,
      duration_minutes: 0,
      alert_count: 0,
      yawn_count: 0,
      blink_count: 0,
      avg_ear: 0,
      avg_mar: 0,
      max_consecutive_closed_frames: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[Aegis DB] Failed to create session:', error);
    return null;
  }
  return data;
}

/**
 * Update an existing driving session row.
 * @param {string} sessionId - UUID of the session
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} The updated row, or null on error
 */
export async function updateSession(sessionId, updates) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('driving_sessions')
    .update(updates)
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    console.error('[Aegis DB] Failed to update session:', error);
    return null;
  }
  return data;
}

/**
 * Fetch all driving sessions for a user, newest first.
 * @param {string} userId - Clerk user ID
 * @param {number} [limit=50] - Max rows to fetch
 * @returns {Promise<Array>} Array of session objects
 */
export async function getUserSessions(userId, limit = 50) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('driving_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Aegis DB] Failed to fetch sessions:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch aggregated stats for a user.
 * @param {string} userId - Clerk user ID
 * @returns {Promise<Object>} Aggregated statistics
 */
export async function getUserStats(userId) {
  if (!supabase) {
    return { totalSessions: 0, totalMinutes: 0, totalAlerts: 0, avgEar: 0 };
  }

  const sessions = await getUserSessions(userId, 500);

  if (!sessions.length) {
    return { totalSessions: 0, totalMinutes: 0, totalAlerts: 0, avgEar: 0 };
  }

  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const totalAlerts = sessions.reduce((sum, s) => sum + (s.alert_count || 0), 0);
  const totalYawns = sessions.reduce((sum, s) => sum + (s.yawn_count || 0), 0);
  const totalBlinks = sessions.reduce((sum, s) => sum + (s.blink_count || 0), 0);

  // Weekly average EAR (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekSessions = sessions.filter(s => new Date(s.created_at) >= weekAgo);
  const avgEar = weekSessions.length
    ? weekSessions.reduce((sum, s) => sum + (s.avg_ear || 0), 0) / weekSessions.length
    : 0;

  return { totalSessions, totalMinutes, totalAlerts, totalYawns, totalBlinks, avgEar, sessions };
}
