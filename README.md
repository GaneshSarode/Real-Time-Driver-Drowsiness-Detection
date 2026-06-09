<div align="center">
  <h1>Aegis Drive</h1>
  <p><strong>AI-Powered Driver Safety System</strong></p>

  [![Live Demo](https://img.shields.io/badge/Demo-Live_Deployment-00ff88?style=for-the-badge&logo=vercel)](https://aegis-drive.vercel.app)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
  [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
  [![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)

  <p>On-device, real-time driver drowsiness detection built for low-latency browser inference.</p>
</div>

## Features

- **Real-time eye tracking:** Monitors Eye Aspect Ratio (EAR) to detect extended eye closure and micro-sleep risk.
- **Yawn detection:** Uses Mouth Aspect Ratio (MAR) to identify fatigue patterns.
- **Head pose estimation:** Tracks orientation changes to detect nodding down and looking away.
- **Instant audio-visual alerts:** Uses Web Audio synthesis and visual warnings when drowsiness is detected.
- **Personal calibration:** Captures a short driver-specific baseline before monitoring begins.
- **Adjustable thresholds:** Exposes EAR, MAR, alarm duration, alarm volume, visual alert, and mesh rendering controls.
- **Session history:** Saves and reviews authenticated driving sessions with Supabase-backed metrics.
- **On-device processing:** Runs MediaPipe FaceLandmarker in the browser without sending camera frames to a backend.

## Tech Stack

| Technology | Role |
| :--- | :--- |
| MediaPipe FaceLandmarker | Facial landmark detection |
| Vite | Frontend build tooling |
| Vanilla JavaScript | Application logic and detection loop |
| Vanilla CSS | Dashboard, landing page, and design system |
| Clerk | Optional authentication |
| Supabase | Optional session storage and history |
| Chart.js | History visualizations |
| Vercel | Deployment |

## How It Works

1. **Calibrate:** The app captures a short baseline of the driver's open-eye EAR.
2. **Monitor:** MediaPipe detects facial landmarks from the webcam stream in real time.
3. **Analyze:** EAR, MAR, and head pose rules classify safe, distracted, no-face, and alarm states.
4. **Alert:** The dashboard triggers visual and audio warnings when drowsiness risk is detected.
5. **Review:** Signed-in users can review session metrics and history charts.

## Quick Start

```bash
git clone https://github.com/GaneshSarode/Real-Time-Driver-Drowsiness-Detection.git
cd Real-Time-Driver-Drowsiness-Detection
npm install
npm run dev
```

## Environment Variables

Create a `.env` file when you want authentication and cloud history features:

```bash
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The dashboard still runs without these values; authentication and database history are disabled in that mode.

## Research Inspiration

Aegis Drive implements geometric facial landmark techniques commonly used in driver drowsiness systems, especially EAR and MAR calculations. The project also references:

> Hassan et al., "Real-time driver drowsiness detection using transformer architectures"  
> Scientific Reports, 2025  
> https://doi.org/10.1038/s41598-025-02111-x

## Roadmap

- [x] MediaPipe detection engine integration
- [x] Real-time EAR/MAR computation
- [x] Head pose and no-face warning states
- [x] Landing page and dashboard UI
- [x] Clerk authentication integration
- [x] Supabase session storage
- [x] History dashboard with charts
- [ ] Add automated browser tests for dashboard routes
- [ ] Add a custom trained model for improved fatigue classification
- [ ] Add PWA install/offline support

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <strong>Built by Ganesh Sarode</strong><br>
  <em>3rd year EXTC Engineering, VJTI Mumbai</em>
</div>
