import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

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
  isAlarmSounding: false
};

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
  feedCard: document.querySelector(".feed-card"),
  
  // Metrics Values
  valEar: document.getElementById("val-ear"),
  valMar: document.getElementById("val-mar"),
  fillEar: document.getElementById("fill-ear"),
  fillMar: document.getElementById("fill-mar"),
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
  btnDashboardNav: document.getElementById("nav-dashboard"),
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
  btnThemeToggle: document.getElementById("btn-theme-toggle"),
  themeToggleIcon: document.getElementById("theme-toggle-icon")
};

// Contexts
let meshCtx = elements.meshCanvas.getContext("2d");
let calCtx = elements.calibrationCanvas.getContext("2d");

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
    <span class="log-time">${time}</span>
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
  // Distance from nose to chin normalized by forehead-to-chin length
  const verticalRange = distance3D(forehead, chin);
  const noseToChin = distance3D(nose, chin);
  const verticalRatio = noseToChin / verticalRange;

  // 2. Looking away detection (Yaw)
  // Ratio of left cheek to nose distance vs right cheek to nose distance
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
    ? "rgba(239, 68, 68, 0.45)" 
    : "rgba(59, 130, 246, 0.35)";
  ctx.lineWidth = 1;

  // Draw eye outline loops
  drawConnectionLoop(ctx, landmarks, [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]);
  drawConnectionLoop(ctx, landmarks, [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]);

  // Draw inner lips loop
  drawConnectionLoop(ctx, landmarks, [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]);

  // Highlight active points for EAR & MAR in a bright neon glowing shade
  ctx.fillStyle = state.currentStatus === "ALARM" ? "#ef4444" : "#10b981";
  const highlightedPoints = [
    // Left eye EAR points
    FACE_LANDMARKS.leftEye.corner1, FACE_LANDMARKS.leftEye.corner2,
    FACE_LANDMARKS.leftEye.upper1, FACE_LANDMARKS.leftEye.upper2,
    FACE_LANDMARKS.leftEye.lower1, FACE_LANDMARKS.leftEye.lower2,
    // Right eye EAR points
    FACE_LANDMARKS.rightEye.corner1, FACE_LANDMARKS.rightEye.corner2,
    FACE_LANDMARKS.rightEye.upper1, FACE_LANDMARKS.rightEye.upper2,
    FACE_LANDMARKS.rightEye.lower1, FACE_LANDMARKS.rightEye.lower2,
    // Mouth points
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
    if (!state.wasEyeClosedLastFrame) {
      // First frame eye closure
      state.eyeCloseStartTimestamp = now;
      state.wasEyeClosedLastFrame = true;
    }
    
    const duration = (now - state.eyeCloseStartTimestamp) / 1000.0;
    
    // Check if micro-sleep threshold reached
    if (duration >= state.alarmDurationSeconds) {
      triggerStatusState("ALARM");
    }
  } else {
    if (state.wasEyeClosedLastFrame) {
      // Eyes reopened! Measure how long they were closed
      const closureDuration = (now - state.eyeCloseStartTimestamp) / 1000.0;
      state.wasEyeClosedLastFrame = false;
      
      // A quick closure (<350ms) counts as a healthy blink
      if (closureDuration > 0.05 && closureDuration < 0.38) {
        state.blinkCount++;
        elements.countBlinks.textContent = state.blinkCount;
      }
    }
    
    // Reset closed frame alarm counter if status isn't forced by distraction
    if (state.pose === "Ahead") {
      triggerStatusState("SAFE");
    }
  }

  // ----- YAWN DETECT MACHINE -----
  if (state.mar > state.marThreshold) {
    if (!state.yawnInProgress) {
      state.yawnFrames++;
      // Wait for a few consecutive frames to avoid flash false alarms
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
    if (state.noddingFrames > 25) { // Nodded for ~0.8s
      triggerStatusState("ALARM");
    }
  } else if (state.pose === "Looking Away") {
    state.distractedFrames++;
    state.noddingFrames = 0;
    if (state.distractedFrames > 45) { // Distracted for ~1.5s
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
  triggerStatusState("SAFE"); // Reset alarm temporarily
  
  // Set UI displays to empty tracking
  elements.valEar.textContent = "--";
  elements.valMar.textContent = "--";
  elements.fillEar.style.width = "0%";
  elements.fillMar.style.width = "0%";
}

function triggerStatusState(newStatus) {
  if (state.currentStatus === newStatus) return;

  const oldStatus = state.currentStatus;
  state.currentStatus = newStatus;

  // Handle Alarm activations
  if (newStatus === "ALARM") {
    addLog("CRITICAL: Drowsiness Alert triggered! Active micro-sleep.", "alarm");
    
    // Activate HUD warning classes
    elements.feedCard.classList.add("alarm-active");
    elements.systemStatusBullet.className = "status-bullet alarm";
    elements.systemStatusText.textContent = "ALARM: Drowsy Driver";
    
    // Status Badge HUD update
    elements.hudStatusBadge.className = "alert-status alarm";
    elements.hudStatusText.textContent = "STATUS: SLEEP WARNING";

    // Start loud tone synth
    startAlarmAudio();

    // Flash Screen Overlay
    if (state.enableVisualAlert) {
      elements.drowsinessAlarmOverlay.classList.remove("hidden");
    }
  } 
  
  // Handle Distractions
  else if (newStatus === "DISTRACTED") {
    addLog("WARNING: Driver distracted - please focus on the road.", "warning");
    elements.feedCard.classList.remove("alarm-active");
    elements.systemStatusBullet.className = "status-bullet warning";
    elements.systemStatusText.textContent = "System Alert";
    
    elements.hudStatusBadge.className = "alert-status warning";
    elements.hudStatusText.textContent = "STATUS: DISTRACTED";
    
    stopAlarmAudio();
    elements.drowsinessAlarmOverlay.classList.add("hidden");
  } 
  
  // Back to Safe
  else if (newStatus === "SAFE") {
    if (oldStatus === "ALARM") {
      addLog("System cleared. Driver alertness restored.", "system");
    }
    
    elements.feedCard.classList.remove("alarm-active");
    elements.systemStatusBullet.className = "status-bullet";
    elements.systemStatusText.textContent = "System Active";
    
    elements.hudStatusBadge.className = "alert-status safe";
    elements.hudStatusText.textContent = "STATUS: ACTIVE & SAFE";

    stopAlarmAudio();
    elements.drowsinessAlarmOverlay.classList.add("hidden");
  }
}

function updateDashboardHUDs() {
  // Update EAR Display
  elements.valEar.textContent = state.ear.toFixed(2);
  const earPercent = Math.min(100, Math.max(0, (state.ear / 0.45) * 100));
  elements.fillEar.style.width = `${earPercent}%`;

  if (state.ear < state.earThreshold) {
    elements.lblEarState.textContent = "CLOSED";
    elements.lblEarState.className = "state-badge alarm";
    elements.fillEar.style.background = "var(--color-alarm)";
  } else {
    elements.lblEarState.textContent = "OPEN";
    elements.lblEarState.className = "state-badge safe";
    elements.fillEar.style.background = "linear-gradient(90deg, var(--color-primary) 0%, #60a5fa 100%)";
  }

  // Update MAR Display
  elements.valMar.textContent = state.mar.toFixed(2);
  const marPercent = Math.min(100, Math.max(0, (state.mar / 0.8) * 100));
  elements.fillMar.style.width = `${marPercent}%`;

  if (state.mar > state.marThreshold) {
    elements.lblMarState.textContent = "YAWNING";
    elements.lblMarState.className = "state-badge warning";
    elements.fillMar.style.background = "var(--color-warning)";
  } else {
    elements.lblMarState.textContent = "CLOSED";
    elements.lblMarState.className = "state-badge safe";
    elements.fillMar.style.background = "linear-gradient(90deg, var(--color-primary) 0%, #60a5fa 100%)";
  }

  // Update Head Pose Text
  elements.poseState.textContent = state.pose;
  if (state.pose === "Ahead") {
    elements.poseState.className = "stat-number text-sm";
  } else if (state.pose === "Nodding Down") {
    elements.poseState.className = "stat-number text-sm text-red-400";
    elements.poseState.style.color = "var(--color-alarm)";
  } else {
    elements.poseState.className = "stat-number text-sm text-yellow-400";
    elements.poseState.style.color = "var(--color-warning)";
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
    
    // Play video stream
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
  // Turn on preview stream in calibration window
  const active = await requestCameraStream(elements.calibrationVideo);
  if (!active) return;

  elements.calibrationVideo.width = 320;
  elements.calibrationVideo.height = 240;
  elements.calibrationCanvas.width = 320;
  elements.calibrationCanvas.height = 240;

  // Move to step 2 indicator
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
        
        // Show active mesh guidelines inside calibration window
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
            // Completed 3-seconds calibration (at ~30fps)
            isCalibrating = false;
            state.calibratedOpenEAR = calibrationEarSum / calibrationFrameCount;
            
            // Set dynamic EAR threshold to 70% of open eyes average
            state.earThreshold = state.calibratedOpenEAR * 0.70;
            
            // Sync settings sliders
            state.earThreshold = Math.min(0.30, Math.max(0.15, state.earThreshold));
            elements.inputEarThreshold.value = state.earThreshold.toFixed(2);
            elements.valEarThreshold.textContent = state.earThreshold.toFixed(2);
            elements.lblEarThresh.textContent = state.earThreshold.toFixed(2);

            finishCalibrationFlow();
            return;
          }
        }
      } else {
        // Guide them to reposition
        elements.btnStartCalibration.style.display = "none";
        calCtx.fillStyle = "rgba(239, 68, 68, 0.8)";
        calCtx.font = "12px Space Grotesk";
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
  // Step 3 UI indicator
  elements.step2Indicator.classList.remove("active");
  elements.step3Indicator.classList.add("active");
  addLog(`User calibrated open-eyes average EAR: ${state.calibratedOpenEAR.toFixed(2)}`, "system");
  addLog(`Adaptive threshold computed: ${state.earThreshold.toFixed(2)}`, "system");

  // Release calibration video track
  if (elements.calibrationVideo.srcObject) {
    elements.calibrationVideo.srcObject.getTracks().forEach(t => t.stop());
  }

  // Fade welcome overlay out
  elements.calibrationOverlay.style.opacity = 0;
  elements.calibrationOverlay.style.transition = "opacity 0.5s ease";
  setTimeout(() => {
    elements.calibrationOverlay.classList.add("hidden");
    startWebcamMonitoring();
  }, 500);
}

async function startWebcamMonitoring() {
  elements.webcamVideo.classList.remove("hidden");
  
  // Stream camera into dashboard element
  const active = await requestCameraStream(elements.webcamVideo);
  if (!active) return;

  state.isCameraActive = true;
  addLog("Monitoring stream initiated.", "system");

  // Launch main processing frame loop
  startDetectionLoop();
}

// ==========================================================================
// Settings Page Binder
// ==========================================================================

function loadSettingsHandlers() {
  // Navigation sidebar items
  elements.btnSettingsToggle.addEventListener("click", (e) => {
    e.preventDefault();
    elements.settingsPanel.classList.remove("hidden");
    elements.btnSettingsToggle.classList.add("active");
    elements.btnDashboardNav.classList.remove("active");
  });

  elements.btnDashboardNav.addEventListener("click", (e) => {
    e.preventDefault();
    elements.settingsPanel.classList.add("hidden");
    elements.btnSettingsToggle.classList.remove("active");
    elements.btnDashboardNav.classList.add("active");
  });

  elements.btnCloseSettings.addEventListener("click", () => {
    elements.settingsPanel.classList.add("hidden");
    elements.btnSettingsToggle.classList.remove("active");
    elements.btnDashboardNav.classList.add("active");
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
    // Restore default configurations
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
  elements.btnToggleCamera.addEventListener("click", () => {
    if (state.isCameraActive) {
      // Stop streaming
      if (state.stream) {
        state.stream.getTracks().forEach(t => t.stop());
      }
      state.isCameraActive = false;
      elements.webcamVideo.classList.add("hidden");
      elements.btnToggleCamera.textContent = "📹 (Off)";
      elements.btnToggleCamera.classList.add("btn-secondary");
      addLog("Driver tracking video feed paused.", "warning");
      triggerStatusState("SAFE");
      handleNoFaceDetected();
    } else {
      elements.btnToggleCamera.textContent = "📹";
      elements.btnToggleCamera.classList.remove("btn-secondary");
      startWebcamMonitoring();
    }
  });

  // Mute warning button
  elements.btnToggleMute.addEventListener("click", () => {
    state.isMuted = !state.isMuted;
    if (state.isMuted) {
      elements.btnToggleMute.textContent = "🔇";
      elements.btnToggleMute.classList.add("btn-secondary");
      addLog("System alarms muted.", "warning");
      stopAlarmAudio();
    } else {
      elements.btnToggleMute.textContent = "🔊";
      elements.btnToggleMute.classList.remove("btn-secondary");
      addLog("System alarms unmuted.", "system");
    }
  });

  // Manual Recalibrate Button
  elements.btnRecalibrate.addEventListener("click", () => {
    elements.calibrationOverlay.style.opacity = 1;
    elements.calibrationOverlay.classList.remove("hidden");
    
    // Go to camera grant step
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
// Theme Settings Manager (Light/Dark Toggle)
// ==========================================================================

function initThemeToggle() {
  const savedTheme = localStorage.getItem("theme");
  
  // Default to dark theme if not saved
  if (savedTheme === "light") {
    document.body.classList.add("light-theme");
    if (elements.themeToggleIcon) {
      elements.themeToggleIcon.textContent = "🌙";
    }
  } else {
    document.body.classList.remove("light-theme");
    if (elements.themeToggleIcon) {
      elements.themeToggleIcon.textContent = "☀️";
    }
  }

  if (elements.btnThemeToggle) {
    elements.btnThemeToggle.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-theme");
      if (isLight) {
        localStorage.setItem("theme", "light");
        if (elements.themeToggleIcon) {
          elements.themeToggleIcon.textContent = "🌙";
        }
        addLog("Interface switched to Light Mode.", "system");
      } else {
        localStorage.setItem("theme", "dark");
        if (elements.themeToggleIcon) {
          elements.themeToggleIcon.textContent = "☀️";
        }
        addLog("Interface switched to Dark Mode.", "system");
      }
    });
  }
}

// ==========================================================================
// Initialization Orchestrator
// ==========================================================================

window.addEventListener("DOMContentLoaded", () => {
  // Initialize theme first to avoid flash of dark mode
  initThemeToggle();

  // Pre-load MediaPipe Model
  initFaceLandmarker();
  
  // Set default button disabled until loaded
  elements.btnRequestCamera.disabled = true;

  // Bind interface drawers & sliders
  loadSettingsHandlers();

  // Bind controls
  initDashboardControls();

  // Bind Calibration wizard triggers
  elements.btnRequestCamera.addEventListener("click", startCalibrationFlow);
  elements.btnStartCalibration.addEventListener("click", runCalibration);
});
