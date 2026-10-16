# MediaVault Dedicated Python FastAPI Backend Worker

This is the dedicated backend service for MediaVault. It provides:
- **yt-dlp Engine**: High-fidelity media metadata extraction and DASH video/audio downloading.
- **FFmpeg 7.1 Stream Muxer**: Automatic multiplexing of separated video and audio streams (e.g. 4K/2K/1080p DASH streams + AAC audio) into standard MP4/MP3 files.
- **Real-Time Progress Tracking**: Server-Sent Events (SSE) and HTTP polling for live percent, download speed, and ETA.
- **Security & Integrity**: Strict SSRF defense (blocking private/internal/metadata IPs), path traversal protection, rate limiting, and automated temp file cleanup.

---

## Deployment Options

### Option 1: Deploy to Render.com (Recommended Free/Low-Cost)

1. **Sign in to [Render.com](https://render.com/)** and click **New +** -> **Web Service**.
2. Connect your GitHub repository `anandkumar0088/videodownload`.
3. In the configuration settings:
   - **Name**: `mediavault-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Python 3` (or `Docker`)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. *(Optional)* Under **Environment Variables**, add:
   - `YT_COOKIES`: *(Optional)* Your YouTube cookies.txt content if downloading restricted YouTube videos from cloud IPs.
5. Click **Create Web Service**.
6. Once deployed, copy your Render URL:
   `https://mediavault-backend.onrender.com`
7. In your **Vercel Project Settings** -> **Environment Variables**:
   - Add `MEDIAVAULT_BACKEND_URL` = `https://mediavault-backend.onrender.com`
   - Redeploy the Vercel project.

---

### Option 2: Deploy to Railway.app (Docker)

1. **Sign in to [Railway.app](https://railway.app/)** and click **New Project** -> **Deploy from GitHub repo**.
2. Select `videodownload`.
3. In service **Settings** -> **Source**:
   - Set **Root Directory** to `/backend`.
4. Railway will automatically detect the `Dockerfile`, install system `ffmpeg`, and start the service.
5. In **Networking** -> click **Generate Domain** (e.g., `https://videodownload-backend-production.up.railway.app`).
6. Copy that domain and set it in Vercel as `MEDIAVAULT_BACKEND_URL`.

---

### Option 3: Deploy to any Ubuntu/Debian VPS (Docker)

```bash
# Clone the repository
git clone https://github.com/anandkumar0088/videodownload.git
cd videodownload/backend

# Build the Docker image with FFmpeg
docker build -t mediavault-backend .

# Run the container on port 8000
docker run -d \
  --name mediavault-worker \
  --restart always \
  -p 8000:8000 \
  -e PORT=8000 \
  mediavault-backend
```

Configure Nginx or Caddy with SSL for `https://api.yourdomain.com`, and set `MEDIAVAULT_BACKEND_URL=https://api.yourdomain.com` in Vercel.

---

## Verifying Deployment

Visit `https://<YOUR_BACKEND_URL>/health` in your browser. You should receive:

```json
{
  "success": true,
  "status": "operational",
  "engines": {
    "pythonVersion": "3.11.x",
    "ytDlpReady": true,
    "ytDlpVersion": "2025.x",
    "ffmpegAvailable": true,
    "ffmpegPath": "/usr/bin/ffmpeg",
    "cookiesConfigured": false
  }
}
```
