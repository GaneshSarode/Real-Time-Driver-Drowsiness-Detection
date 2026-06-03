<div align="center">
  <h1>🛡️ Aegis Drive</h1>
  <p><strong>AI-Powered Driver Safety System</strong></p>

  [![Live Demo](https://img.shields.io/badge/Demo-Live_Deployment-00ff88?style=for-the-badge&logo=vercel)](https://aegis-drive.vercel.app)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
  [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
  [![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
  
  <p>On-device, real-time driver drowsiness detection. Built with zero cloud latency to ensure split-second reaction times when it matters most.</p>
</div>

<br />

<div align="center">

![Dashboard](./public/screenshot.png)

</div>

## ✨ Features

- 👁️ **Real-Time Eye Tracking (EAR):** Monitors micro-sleep events and blink frequency using Eye Aspect Ratio calculations.
- 🗣️ **Yawn Detection (MAR):** Analyzes fatigue patterns through Mouth Aspect Ratio to catch early signs of drowsiness.
- 🧭 **Head Pose Estimation:** 3D facial orientation tracking to detect nodding off or distracted driving.
- 🔊 **Instant Web Audio Alerts:** Synthesized, multi-sensory alarm system triggering immediate driver response upon critical fatigue detection.
- ⚙️ **Custom Calibration Wizard:** Quick 3-second initialization to set personalized biometric baselines.
- 🎛️ **Advanced Settings Panel:** Full control over detection thresholds (EAR/MAR) and alarm configurations.
- ⚡ **30+ FPS On-Device Processing:** Zero cloud latency, ensuring instant inference entirely in the browser.
- 📱 **PWA Ready:** Designed to work progressively across devices.

## 🛠 Tech Stack

| Technology | Role |
| :--- | :--- |
| **MediaPipe FaceMesh** | Core 468-point facial landmark detection (WebAssembly) |
| **Vite** | Next-generation frontend tooling and bundling |
| **Vanilla JavaScript** | Zero-dependency, highly optimized execution logic |
| **Vanilla CSS** | Custom glassmorphism UI with a premium dark theme |
| **Vercel** | Edge network hosting and CI/CD deployment |

## 🚀 How It Works

1. **Calibrate:** The system performs a quick 3-second facial scan to establish your baseline resting eye and mouth shapes.
2. **Drive:** Aegis Drive continually monitors your face at 30+ FPS using MediaPipe's WASM engine, analyzing EAR, MAR, and head pose.
3. **Stay Safe:** If critical drowsiness thresholds are crossed (e.g., prolonged eye closure or frequent yawning), visual and high-frequency audio alerts trigger instantly to restore driver alertness.

## 💻 Quick Start

To run Aegis Drive locally on your machine:

1. **Clone the repository**
   ```bash
   git clone https://github.com/GaneshSarode/Real-Time-Driver-Drowsiness-Detection.git
   cd Real-Time-Driver-Drowsiness-Detection
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

## 🔬 Research & Inspiration

Aegis Drive's geometric algorithms are heavily inspired by recent advancements in computer vision and driver safety research:

> **Hassan et al., "Real-time driver drowsiness detection using transformer architectures"**  
> *Scientific Reports 2025, Nature Publishing Group*  
> [DOI: 10.1038/s41598-025-02111-x](https://doi.org/10.1038/s41598-025-02111-x)

The system implements the fundamental concepts of EAR (Eye Aspect Ratio) and MAR (Mouth Aspect Ratio) as robust indicators of human fatigue.

## 🗺 Roadmap

- [x] MediaPipe detection engine integration
- [x] Real-time EAR/MAR geometric computation
- [x] Premium Landing page design
- [ ] Clerk authentication
- [ ] Supabase session storage
- [ ] History dashboard
- [ ] ONNX-trained custom transformer model integration

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---
<div align="center">
  <b>Built by Ganesh Sarode</b><br>
</div>
