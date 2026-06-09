// ==========================================================================
// Aegis Drive — Session Recorder (Supabase Auto-Save)
// ==========================================================================

import { createSession, updateSession } from './supabase.js';
import { showToast } from './toast.js';

const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * SessionRecorder tracks driving metrics and auto-saves to Supabase.
 * Usage:
 *   const recorder = new SessionRecorder(userId, stateRef);
 *   await recorder.start();
 *   // ... detection loop updates stateRef ...
 *   await recorder.stop();
 */
export class SessionRecorder {
  constructor(userId, stateRef) {
    this.userId = userId;
    this.stateRef = stateRef; // Reference to the app state object
    this.sessionId = null;
    this.startTime = null;
    this.checkpointTimer = null;
    this.earSamples = [];
    this.marSamples = [];
    this.isRecording = false;

    // Bind beforeunload handler
    this._onBeforeUnload = this._onBeforeUnload.bind(this);
  }

  /**
   * Start a new recording session.
   */
  async start() {
    if (this.isRecording) return;
    if (!this.userId) {
      console.warn('[Session] No user ID — session recording disabled');
      return;
    }

    const session = await createSession(this.userId);
    if (!session) {
      console.warn('[Session] Could not create session in database');
      return;
    }

    this.sessionId = session.id;
    this.startTime = Date.now();
    this.earSamples = [];
    this.marSamples = [];
    this.isRecording = true;

    // Auto-checkpoint every 5 minutes
    this.checkpointTimer = setInterval(() => this._checkpoint(), CHECKPOINT_INTERVAL_MS);

    // Save on tab close
    window.addEventListener('beforeunload', this._onBeforeUnload);

    showToast('Session recording started', 'success');
    console.log('[Session] Recording started:', this.sessionId);
  }

  /**
   * Add EAR/MAR samples from the detection loop.
   * Call this every frame to accumulate averages.
   */
  addSample(ear, mar) {
    if (!this.isRecording) return;
    if (typeof ear === 'number' && !isNaN(ear)) this.earSamples.push(ear);
    if (typeof mar === 'number' && !isNaN(mar)) this.marSamples.push(mar);
  }

  /**
   * Stop recording and perform final save.
   */
  async stop() {
    if (!this.isRecording) return;

    this.isRecording = false;
    clearInterval(this.checkpointTimer);
    window.removeEventListener('beforeunload', this._onBeforeUnload);

    await this._saveToDatabase();
    showToast('Session saved', 'success');
    console.log('[Session] Recording stopped and saved:', this.sessionId);
  }

  /**
   * Internal: periodic checkpoint save.
   */
  async _checkpoint() {
    if (!this.isRecording) return;
    await this._saveToDatabase();
    showToast('Session checkpoint saved', 'info', 2000);
    console.log('[Session] Checkpoint saved');
  }

  /**
   * Internal: build update payload and save to Supabase.
   */
  async _saveToDatabase() {
    if (!this.sessionId) return;

    const durationMinutes = (Date.now() - this.startTime) / 60000;
    const avgEar = this.earSamples.length
      ? this.earSamples.reduce((a, b) => a + b, 0) / this.earSamples.length
      : 0;
    const avgMar = this.marSamples.length
      ? this.marSamples.reduce((a, b) => a + b, 0) / this.marSamples.length
      : 0;

    const updates = {
      duration_minutes: parseFloat(durationMinutes.toFixed(2)),
      alert_count: this.stateRef.alertCount ?? 0,
      yawn_count: this.stateRef.yawnCount ?? 0,
      blink_count: this.stateRef.blinkCount ?? 0,
      avg_ear: parseFloat(avgEar.toFixed(4)),
      avg_mar: parseFloat(avgMar.toFixed(4)),
      max_consecutive_closed_frames: this.stateRef.maxConsecutiveClosedFrames ?? 0,
    };

    await updateSession(this.sessionId, updates);
  }

  /**
   * Internal: handle tab close with a best-effort keepalive update.
   */
  _onBeforeUnload() {
    if (!this.isRecording || !this.sessionId) return;

    // Best-effort save during page unload.
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const durationMinutes = (Date.now() - this.startTime) / 60000;
    const avgEar = this.earSamples.length
      ? this.earSamples.reduce((a, b) => a + b, 0) / this.earSamples.length
      : 0;
    const avgMar = this.marSamples.length
      ? this.marSamples.reduce((a, b) => a + b, 0) / this.marSamples.length
      : 0;

    const body = JSON.stringify({
      duration_minutes: parseFloat(durationMinutes.toFixed(2)),
      alert_count: this.stateRef.alertCount ?? 0,
      yawn_count: this.stateRef.yawnCount ?? 0,
      blink_count: this.stateRef.blinkCount ?? 0,
      avg_ear: parseFloat(avgEar.toFixed(4)),
      avg_mar: parseFloat(avgMar.toFixed(4)),
      max_consecutive_closed_frames: this.stateRef.maxConsecutiveClosedFrames ?? 0,
    });

    const url = `${supabaseUrl}/rest/v1/driving_sessions?id=eq.${this.sessionId}`;
    fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}
