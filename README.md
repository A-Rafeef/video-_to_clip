# MovieToClip (ClipForge Desktop) 🎬

A desktop-focused web application for splitting long videos into clips, frame-accurate editing, customizable compression, and sequential ZIP archiving—deployable directly on Vercel with 100% client-side, privacy-first processing.

## 🚀 Core Features

- **Upload Long & Large Videos**: Supports MP4, MOV, WebM, and MKV. Uses native streaming `Blob` / object URLs so multi-gigabyte files don't overwhelm browser RAM.
- **Split Strategies**:
  - Every 90 seconds (strict maximum cap enforced)
  - Every 60 seconds
  - Every 30 seconds
  - Custom duration (slider between 5s and 90s)
  - Manual timestamps (e.g., `00:00.000 - 01:23.500`)
- **Frame-Accurate Video Editor**:
  - Interactive timeline scrubber with draggable In/Out handles
  - Step forward/backward frame by frame
  - Cut / split clip at playhead into subclips
  - Aspect ratio cropping (16:9 Landscape, 9:16 Reels/Shorts, 1:1 Square, Free)
  - 90° rotation increments
  - Audio mute toggle
  - Custom text / watermark overlays
  - Undo & Redo history with keyboard shortcuts
- **Batch Editing & Management**:
  - Select all, deselect, or pick individual clips
  - Batch mute, rotate, 9:16 crop, and watermark text
  - Reorder clips via drag-and-drop or move buttons
  - Status tracking (`waiting`, `processing`, `completed`, `failed`) with individual clip retry
- **Compression & Sequential ZIP Export**:
  - Compression profiles: **Original / High Quality**, **Balanced**, **Smaller File**
  - Automatic sequential numbering without gaps (`[ProjectName]-Part-1.mp4`, `Part-2.mp4`...)
  - Live progress display with elapsed and remaining time estimates
  - Single ZIP packaging with optional `manifest.json`
- **Privacy-First**: 100% client-side processing using HTML5 Canvas, Web Audio API, and MediaRecorder. Videos are never uploaded to any external server.

---

## 🛠️ Local Development

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
# Clone the repository
git clone https://github.com/rafeef22/movietoclip.git
cd movietoclip

# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build
```bash
npm run build
```

---

## 🌐 Deploying to Vercel

1. Push this repository to GitHub.
2. Import the repository into your [Vercel Dashboard](https://vercel.com).
3. Framework Preset: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Click **Deploy**. The included `vercel.json` automatically configures optimal headers.

---

## 📄 License
MIT
