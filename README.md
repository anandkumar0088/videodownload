# MediaVault Downloader 🎬

**MediaVault Downloader** is a high-performance, full-stack video downloader application with a dark UI, reliable backend processing, real download functionality, and FFmpeg stream multiplexing.

---

## 🌟 Key Features

1. **Universal Format & Quality Selection**:
   - Supports **4K UHD (2160p)**, **2K QHD (1440p)**, **1080p (Full HD)**, **720p (HD)**, **480p (SD)**, and **360p (Data Saver)**.
   - Dedicated **Audio Only (High-Bitrate MP3)** extraction.
   - Shows resolution, estimated file size, duration, and container format.
2. **Shorts & Vertical 9:16 Video Detection**:
   - Automatically detects vertical videos (YouTube Shorts, Reels, TikTok) and displays orientation badges (`9:16 Vertical Short`).
3. **Lossless FFmpeg Audio & Video Stream Merging**:
   - Modern streaming platforms store 1080p, 1440p, and 4K video streams separately from audio. MediaVault automatically downloads both streams and losslessly muxes them via FFmpeg into a single playable MP4 or WebM file.
4. **Real-time Download Telemetry**:
   - Live Server-Sent Events (SSE) stream with real-time percentage (`0-100%`), download speed (`MB/s`), and remaining ETA (`00:15`).
   - Dedicated cancellation button that terminates backend child processes and cleans temporary files.
5. **Local SQLite Download History**:
   - Zero-configuration persistent local history using Node.js native `node:sqlite`.
   - Search by title or URL, filter by status, re-download cached media, or delete entries.
6. **Robust Security & SSRF Protection**:
   - Validates URLs and strictly blocks `localhost`, `127.0.0.1`, private RFC1918 subnets (`10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`), cloud metadata endpoints (`169.254.169.254`), and path traversal attempts.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons.
- **Backend**: Next.js Server Routes, Server-Sent Events (SSE) for live streaming telemetry.
- **Engine**: Python `yt-dlp` with `--remote-components ejs:github` and `--js-runtimes node`.
- **Media Processing**: FFmpeg 7.1 static binary auto-discovered via `imageio-ffmpeg` or system PATH.
- **Database**: Local SQLite via native `node:sqlite` (`data/mediavault.db`).

---

## 🚀 Beginner's Quick Start Guide (Windows)

### Prerequisites

1. **Node.js (v20 or v22+)**:
   - Verify by opening PowerShell or Command Prompt:
     ```powershell
     node -v
     ```
2. **Python (3.10+)**:
   - Verify:
     ```powershell
     python --version
     ```

---

### Step-by-Step Setup

#### 1. Open Terminal in Project Directory
Open PowerShell or Command Prompt in the `d:\seal` directory.

#### 2. Install Media Extraction Tools (yt-dlp & FFmpeg)
Run the following commands to install the extraction engine and modern FFmpeg 7.1 static binary:
```powershell
python -m pip install yt-dlp imageio-ffmpeg
```
- **What this does**:
  - `yt-dlp`: The media extraction tool that inspects video formats and streams data.
  - `imageio-ffmpeg`: Automatically bundles a Windows static FFmpeg 7.1 executable (`ffmpeg-win-x86_64-v7.1.exe`), eliminating manual FFmpeg installation or PATH configuration.

#### 3. Install Node.js Dependencies
In PowerShell, if script execution is restricted, use `npm.cmd`:
```powershell
npm.cmd install
```
- **What this does**: Installs Next.js, React, Tailwind CSS, TypeScript, and Lucide icons.

#### 4. Configure Environment (Optional)
Copy the example environment file:
```powershell
Copy-Item .env.example .env.local
```

#### 5. Launch the Development Server
```powershell
npm.cmd run dev
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🧪 Testing the Application

### 1-Click Sample Testing
1. On the home page, click any of the sample chips below the search bar:
   - `[4K Long-form] Big Buck Bunny (4K / 60fps CC)` (Creative Commons open film)
   - `[Vertical Short] Shorts Upload Guide (Vertical 9:16)`
2. Click **Analyze Media** (or press `Enter`).
3. Inspect the video preview card:
   - High-resolution thumbnail and duration badge.
   - Available resolutions (4K, 2K, 1080p, 720p, 480p, 360p, Audio Only).
   - Estimated file sizes.
4. Select a quality card (e.g., `1080p` or `360p` or `Audio Only`).
5. Click **Download Video**:
   - Watch real-time speed, percentage, and ETA telemetry.
   - When merging completes, the browser download automatically starts.
6. Switch to the **History** tab to see your download logged in the SQLite database.

---

## 🔒 Security Architecture

- **SSRF Prevention**: Strict IP checking blocks internal addresses, loopbacks, and cloud metadata endpoints.
- **Path Traversal Protection**: All downloaded files are stored strictly inside `./temp_downloads/` and validated with `path.resolve` checks.
- **Process Isolation**: Commands are spawned using argument arrays (`child_process.spawn`) rather than shell string interpolation, completely preventing command injection.
- **Automatic Temp Cleanup**: Downloaded temporary files older than 2 hours are pruned automatically.
