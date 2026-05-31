import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import './styles/design-system.css';
import './styles/dashboard.css';
import { initTheme } from './lib/theme.js';
import { initClerk, mountUserButton, getUserId } from './lib/clerk.js';
import { SessionRecorder } from './lib/session-recorder.js';
import { icon } from './lib/icons.js';

// ==========================================================================
// Aegis Drive - Application Core State & Configuration
// ==========================================================================

const state = {
  // ML Engine
  faceLandmarker: null,
  wasmUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm",
  modelUrl: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  
  // Video & Streaming
  stream: null,
  isCameraActive: false,
  videoWidth: 640,
  videoHeight: 480,
  lastVideoTime: -1,
  
  // Calibration & Limits
  calibratedOpenEAR: 0.30,
  earThreshold: 0.22,
  marThreshold: 0.55,
  alarmDurationSeconds: 1.5,
  alarmVolume: 0.70,
  enableVisualAlert: true,
  drawMeshPoints: true,
  isMuted: false,

  // Live Metrics & State Machine
  currentStatus: "SAFE", // SAFE | DISTRACTED | ALARM
  ear: 0.30,
  mar: 0.12,
  pose: "Ahead", // Ahead | Looking Away | Nodding Down
  yawnCount: 0,
  blinkCount: 0,
  
  // Performance & Counters
  fps: 0,
  frameCount: 0,
  lastFpsTimestamp: 0,
  
  // Consecutive frame counters for state machine
  eyeClosedFrames: 0,
  yawnFrames: 0,
  noddingFrames: 0,
  distractedFrames: 0,
  
  // Timing trackers
  wasEyeClosedLastFrame: false,
  eyeCloseStartTimestamp: 0,
  yawnInProgress: false,
  
  // Web Audio Synthesizer
  audioCtx: null,
  alarmOscillator: null,
  alarmLfo: null,
  alarmLfoGain: null,
  alarmGainNode: null,
  isAlarmSounding: false,

  // Session tracking (for Supabase)
  alertCount: 0,
  maxConsecutiveClosedFrames: 0,
  _currentClosedRun: 0
};

// Session recorder instance (initialized after auth)
let sessionRecorder = null;

// Index mappings for MediaPipe Face Mesh
const FACE_LANDMARKS = {
  // Left eye points
  leftEye: {
    corner1: 263, // Outer
    corner2: 362, // Inner
    upper1: 385,
    upper2: 386,
    lower1: 380,
    lower2: 374
  },
  // Right eye points
  rightEye: {
    corner1: 33, // Outer
    corner2: 133, // Inner
    upper1: 159,
    upper2: 158,
    lower1: 145,
    lower2: 153
  },
  // Mouth points
  mouth: {
    leftCorner: 78,
    rightCorner: 308,
    innerTop: 13,
    innerBottom: 14
  },
  // Head orientation points
  head: {
    noseTip: 1,
    chin: 152,
    forehead: 10,
    leftCheek: 50,
    rightCheek: 280
  }
};

// ==========================================================================
// DOM Element Cache
// ==========================================================================

const elements = {
  // Overlay modals
  calibrationOverlay: document.getElementById("calibration-overlay"),
  drowsinessAlarmOverlay: document.getElementById("drowsiness-alarm-overlay"),
  
  // Calibration Wizard steps
  step1View: document.getElementById("step-1-view"),
  step2View: document.getElementById("step-2-view"),
  step1Indicator: document.getElementById("step-1-indicator"),
  step2Indicator: document.getElementById("step-2-indicator"),
  step3Indicator: document.getElementById("step-3-indicator"),
  btnRequestCamera: document.getElementById("btn-request-camera"),
  btnStartCalibration: document.getElementById("btn-start-calibration"),
  calibrationProgress: document.getElementById("calibration-progress"),
  calibrationVideo: document.getElementById("calibration-video"),
  calibrationCanvas: document.getElementById("calibration-canvas"),
  calibrationInstruction: document.getElementById("calibration-instruction"),
  
  // Dashboard Core Elements
  webcamVideo: document.getElementById("webcam-video"),
  meshCanvas: document.getElementById("mesh-canvas"),
  loadingSpinner: document.getElementById("loading-spinner"),
  systemStatusBullet: document.getElementById("system-status-bullet"),
  systemStatusText: document.getElementById("system-status-text"),
  fpsCounter: document.getElementById("fps-counter"),
  hudStatusBadge: document.getElementById("hud-status-badge"),
  hudStatusText: document.getElementById("hud-status-text"),
  hudPulseDot: document.getElementById("hud-pulse-dot"),
  feedCard: document.getElementById("feed-card"),
  
  // Gauge Elements (SVG circular)
  gaugeEarFill: document.getElementById("gauge-ear-fill"),
  gaugeEarValue: document.getElementById("gauge-ear-value"),
  gaugeMarFill: document.getElementById("gauge-mar-fill"),
  gaugeMarValue: document.getElementById("gauge-mar-value"),
  lblEarThresh: document.getElementById("lbl-ear-thresh"),
  lblMarThresh: document.getElementById("lbl-mar-thresh"),
  lblEarState: document.getElementById("lbl-ear-state"),
  lblMarState: document.getElementById("lbl-mar-state"),
  
  // Counter Metrics
  countYawns: document.getElementById("count-yawns"),
  countBlinks: document.getElementById("count-blinks"),
  poseState: document.getElementById("pose-state"),
  
  // Controls
  btnToggleCamera: document.getElementById("btn-toggle-camera"),
  btnRecalibrate: document.getElementById("btn-recalibrate"),
  btnToggleMute: document.getElementById("btn-toggle-mute"),
  btnClearLogs: document.getElementById("btn-clear-logs"),
  logContainer: document.getElementById("log-container"),
  
  // Settings Drawer
  settingsPanel: document.getElementById("settings-panel"),
  btnSettingsToggle: document.getElementById("nav-settings-toggle"),
  btnCloseSettings: document.getElementById("btn-close-settings"),
  btnResetSettings: document.getElementById("btn-reset-settings"),
  
  // Settings inputs
  inputEarThreshold: document.getElementById("input-ear-threshold"),
  valEarThreshold: document.getElementById("val-ear-threshold"),
  inputAlarmDuration: document.getElementById("input-alarm-duration"),
  valAlarmDuration: document.getElementById("val-alarm-duration"),
  inputMarThreshold: document.getElementById("input-mar-threshold"),
  valMarThreshold: document.getElementById("val-mar-threshold"),
  inputAlarmVolume: document.getElementById("input-alarm-volume"),
  valAlarmVolume: document.getElementById("val-alarm-volume"),
  inputVisualAlert: document.getElementById("input-visual-alert"),
  inputDrawMesh: document.getElementById("input-draw-mesh"),
};

// Contexts
let meshCtx = elements.meshCanvas.getContext("2d");
let calCtx = elements.calibrationCanvas.getContext("2d");

// SVG gauge constants
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 50; // r=50

// ==========================================================================
// Sound Alert Synthesizer (Web Audio API)
// ==========================================================================

function initAudio() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function startAlarmAudio() {
  if (state.isMuted || state.isAlarmSounding) return;
  initAudio();
  if (state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }

  try {
    // 1. Oscillator (Carrier Wave) - sawtooth creates a very piercing alert sound
    state.alarmOscillator = state.audioCtx.createOscillator();
    state.alarmOscillator.type = "sawtooth";
    state.alarmOscillator.frequency.setValueAtTime(880, state.audioCtx.currentTime); // 880 Hz

    // 2. LFO (Modulator Wave) - modulates pitch up and down like a siren
    state.alarmLfo = state.audioCtx.createOscillator();
    state.alarmLfo.type = "sine";
    state.alarmLfo.frequency.setValueAtTime(6, state.audioCtx.currentTime); // 6 Hz cycle rate

    state.alarmLfoGain = state.audioCtx.createGain();
    state.alarmLfoGain.gain.setValueAtTime(120, state.audioCtx.currentTime); // Frequency shift range (+/- 120Hz)

    // Connect LFO Modulator to Carrier Frequency
    state.alarmLfo.connect(state.alarmLfoGain);
    state.alarmLfoGain.connect(state.alarmOscillator.frequency);

    // 3. Main Gain Node for Volume & Fading
    state.alarmGainNode = state.audioCtx.createGain();
    state.alarmGainNode.gain.setValueAtTime(0, state.audioCtx.currentTime);
    state.alarmGainNode.gain.linearRampToValueAtTime(state.alarmVolume, state.audioCtx.currentTime + 0.1);

    // Connections
    state.alarmOscillator.connect(state.alarmGainNode);
    state.alarmGainNode.connect(state.audioCtx.destination);

    // Play
    state.alarmOscillator.start();
    state.alarmLfo.start();
    state.isAlarmSounding = true;
  } catch (e) {
    console.error("Audio Synthesis Failed", e);
  }
}

function stopAlarmAudio() {
  if (!state.isAlarmSounding) return;
  try {
    if (state.alarmGainNode && state.audioCtx) {
      state.alarmGainNode.gain.setValueAtTime(state.alarmGainNode.gain.value, state.audioCtx.currentTime);
      state.alarmGainNode.gain.linearRampToValueAtTime(0, state.audioCtx.currentTime + 0.08);
      
      const currentOsc = state.alarmOscillator;
      const currentLfo = state.alarmLfo;
      
      setTimeout(() => {
        try {
          if (currentOsc) currentOsc.stop();
          if (currentLfo) currentLfo.stop();
        } catch (err) {}
      }, 100);
    }
  } catch (e) {
    console.error("Failed to stop Audio synthesis", e);
  }
  state.alarmOscillator = null;
  state.alarmLfo = null;
  state.isAlarmSounding = false;
}

// ==========================================================================
// Log System
// ==========================================================================

function addLog(message, type = "system") {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const logItem = document.createElement("div");
  logItem.className = `log-item ${type}`;
  logItem.innerHTML = `
    <span class="log-time font-mono">${time}</span>
    <span class="log-msg">${message}</span>
  `;
  elements.logContainer.appendChild(logItem);
  elements.logContainer.scrollTop = elements.logContainer.scrollHeight;

  // Prune log list to last 50 items to protect memory
  while (elements.logContainer.children.length > 50) {
    elements.logContainer.removeChild(elements.logContainer.firstChild);
  }
}

// ==========================================================================
// ML Model Loader (MediaPipe FaceLandmarker)
// ==========================================================================

async function initFaceLandmarker() {
  try {
    addLog("Downloading face analytics engine...", "system");
    const vision = await FilesetResolver.forVisionTasks(state.wasmUrl);
    
    state.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: state.modelUrl,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1
    });

    elements.loadingSpinner.classList.add("hidden");
    addLog("AI Landmarker Model loaded successfully.", "system");
    
    // Auto initiate first step
    elements.btnRequestCamera.disabled = false;
  } catch (error) {
    console.error("AI Loader Error", error);
    addLog("Failed loading AI model. Refresh page or check internet connection.", "alarm");
  }
}

// ==========================================================================
// Geometric Algorithm Core (EAR & MAR & Head Pose)
// ==========================================================================

function distance3D(p1, p2) {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow(p1.z - p2.z, 2)
  );
}

function calculateEAR(landmarks) {
  // Left Eye EAR
  const l = FACE_LANDMARKS.leftEye;
  const distL_V1 = distance3D(landmarks[l.upper1], landmarks[l.lower1]);
  const distL_V2 = distance3D(landmarks[l.upper2], landmarks[l.lower2]);
  const distL_H = distance3D(landmarks[l.corner1], landmarks[l.corner2]);
  const leftEAR = (distL_V1 + distL_V2) / (2.0 * distL_H);

  // Right Eye EAR
  const r = FACE_LANDMARKS.rightEye;
  const distR_V1 = distance3D(landmarks[r.upper1], landmarks[r.lower1]);
  const distR_V2 = distance3D(landmarks[r.upper2], landmarks[r.lower2]);
  const distR_H = distance3D(landmarks[r.corner1], landmarks[r.corner2]);
  const rightEAR = (distR_V1 + distR_V2) / (2.0 * distR_H);

  return (leftEAR + rightEAR) / 2.0;
}

function calculateMAR(landmarks) {
  const m = FACE_LANDMARKS.mouth;
  const distV = distance3D(landmarks[m.innerTop], landmarks[m.innerBottom]);
  const distH = distance3D(landmarks[m.leftCorner], landmarks[m.rightCorner]);
  return distV / distH;
}

function estimateHeadPose(landmarks) {
  const h = FACE_LANDMARKS.head;
  const nose = landmarks[h.noseTip];
  const chin = landmarks[h.chin];
  const forehead = landmarks[h.forehead];
  const leftCheek = landmarks[h.leftCheek];
  const rightCheek = landmarks[h.rightCheek];

  // 1. Nodding off detection (Pitch)
  const verticalRange = distance3D(forehead, chin);
  const noseToChin = distance3D(nose, chin);
  const verticalRatio = noseToChin / verticalRange;

  // 2. Looking away detection (Yaw)
  const distLeft = distance3D(leftCheek, nose);
  const distRight = distance3D(rightCheek, nose);
  const yawRatio = distLeft / distRight;

  let pose = "Ahead";
  if (verticalRatio < 0.21) {
    pose = "Nodding Down";
  } else if (yawRatio > 1.95 || yawRatio < 0.52) {
    pose = "Looking Away";
  }

  return { pose, yawRatio, verticalRatio };
}

// ==========================================================================
// Rendering Overlay Facial Mesh Canvas
// ==========================================================================

function drawFacialVisuals(landmarks, canvas, ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (!state.drawMeshPoints) return;

  ctx.strokeStyle = state.currentStatus === "ALARM" 
    ? "rgba(255, 59, 59, 0.45)" 
    : "rgba(0, 255, 136, 0.35)";
  ctx.lineWidth = 1;

  // Draw eye outline loops
  drawConnectionLoop(ctx, landmarks, [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]);
  drawConnectionLoop(ctx, landmarks, [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]);

  // Draw inner lips loop
  drawConnectionLoop(ctx, landmarks, [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]);

  // Highlight active points for EAR & MAR
  ctx.fillStyle = state.currentStatus === "ALARM" ? "#ff3b3b" : "#00ff88";
  const highlightedPoints = [
    FACE_LANDMARKS.leftEye.corner1, FACE_LANDMARKS.leftEye.corner2,
    FACE_LANDMARKS.leftEye.upper1, FACE_LANDMARKS.leftEye.upper2,
    FACE_LANDMARKS.leftEye.lower1, FACE_LANDMARKS.leftEye.lower2,
    FACE_LANDMARKS.rightEye.corner1, FACE_LANDMARKS.rightEye.corner2,
    FACE_LANDMARKS.rightEye.upper1, FACE_LANDMARKS.rightEye.upper2,
    FACE_LANDMARKS.rightEye.lower1, FACE_LANDMARKS.rightEye.lower2,
    FACE_LANDMARKS.mouth.innerTop, FACE_LANDMARKS.mouth.innerBottom,
    FACE_LANDMARKS.mouth.leftCorner, FACE_LANDMARKS.mouth.rightCorner
  ];

  highlightedPoints.forEach(idx => {
    const pt = landmarks[idx];
    ctx.beginPath();
    ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 2, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function drawConnectionLoop(ctx, landmarks, indices) {
  ctx.beginPath();
  const startPt = landmarks[indices[0]];
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.moveTo(startPt.x * width, startPt.y * height);
  for (let i = 1; i < indices.length; i++) {
    const pt = landmarks[indices[i]];
    ctx.lineTo(pt.x * width, pt.y * height);
  }
  ctx.closePath();
  ctx.stroke();
}

// ==========================================================================
// Tracking & Prediction Loop
// ==========================================================================

function updateFPS() {
  const timestamp = performance.now();
  state.frameCount++;
  if (timestamp > state.lastFpsTimestamp + 1000) {
    state.fps = Math.round((state.frameCount * 1000) / (timestamp - state.lastFpsTimestamp));
    elements.fpsCounter.textContent = `FPS: ${state.fps}`;
    state.frameCount = 0;
    state.lastFpsTimestamp = timestamp;
  }
}

async function startDetectionLoop() {
  if (!state.isCameraActive) return;

  const video = elements.webcamVideo;
  if (video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    
    // Fit canvas aspect ratio to video stream
    if (elements.meshCanvas.width !== video.videoWidth) {
      elements.meshCanvas.width = video.videoWidth;
      elements.meshCanvas.height = video.videoHeight;
      state.videoWidth = video.videoWidth;
      state.videoHeight = video.videoHeight;
    }

    if (state.faceLandmarker) {
      const results = state.faceLandmarker.detectForVideo(video, performance.now());
      
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        
        // 1. Process EAR and eye tracking
        const currentEAR = calculateEAR(landmarks);
        state.ear = currentEAR;

        // 2. Process MAR and mouth tracking
        const currentMAR = calculateMAR(landmarks);
        state.mar = currentMAR;

        // 3. Process Head Pose deflection
        const poseResult = estimateHeadPose(landmarks);
        state.pose = poseResult.pose;

        // 4. Update the core decision machine
        processTelemetryMetrics();

        // 5. Render overlays on canvas
        drawFacialVisuals(landmarks, elements.meshCanvas, meshCtx);

        // 6. Feed samples to session recorder
        if (sessionRecorder) {
          sessionRecorder.addSample(currentEAR, currentMAR);
        }
      } else {
        // No faces in frame
        handleNoFaceDetected();
      }
    }
  }

  updateFPS();
  requestAnimationFrame(startDetectionLoop);
}

// ==========================================================================
// State Decision Machine
// ==========================================================================

function processTelemetryMetrics() {
  const now = performance.now();

  // ----- BLINK & MICRO-SLEEP DECISION LOGIC -----
  const isEyeClosed = state.ear < state.earThreshold;

  if (isEyeClosed) {
    state._currentClosedRun++;
    if (state._currentClosedRun > state.maxConsecutiveClosedFrames) {
      state.maxConsecutiveClosedFrames = state._currentClosedRun;
    }

    if (!state.wasEyeClosedLastFrame) {
      state.eyeCloseStartTimestamp = now;
      state.wasEyeClosedLastFrame = true;
    }
    
    const duration = (now - state.eyeCloseStartTimestamp) / 1000.0;
    
    if (duration >= state.alarmDurationSeconds) {
      triggerStatusState("ALARM");
    }
  } else {
    state._currentClosedRun = 0;
    if (state.wasEyeClosedLastFrame) {
      const closureDuration = (now - state.eyeCloseStartTimestamp) / 1000.0;
      state.wasEyeClosedLastFrame = false;
      
      if (closureDuration > 0.05 && closureDuration < 0.38) {
        state.blinkCount++;
        elements.countBlinks.textContent = state.blinkCount;
      }
    }
    
    if (state.pose === "Ahead") {
      triggerStatusState("SAFE");
    }
  }

  // ----- YAWN DETECT MACHINE -----
  if (state.mar > state.marThreshold) {
    if (!state.yawnInProgress) {
      state.yawnFrames++;
      if (state.yawnFrames > 35) {
        state.yawnInProgress = true;
        state.yawnCount++;
        elements.countYawns.textContent = state.yawnCount;
        addLog("Driver yawn detected. Alertness level decreasing.", "warning");
      }
    }
  } else {
    state.yawnFrames = 0;
    state.yawnInProgress = false;
  }

  // ----- HEAD POSE / DISTRACTION MACHINE -----
  if (state.pose === "Nodding Down") {
    state.noddingFrames++;
    if (state.noddingFrames > 25) {
      triggerStatusState("ALARM");
    }
  } else if (state.pose === "Looking Away") {
    state.distractedFrames++;
    state.noddingFrames = 0;
    if (state.distractedFrames > 45) {
      triggerStatusState("DISTRACTED");
    }
  } else {
    state.noddingFrames = 0;
    state.distractedFrames = 0;
    if (!isEyeClosed) {
      triggerStatusState("SAFE");
    }
  }

  // ----- UPDATE DASHBOARD HUDS & GAUGES -----
  updateDashboardHUDs();
}

function handleNoFaceDetected() {
  meshCtx.clearRect(0, 0, elements.meshCanvas.width, elements.meshCanvas.height);
  state.pose = "No Face";
  elements.poseState.textContent = "No Face";
  triggerStatusState("SAFE");
  
  elements.gaugeEarValue.textContent = "--";
  elements.gaugeMarValue.textContent = "--";
  setGaugeFill(elements.gaugeEarFill, 0);
  setGaugeFill(elements.gaugeMarFill, 0);
}

function triggerStatusState(newStatus) {
  if (state.currentStatus === newStatus) return;

  const oldStatus = state.currentStatus;
  state.currentStatus = newStatus;

  if (newStatus === "ALARM") {
    state.alertCount++;
    addLog("CRITICAL: Drowsiness Alert triggered! Active micro-sleep.", "alarm");
    
    elements.feedCard.classList.add("alarm-active");
    elements.systemStatusBullet.className = "pulse-dot danger";
    elements.systemStatusText.textContent = "ALARM: Drowsy Driver";
    
    elements.hudStatusBadge.className = "status-badge status-danger";
    elements.hudPulseDot.className = "pulse-dot danger";
    elements.hudStatusText.textContent = "SLEEP WARNING";

    startAlarmAudio();

    if (state.enableVisualAlert) {
      elements.drowsinessAlarmOverlay.classList.remove("hidden");
    }
  } 
  else if (newStatus === "DISTRACTED") {
    addLog("WARNING: Driver distracted — please focus on the road.", "warning");
    elements.feedCard.classList.remove("alarm-active");
    elements.systemStatusBullet.className = "pulse-dot warning";
    elements.systemStatusText.textContent = "System Alert";
    
    elements.hudStatusBadge.className = "status-badge status-warning";
    elements.hudPulseDot.className = "pulse-dot warning";
    elements.hudStatusText.textContent = "DISTRACTED";
    
    stopAlarmAudio();
    elements.drowsinessAlarmOverlay.classList.add("hidden");
  } 
  else if (newStatus === "SAFE") {
    if (oldStatus === "ALARM") {
      addLog("System cleared. Driver alertness restored.", "system");
    }
    
    elements.feedCard.classList.remove("alarm-active");
    elements.systemStatusBullet.className = "pulse-dot safe";
    elements.systemStatusText.textContent = "System Active";
    
    elements.hudStatusBadge.className = "status-badge status-safe";
    elements.hudPulseDot.className = "pulse-dot safe";
    elements.hudStatusText.textContent = "ACTIVE & SAFE";

    stopAlarmAudio();
    elements.drowsinessAlarmOverlay.classList.add("hidden");
  }
}

// ==========================================================================
// SVG Gauge Helpers
// ==========================================================================

function setGaugeFill(el, percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  const dashLen = (clamped / 100) * GAUGE_CIRCUMFERENCE;
  el.setAttribute("stroke-dasharray", `${dashLen} ${GAUGE_CIRCUMFERENCE}`);
}

function updateDashboardHUDs() {
  // Update EAR Gauge
  elements.gaugeEarValue.textContent = state.ear.toFixed(2);
  const earPercent = Math.min(100, Math.max(0, (state.ear / 0.45) * 100));
  setGaugeFill(elements.gaugeEarFill, earPercent);

  if (state.ear < state.earThreshold) {
    elements.lblEarState.textContent = "CLOSED";
    elements.lblEarState.className = "status-badge status-danger";
    elements.gaugeEarFill.classList.add("danger");
    elements.gaugeEarFill.classList.remove("warning");
  } else {
    elements.lblEarState.textContent = "OPEN";
    elements.lblEarState.className = "status-badge status-safe";
    elements.gaugeEarFill.classList.remove("danger", "warning");
  }

  // Update MAR Gauge
  elements.gaugeMarValue.textContent = state.mar.toFixed(2);
  const marPercent = Math.min(100, Math.max(0, (state.mar / 0.8) * 100));
  setGaugeFill(elements.gaugeMarFill, marPercent);

  if (state.mar > state.marThreshold) {
    elements.lblMarState.textContent = "YAWNING";
    elements.lblMarState.className = "status-badge status-warning";
    elements.gaugeMarFill.classList.add("warning");
    elements.gaugeMarFill.classList.remove("danger");
  } else {
    elements.lblMarState.textContent = "CLOSED";
    elements.lblMarState.className = "status-badge status-safe";
    elements.gaugeMarFill.classList.remove("danger", "warning");
  }

  // Update Head Pose Text
  elements.poseState.textContent = state.pose;
  if (state.pose === "Nodding Down") {
    elements.poseState.style.color = "var(--danger)";
  } else if (state.pose === "Looking Away") {
    elements.poseState.style.color = "var(--warning)";
  } else {
    elements.poseState.style.color = "";
  }
}

// ==========================================================================
// Webcam Media Streaming Helpers
// ==========================================================================

async function requestCameraStream(videoElement) {
  try {
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      },
      audio: false
    };

    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = state.stream;
    
    return new Promise(resolve => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        resolve(true);
      };
    });
  } catch (err) {
    console.error("Camera Grab Failed", err);
    addLog("Camera access rejected. Drowsiness monitoring offline.", "alarm");
    alert("Camera permission denied. Please allow camera access in your browser settings to run this system.");
    return false;
  }
}

// ==========================================================================
// Interactive Wizard Flow & Calibration
// ==========================================================================

let calibrationFrameCount = 0;
let calibrationEarSum = 0;
let isCalibrating = false;

async function startCalibrationFlow() {
  const active = await requestCameraStream(elements.calibrationVideo);
  if (!active) return;

  elements.calibrationVideo.width = 320;
  elements.calibrationVideo.height = 240;
  elements.calibrationCanvas.width = 320;
  elements.calibrationCanvas.height = 240;

  elements.step1View.classList.add("hidden");
  elements.step2View.classList.remove("hidden");
  elements.step1Indicator.classList.remove("active");
  elements.step2Indicator.classList.add("active");

  runCalibrationCanvasLoop();
}

function runCalibrationCanvasLoop() {
  if (elements.step2View.classList.contains("hidden")) return;

  const video = elements.calibrationVideo;
  
  if (video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    
    if (state.faceLandmarker) {
      const results = state.faceLandmarker.detectForVideo(video, performance.now());
      calCtx.clearRect(0, 0, 320, 240);
      
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        
        drawFacialVisuals(landmarks, elements.calibrationCanvas, calCtx);
        elements.btnStartCalibration.style.display = "block";

        if (isCalibrating) {
          const currentEAR = calculateEAR(landmarks);
          calibrationEarSum += currentEAR;
          calibrationFrameCount++;

          const percent = Math.min(100, Math.round((calibrationFrameCount / 90) * 100));
          elements.calibrationProgress.style.width = `${percent}%`;
          elements.calibrationProgress.textContent = `${percent}%`;

          if (calibrationFrameCount >= 90) {
            isCalibrating = false;
            state.calibratedOpenEAR = calibrationEarSum / calibrationFrameCount;
            
            state.earThreshold = state.calibratedOpenEAR * 0.70;
            state.earThreshold = Math.min(0.30, Math.max(0.15, state.earThreshold));
            elements.inputEarThreshold.value = state.earThreshold.toFixed(2);
            elements.valEarThreshold.textContent = state.earThreshold.toFixed(2);
            elements.lblEarThresh.textContent = state.earThreshold.toFixed(2);

            finishCalibrationFlow();
            return;
          }
        }
      } else {
        elements.btnStartCalibration.style.display = "none";
        calCtx.fillStyle = "rgba(255, 59, 59, 0.8)";
        calCtx.font = "12px 'Space Grotesk'";
        calCtx.fillText("Align Face in Center", 95, 20);
      }
    }
  }

  requestAnimationFrame(runCalibrationCanvasLoop);
}

function runCalibration() {
  calibrationFrameCount = 0;
  calibrationEarSum = 0;
  isCalibrating = true;
  elements.btnStartCalibration.disabled = true;
  elements.calibrationInstruction.textContent = "Keep eyes open and look directly at camera. Calibrating...";
}

async function finishCalibrationFlow() {
  elements.step2Indicator.classList.remove("active");
  elements.step3Indicator.classList.add("active");
  addLog(`User calibrated open-eyes average EAR: ${state.calibratedOpenEAR.toFixed(2)}`, "system");
  addLog(`Adaptive threshold computed: ${state.earThreshold.toFixed(2)}`, "system");

  if (elements.calibrationVideo.srcObject) {
    elements.calibrationVideo.srcObject.getTracks().forEach(t => t.stop());
  }

  elements.calibrationOverlay.style.opacity = 0;
  elements.calibrationOverlay.style.transition = "opacity 0.5s ease";
  setTimeout(() => {
    elements.calibrationOverlay.classList.add("hidden");
    startWebcamMonitoring();
  }, 500);
}

async function startWebcamMonitoring() {
  elements.webcamVideo.classList.remove("hidden");
  
  const active = await requestCameraStream(elements.webcamVideo);
  if (!active) return;

  state.isCameraActive = true;
  addLog("Monitoring stream initiated.", "system");

  // Start session recording
  const userId = getUserId();
  if (userId) {
    sessionRecorder = new SessionRecorder(userId, state);
    await sessionRecorder.start();
  }

  // Launch main processing frame loop
  startDetectionLoop();
}

// ==========================================================================
// Settings Page Binder
// ==========================================================================

function loadSettingsHandlers() {
  elements.btnSettingsToggle.addEventListener("click", (e) => {
    e.preventDefault();
    elements.settingsPanel.classList.toggle("hidden");
  });

  elements.btnCloseSettings.addEventListener("click", () => {
    elements.settingsPanel.classList.add("hidden");
  });

  // Slide Range inputs updates
  elements.inputEarThreshold.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    state.earThreshold = val;
    elements.valEarThreshold.textContent = val.toFixed(2);
    elements.lblEarThresh.textContent = val.toFixed(2);
  });

  elements.inputAlarmDuration.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    state.alarmDurationSeconds = val;
    elements.valAlarmDuration.textContent = `${val.toFixed(1)}s`;
  });

  elements.inputMarThreshold.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    state.marThreshold = val;
    elements.valMarThreshold.textContent = val.toFixed(2);
    elements.lblMarThresh.textContent = val.toFixed(2);
  });

  elements.inputAlarmVolume.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    state.alarmVolume = val;
    elements.valAlarmVolume.textContent = `${Math.round(val * 100)}%`;
  });

  // Toggles
  elements.inputVisualAlert.addEventListener("change", (e) => {
    state.enableVisualAlert = e.target.checked;
  });

  elements.inputDrawMesh.addEventListener("change", (e) => {
    state.drawMeshPoints = e.target.checked;
  });

  elements.btnResetSettings.addEventListener("click", () => {
    state.earThreshold = 0.22;
    state.alarmDurationSeconds = 1.5;
    state.marThreshold = 0.55;
    state.alarmVolume = 0.70;
    state.enableVisualAlert = true;
    state.drawMeshPoints = true;

    elements.inputEarThreshold.value = 0.22;
    elements.valEarThreshold.textContent = "0.22";
    elements.lblEarThresh.textContent = "0.22";
    elements.inputAlarmDuration.value = 1.5;
    elements.valAlarmDuration.textContent = "1.5s";
    elements.inputMarThreshold.value = 0.55;
    elements.valMarThreshold.textContent = "0.55";
    elements.lblMarThresh.textContent = "0.55";
    elements.inputAlarmVolume.value = 0.70;
    elements.valAlarmVolume.textContent = "70%";
    elements.inputVisualAlert.checked = true;
    elements.inputDrawMesh.checked = true;

    addLog("Settings reset to system safety defaults.", "system");
  });
}

// ==========================================================================
// Dashboard Buttons Bindings
// ==========================================================================

function initDashboardControls() {
  // Toggle camera button
  elements.btnToggleCamera.addEventListener("click", async () => {
    if (state.isCameraActive) {
      if (state.stream) {
        state.stream.getTracks().forEach(t => t.stop());
      }
      state.isCameraActive = false;
      elements.webcamVideo.classList.add("hidden");
      addLog("Driver tracking video feed paused.", "warning");
      triggerStatusState("SAFE");
      handleNoFaceDetected();

      // Stop session recording
      if (sessionRecorder) {
        await sessionRecorder.stop();
        sessionRecorder = null;
      }
    } else {
      startWebcamMonitoring();
    }
  });

  // Mute warning button
  elements.btnToggleMute.addEventListener("click", () => {
    state.isMuted = !state.isMuted;
    const muteBtn = elements.btnToggleMute;
    if (state.isMuted) {
      muteBtn.innerHTML = icon('mute', 18);
      addLog("System alarms muted.", "warning");
      stopAlarmAudio();
    } else {
      muteBtn.innerHTML = icon('volume', 18);
      addLog("System alarms unmuted.", "system");
    }
  });

  // Manual Recalibrate Button
  elements.btnRecalibrate.addEventListener("click", () => {
    elements.calibrationOverlay.style.opacity = 1;
    elements.calibrationOverlay.classList.remove("hidden");
    
    elements.step1View.classList.remove("hidden");
    elements.step2View.classList.add("hidden");
    elements.step1Indicator.classList.add("active");
    elements.step2Indicator.classList.remove("active");
    elements.step3Indicator.classList.remove("active");
    
    elements.calibrationProgress.style.width = "0%";
    elements.calibrationProgress.textContent = "0%";
    elements.btnStartCalibration.disabled = false;
    elements.calibrationInstruction.textContent = "Position your face in the frame and look straight ahead with open eyes.";
    
    addLog("Initiating driver profile recalibration...", "system");
  });

  // Clear Event Logs
  elements.btnClearLogs.addEventListener("click", () => {
    elements.logContainer.innerHTML = "";
    addLog("System logs cleared.", "system");
  });
}

// ==========================================================================
// Initialization Orchestrator
// ==========================================================================

window.addEventListener("DOMContentLoaded", async () => {
  // Initialize theme
  initTheme('btn-theme-toggle');

  // Load Clerk auth in background — NEVER block the dashboard
  (async () => {
    try {
      const clerk = await initClerk();
      if (!clerk) {
        console.warn('[Aegis] No Clerk keys — auth disabled');
        return;
      }

      const signInBtn = document.getElementById('btn-sign-in');
      const userBtnEl = document.getElementById('clerk-user-btn');

      if (clerk.user) {
        // User is signed in — mount avatar and start session recording
        if (userBtnEl) mountUserButton(userBtnEl);
        if (signInBtn) signInBtn.style.display = 'none';

        // Start session recording with Supabase
        const userId = getUserId();
        if (userId) {
          const recorder = new SessionRecorder(userId, state);
          window.__aegisRecorder = recorder;
          await recorder.start();
        }
      } else {
        // User not signed in — show sign-in button
        if (signInBtn) {
          signInBtn.style.display = 'flex';
          signInBtn.addEventListener('click', () => {
            clerk.redirectToSignIn({
              redirectUrl: window.location.href
            });
          });
        }
      }
    } catch (err) {
      console.warn('[Aegis] Clerk auth failed (non-blocking):', err);
    }
  })();

  // Pre-load MediaPipe Model — runs immediately, not blocked by auth
  initFaceLandmarker();
  
  // Set default button disabled until loaded
  elements.btnRequestCamera.disabled = true;

  // Bind interface drawers & sliders
  loadSettingsHandlers();

  // SPA Navigation
  const navDashboard = document.getElementById('nav-dashboard');
  const navHistory = document.getElementById('nav-history');
  const viewDashboard = document.querySelector('.dashboard-grid');
  const viewHistory = document.getElementById('history-panel');

  navDashboard.addEventListener('click', () => {
    navDashboard.classList.add('active');
    navHistory.classList.remove('active');
    viewDashboard.style.display = 'grid';
    viewHistory.style.display = 'none';
  });

  navHistory.addEventListener('click', async () => {
    navHistory.classList.add('active');
    navDashboard.classList.remove('active');
    viewDashboard.style.display = 'none';
    viewHistory.style.display = 'block';
    
    // Load history data if we have a user
    const userId = getUserId();
    if (userId) {
      try {
        const { getUserStats, getUserSessions } = await import('./lib/supabase.js');
        const stats = await getUserStats(userId);
        const sessions = await getUserSessions(userId);
        
        // Update stats
        document.getElementById('stat-total-sessions').textContent = stats.totalSessions;
        document.getElementById('stat-drive-time').textContent = (stats.totalMinutes / 60).toFixed(1) + 'h';
        document.getElementById('stat-total-alerts').textContent = stats.totalAlerts;
        document.getElementById('stat-avg-ear').textContent = stats.avgEar.toFixed(2);
        
        // Render table
        const tbody = document.getElementById('sessions-table-body');
        if (sessions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="padding: 2rem 0; text-align: center; color: var(--text-muted);">No sessions recorded yet. Start monitoring to see your history.</td></tr>';
        } else {
          tbody.innerHTML = sessions.map(s => {
            const date = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const duration = `${(s.duration_minutes || 0).toFixed(1)} min`;
            const status = (s.alert_count || 0) > 3 ? 'Risky' : (s.alert_count || 0) > 0 ? 'Caution' : 'Safe';
            const statusClass = status === 'Risky' ? 'status-danger' : status === 'Caution' ? 'status-warning' : 'status-safe';
            return `<tr>
              <td style="padding: 0.75rem 0;">${date}</td>
              <td class="font-mono">${duration}</td>
              <td class="font-mono">${s.alert_count || 0}</td>
              <td class="font-mono">${s.yawn_count || 0}</td>
              <td class="font-mono">${(s.avg_ear || 0).toFixed(2)}</td>
              <td><span class="status-badge ${statusClass}">${status}</span></td>
            </tr>`;
          }).join('');
        }
        
        // Try rendering charts
        try {
          const { Chart, registerables } = await import('chart.js');
          Chart.register(...registerables);
          
          // Basic chart logic (re-using canvas requires destroying old ones or simpler just don't re-render if it exists)
          // For now just keep it simple, the table covers the basics.
        } catch(e) {}
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    }
  });

  // Bind controls
  initDashboardControls();

  // Bind Calibration wizard triggers
  elements.btnRequestCamera.addEventListener("click", startCalibrationFlow);
  elements.btnStartCalibration.addEventListener("click", runCalibration);
});
