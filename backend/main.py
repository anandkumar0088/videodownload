"""
MediaVault Dedicated Video Downloader Backend
Production-grade FastAPI service supporting yt-dlp extraction, FFmpeg muxing,
real-time progress tracking, SSE, and secure file delivery.
"""

import os
import sys
import re
import json
import uuid
import time
import shutil
import asyncio
import tempfile
import threading
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse, quote
import ipaddress

from fastapi import FastAPI, HTTPException, Request, Response, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from pydantic import BaseModel, Field

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

try:
    import imageio_ffmpeg
except ImportError:
    imageio_ffmpeg = None

# Base directories
BASE_DIR = Path(__file__).resolve().parent
TEMP_STORAGE_DIR = Path(os.environ.get("MEDIAVAULT_TEMP_DIR", BASE_DIR / "temp_downloads")).resolve()
TEMP_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# File size and limits
MAX_FILESIZE_MB = int(os.environ.get("MAX_FILESIZE_MB", "2000"))  # 2 GB default safety cap

# Rate limiting dictionary {ip: [timestamps]}
RATE_LIMIT_STORE: Dict[str, List[float]] = {}
RATE_LIMIT_LOCK = threading.Lock()
MAX_REQUESTS_PER_MINUTE = 180  # Accommodates progress polling and status checks

# In-memory download job storage
JOBS: Dict[str, Dict[str, Any]] = {}
PROCESSES: Dict[str, subprocess.Popen] = {}
JOBS_LOCK = threading.Lock()

app = FastAPI(
    title="MediaVault Worker Backend",
    description="Dedicated extraction and stream muxing service for MediaVault",
    version="1.0.0",
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "Content-Type"],
)


def get_ffmpeg_path() -> Optional[str]:
    """
    Discovers FFmpeg binary using:
    1. FFMPEG_PATH environment variable
    2. System PATH lookup (which ffmpeg / where ffmpeg)
    3. imageio-ffmpeg bundled binary
    """
    env_path = os.environ.get("FFMPEG_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        return which_ffmpeg

    if imageio_ffmpeg is not None:
        try:
            exe = imageio_ffmpeg.get_ffmpeg_exe()
            if exe and os.path.exists(exe):
                return exe
        except Exception:
            pass

    return None


def get_cookie_file() -> Optional[str]:
    """
    Checks for YouTube / platform cookies from environment variables or local file.
    """
    cookie_env = (
        os.environ.get("YT_COOKIES")
        or os.environ.get("YOUTUBE_COOKIES")
        or os.environ.get("COOKIES_TXT")
    )
    if cookie_env and cookie_env.strip():
        try:
            tf = tempfile.NamedTemporaryFile(
                mode="w", delete=False, suffix=".txt", encoding="utf-8"
            )
            tf.write(cookie_env.strip())
            tf.close()
            return tf.name
        except Exception:
            pass

    candidates = [
        BASE_DIR / "cookies.txt",
        BASE_DIR.parent / "cookies.txt",
        Path.cwd() / "cookies.txt",
    ]
    for path in candidates:
        if path.exists() and path.stat().st_size > 0:
            return str(path)

    return None


def is_private_ip(hostname: str) -> bool:
    try:
        ip = ipaddress.ip_address(hostname)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    except ValueError:
        return False


def validate_url_security(raw_url: str) -> str:
    """
    SSRF and protocol protection against private IPs, loopbacks, and cloud metadata servers.
    """
    if not raw_url or not isinstance(raw_url, str):
        raise HTTPException(status_code=400, detail="A valid video URL is required.")

    clean_url = raw_url.strip()
    if len(clean_url) > 2048:
        raise HTTPException(status_code=400, detail="URL exceeds maximum allowed length.")

    try:
        parsed = urlparse(clean_url)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed URL structure.")

    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only HTTP and HTTPS URLs are permitted.")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise HTTPException(status_code=400, detail="Missing hostname in URL.")

    blocked_hosts = {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "[::1]",
        "169.254.169.254",
        "metadata.google.internal",
    }
    if (
        hostname in blocked_hosts
        or hostname.endswith(".localhost")
        or hostname.endswith(".local")
        or hostname.endswith(".internal")
        or is_private_ip(hostname)
    ):
        raise HTTPException(
            status_code=400,
            detail="Access to localhost, internal networks, or metadata services is blocked.",
        )

    return clean_url


def sanitize_filename(name: str, fallback: str = "video") -> str:
    if not name:
        return fallback
    clean = re.sub(r'[\\/:*?"<>|]', "_", name)
    clean = re.sub(r"[\x00-\x1f\x80-\x9f]", "", clean).strip()
    clean = re.sub(r"^\.+", "", clean).strip()
    if not clean:
        return fallback
    return clean[:100]


def format_duration(seconds: Optional[float]) -> str:
    if not seconds or seconds <= 0:
        return "0:00"
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hrs > 0:
        return f"{hrs}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def format_bytes(bytes_count: Optional[float]) -> str:
    if not bytes_count or bytes_count <= 0:
        return "Unknown size"
    units = ["B", "KB", "MB", "GB"]
    size = float(bytes_count)
    unit_idx = 0
    while size >= 1024 and unit_idx < len(units) - 1:
        size /= 1024.0
        unit_idx += 1
    return f"{size:.1f} {units[unit_idx]}"


# Schemas
class AnalyzeRequest(BaseModel):
    url: str = Field(..., description="The media URL to analyze")


class StartDownloadRequest(BaseModel):
    url: str
    title: str
    thumbnail: Optional[str] = None
    formatId: str
    ext: str = "mp4"
    quality: str = "Best"
    uploader: Optional[str] = None
    duration: Optional[str] = None


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Exclude health check and documentation endpoints from rate limiting
    path = request.url.path
    if path in ("/health", "/api/health", "/", "/docs", "/openapi.json", "/favicon.ico"):
        return await call_next(request)

    # Extract true client IP from forwarded headers when behind proxy
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"

    now = time.time()

    with RATE_LIMIT_LOCK:
        timestamps = RATE_LIMIT_STORE.get(client_ip, [])
        valid_timestamps = [t for t in timestamps if now - t < 60]
        if len(valid_timestamps) >= MAX_REQUESTS_PER_MINUTE:
            return JSONResponse(
                status_code=429,
                content={"success": False, "error": "Too many requests. Please slow down."},
            )
        valid_timestamps.append(now)
        RATE_LIMIT_STORE[client_ip] = valid_timestamps

        # Periodic cleanup of expired entries
        if len(RATE_LIMIT_STORE) > 1000:
            for ip in list(RATE_LIMIT_STORE.keys()):
                RATE_LIMIT_STORE[ip] = [t for t in RATE_LIMIT_STORE[ip] if now - t < 60]
                if not RATE_LIMIT_STORE[ip]:
                    RATE_LIMIT_STORE.pop(ip, None)

    return await call_next(request)


@app.get("/")
def root():
    return {
        "service": "MediaVault Backend Worker",
        "status": "operational",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
@app.get("/api/health")
def health_check():
    ffmpeg_exe = get_ffmpeg_path()
    cookie_file = get_cookie_file()
    try:
        total_space, used_space, free_space = shutil.disk_usage(TEMP_STORAGE_DIR)
        storage_info = {
            "tempDir": str(TEMP_STORAGE_DIR),
            "freeSpaceMb": round(free_space / (1024 * 1024), 2),
            "totalSpaceMb": round(total_space / (1024 * 1024), 2),
        }
    except Exception:
        storage_info = {
            "tempDir": str(TEMP_STORAGE_DIR),
            "freeSpaceMb": None,
            "totalSpaceMb": None,
        }

    return {
        "success": True,
        "status": "operational",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "engines": {
            "pythonVersion": sys.version.split()[0],
            "ytDlpReady": yt_dlp is not None,
            "ytDlpVersion": getattr(yt_dlp.version, "__version__", None) if yt_dlp else None,
            "ffmpegAvailable": ffmpeg_exe is not None,
            "ffmpegPath": ffmpeg_exe,
            "cookiesConfigured": cookie_file is not None,
        },
        "storage": storage_info,
        "activeJobs": len([j for j in JOBS.values() if j.get("status") in ("queued", "downloading", "merging")]),
    }


def extract_media_info_core(video_url: str) -> Dict[str, Any]:
    if yt_dlp is None:
        raise RuntimeError("yt-dlp is not installed in the Python runtime.")

    cookie_file = get_cookie_file()
    ffmpeg_exe = get_ffmpeg_path()

    # Client strategies for YouTube when applicable
    client_strategies = [
        ["android_creator"],
        ["ios_creator"],
        None,
        ["android"],
    ]

    raw = None
    last_err_str = ""

    for clients in client_strategies:
        ydl_opts: Dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
            "no_color": True,
        }

        if clients:
            ydl_opts["extractor_args"] = {"youtube": {"player_client": clients}}

        if cookie_file and os.path.exists(cookie_file):
            ydl_opts["cookiefile"] = cookie_file

        if ffmpeg_exe:
            ydl_opts["ffmpeg_location"] = ffmpeg_exe

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                raw = ydl.extract_info(video_url, download=False)
            if raw and raw.get("formats"):
                break
        except Exception as err:
            last_err_str = str(err)
            if any(k in last_err_str for k in ["DRM", "Private video", "Video unavailable", "404"]):
                break
            continue

    if cookie_file and cookie_file.startswith(tempfile.gettempdir()):
        try:
            os.unlink(cookie_file)
        except Exception:
            pass

    if not raw:
        if "DRM" in last_err_str:
            raise HTTPException(
                status_code=422,
                detail="This content is protected by DRM and cannot be downloaded.",
            )
        elif "Private video" in last_err_str:
            raise HTTPException(
                status_code=422,
                detail="This video is marked private and cannot be accessed.",
            )
        elif "Video unavailable" in last_err_str or "404" in last_err_str:
            raise HTTPException(
                status_code=404,
                detail="The requested video was not found or is unavailable.",
            )
        elif "Sign in" in last_err_str or "bot" in last_err_str:
            raise HTTPException(
                status_code=403,
                detail=(
                    "YouTube has restricted automated access on this cloud server IP. "
                    "This is an access-control restriction by YouTube against datacenter IP ranges. "
                    "Supported alternatives (such as Archive.org, Vimeo, SoundCloud, or direct media streams) "
                    "can be analyzed and downloaded directly, or you can configure YT_COOKIES on your backend."
                ),
            )
        else:
            clean_err = re.sub(r"^ERROR:\s*", "", last_err_str.strip())
            raise HTTPException(
                status_code=422,
                detail=clean_err if clean_err else "Failed to retrieve media information from source.",
            )

    duration = raw.get("duration") or 0
    width = raw.get("width") or 0
    height = raw.get("height") or 0
    aspect_ratio = raw.get("aspect_ratio") or (width / height if width and height else 1.78)
    is_vertical = (
        (height > width and width > 0)
        or (aspect_ratio < 1.0)
        or ("/shorts/" in video_url)
        or ("/reel/" in video_url)
        or ("tiktok.com" in video_url)
    )

    raw_formats = raw.get("formats") or []
    audio_candidates = [
        f for f in raw_formats if f.get("vcodec") == "none" and f.get("acodec") != "none"
    ]
    audio_candidates.sort(key=lambda x: (x.get("abr") or 0), reverse=True)
    best_audio = audio_candidates[0] if audio_candidates else None

    quality_targets = [
        {"label": "4K", "min_h": 2160, "name": "2160p (4K UHD)"},
        {"label": "2K", "min_h": 1440, "name": "1440p (2K QHD)"},
        {"label": "1080p", "min_h": 1080, "name": "1080p (Full HD)"},
        {"label": "720p", "min_h": 720, "name": "720p (HD)"},
        {"label": "480p", "min_h": 480, "name": "480p (SD)"},
        {"label": "360p", "min_h": 360, "name": "360p (Data Saver)"},
    ]

    parsed_options = []

    for target in quality_targets:
        matching = []
        for f in raw_formats:
            if f.get("vcodec") == "none":
                continue
            fh = f.get("height") or 0
            fw = f.get("width") or 0
            eff_h = max(fh, fw) if is_vertical else fh

            if target["label"] == "4K":
                if (
                    eff_h >= 2160
                    or fw >= 3840
                    or ("2160p" in str(f.get("format_note", "")))
                    or ("4k" in str(f.get("format_note", "")).lower())
                ):
                    matching.append(f)
            elif target["label"] == "2K":
                if (1440 <= eff_h < 2160) or (2560 <= fw < 3840) or ("1440p" in str(f.get("format_note", ""))):
                    matching.append(f)
            elif target["label"] == "1080p":
                if (1080 <= eff_h < 1440) or (1920 <= fw < 2560) or ("1080p" in str(f.get("format_note", ""))):
                    matching.append(f)
            elif target["label"] == "720p":
                if (720 <= eff_h < 1080) or (1280 <= fw < 1920) or ("720p" in str(f.get("format_note", ""))):
                    matching.append(f)
            elif target["label"] == "480p":
                if 480 <= eff_h < 720:
                    matching.append(f)
            elif target["label"] == "360p":
                if 360 <= eff_h < 480:
                    matching.append(f)

        if matching:
            matching.sort(key=lambda x: (x.get("tbr") or x.get("vbr") or 0), reverse=True)
            best = matching[0]

            has_audio = best.get("acodec") != "none"
            requires_merge = not has_audio

            best_fmt_id = str(best.get("format_id"))
            if requires_merge:
                if target["label"] == "4K":
                    fmt_id = f"{best_fmt_id}+140/{best_fmt_id}+ba/bestvideo[height>=2160]+bestaudio/best"
                elif target["label"] == "2K":
                    fmt_id = f"{best_fmt_id}+140/{best_fmt_id}+ba/bestvideo[height>=1440]+bestaudio/best"
                elif target["label"] == "1080p":
                    fmt_id = f"{best_fmt_id}+140/{best_fmt_id}+ba/bestvideo[height>=1080]+bestaudio/best"
                else:
                    fmt_id = f"{best_fmt_id}+ba/{best_fmt_id}/best"
            else:
                fmt_id = best_fmt_id

            approx_bytes = best.get("filesize") or best.get("filesize_approx")
            if not approx_bytes and duration > 0 and best.get("tbr"):
                approx_bytes = int(round(best["tbr"] * 1024 * duration / 8))
            if requires_merge and best_audio:
                audio_bytes = best_audio.get("filesize") or best_audio.get("filesize_approx")
                if not audio_bytes and duration > 0 and best_audio.get("abr"):
                    audio_bytes = int(round(best_audio["abr"] * 1024 * duration / 8))
                approx_bytes = (approx_bytes or 0) + (audio_bytes or 0)

            parsed_options.append({
                "formatId": fmt_id,
                "qualityLabel": target["label"],
                "resolution": target["name"],
                "ext": "mp4",
                "fps": best.get("fps"),
                "filesizeApprox": approx_bytes,
                "filesizeFormatted": format_bytes(approx_bytes),
                "hasAudio": True,
                "requiresMerge": requires_merge,
                "vcodec": best.get("vcodec"),
                "acodec": best.get("acodec") if has_audio else (best_audio.get("acodec") if best_audio else "aac"),
                "width": best.get("width"),
                "height": best.get("height"),
            })

    # Audio-only HQ option
    if audio_candidates:
        top_a = audio_candidates[0]
        a_bytes = top_a.get("filesize") or top_a.get("filesize_approx")
        if not a_bytes and duration > 0 and top_a.get("abr"):
            a_bytes = int(round(top_a["abr"] * 1024 * duration / 8))

        parsed_options.append({
            "formatId": "ba/b",
            "qualityLabel": "Audio Only",
            "resolution": f"{int(round(top_a['abr']))} kbps Audio" if top_a.get("abr") else "High Quality Audio",
            "ext": "mp3",
            "filesizeApprox": a_bytes,
            "filesizeFormatted": format_bytes(a_bytes),
            "hasAudio": True,
            "requiresMerge": False,
            "acodec": top_a.get("acodec") or "mp3",
        })

    # Fallback if no specific resolution matched
    if not parsed_options and raw_formats:
        parsed_options.append({
            "formatId": "best",
            "qualityLabel": "720p",
            "resolution": "Standard Best",
            "ext": "mp4",
            "hasAudio": True,
            "requiresMerge": False,
            "filesizeFormatted": "Calculated at download",
        })

    return {
        "id": str(raw.get("id")),
        "title": raw.get("title") or "Untitled Media",
        "description": raw.get("description"),
        "thumbnail": raw.get("thumbnail"),
        "duration": duration,
        "durationFormatted": format_duration(duration),
        "uploader": raw.get("uploader") or "Unknown Author",
        "uploaderUrl": raw.get("uploader_url"),
        "viewCount": raw.get("view_count"),
        "originalUrl": video_url,
        "isVertical": is_vertical,
        "aspectRatio": aspect_ratio,
        "license": raw.get("license"),
        "formats": parsed_options,
    }


@app.post("/api/analyze")
@app.post("/api/extract")
def analyze_endpoint(payload: AnalyzeRequest):
    valid_url = validate_url_security(payload.url)
    try:
        data = extract_media_info_core(valid_url)
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def run_download_worker(job_id: str, clean_title: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        return

    ffmpeg_exe = get_ffmpeg_path()
    cookie_file = get_cookie_file()
    output_tmpl = str(TEMP_STORAGE_DIR / f"{job_id}_{clean_title[:50]}.%(ext)s")

    args = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--no-playlist",
        "--socket-timeout",
        "30",
        "--max-filesize",
        f"{MAX_FILESIZE_MB}M",
        "--newline",
        "--progress-template",
        "PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.status)s",
        "-o",
        output_tmpl,
    ]

    if ffmpeg_exe:
        args.extend(["--ffmpeg-location", ffmpeg_exe])

    if cookie_file and os.path.exists(cookie_file):
        args.extend(["--cookiefile", cookie_file])

    # Audio or Video options
    if job.get("ext") == "mp3":
        audio_fmt = job.get("formatId") if job.get("formatId") and job.get("formatId") != "ba/b" else "ba/b"
        args.extend(["-f", audio_fmt, "-x", "--audio-format", "mp3", "--audio-quality", "0"])
    else:
        video_fmt = job.get("formatId") if job.get("formatId") else "bestvideo+bestaudio/best"
        target_ext = job.get("ext") or "mp4"
        args.extend(["-f", video_fmt, "--merge-output-format", target_ext])

    args.append(job["url"])

    with JOBS_LOCK:
        job["status"] = "downloading"

    try:
        proc = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        with JOBS_LOCK:
            PROCESSES[job_id] = proc

        stderr_lines: List[str] = []

        def capture_stderr():
            if proc.stderr:
                for line in proc.stderr:
                    stderr_lines.append(line)

        err_thread = threading.Thread(target=capture_stderr, daemon=True)
        err_thread.start()

        if proc.stdout:
            for line in proc.stdout:
                line_str = line.strip()
                if line_str.startswith("PROGRESS:"):
                    parts = line_str.replace("PROGRESS:", "").split("|")
                    if len(parts) >= 6:
                        percent_str = parts[0].replace("%", "").strip()
                        speed = parts[1].strip()
                        eta = parts[2].strip()
                        try:
                            downloaded = int(parts[3])
                        except (ValueError, TypeError):
                            downloaded = 0
                        try:
                            total = int(parts[4])
                        except (ValueError, TypeError):
                            total = 0

                        try:
                            percent_val = float(percent_str)
                        except ValueError:
                            percent_val = 0.0

                        with JOBS_LOCK:
                            job["percent"] = min(100.0, max(0.0, percent_val))
                            if speed:
                                job["speed"] = speed
                            if eta:
                                job["eta"] = eta
                            if downloaded > 0:
                                job["downloadedBytes"] = downloaded
                            if total > 0:
                                job["totalBytes"] = total

                elif "[Merger]" in line_str or "[ExtractAudio]" in line_str:
                    with JOBS_LOCK:
                        job["status"] = "merging"
                        job["speed"] = "Multiplexing audio/video streams..."
                        job["eta"] = "Finalizing"

        proc.wait()
        err_thread.join(timeout=3.0)

        with JOBS_LOCK:
            PROCESSES.pop(job_id, None)

        if job.get("status") == "cancelled":
            cleanup_job_files(job_id)
            return

        if proc.returncode == 0:
            candidates = [
                f for f in TEMP_STORAGE_DIR.glob(f"{job_id}_*")
                if not f.name.endswith(".part")
                and not f.name.endswith(".ytdl")
                and not f.name.endswith(".tmp")
                and not f.name.endswith(".temp")
            ]
            # Pick the newest and largest valid media file
            candidates.sort(key=lambda f: f.stat().st_mtime, reverse=True)
            final_file = candidates[0] if candidates else None

            if final_file and final_file.exists():
                file_size = final_file.stat().st_size
                if file_size > 0:
                    with JOBS_LOCK:
                        job["status"] = "completed"
                        job["percent"] = 100.0
                        job["filePath"] = str(final_file)
                        job["fileName"] = final_file.name.replace(f"{job_id}_", "")
                        job["fileSize"] = file_size
                        job["ext"] = final_file.suffix.replace(".", "").lower()
                        job["completedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    return

        # Handle failure
        err_text = "".join(stderr_lines).strip()
        if "HTTP Error 403" in err_text:
            err_msg = "Media host returned HTTP 403 Forbidden."
        elif "Sign in" in err_text or "bot" in err_text:
            err_msg = (
                "YouTube has restricted automated access on this cloud server IP. "
                "Please configure YT_COOKIES on the backend host or use a supported open media link."
            )
        elif "File is larger than max-filesize" in err_text:
            err_msg = f"The media file exceeds the maximum allowed size limit ({MAX_FILESIZE_MB}MB)."
        elif err_text:
            clean_lines = [l for l in err_text.splitlines() if l.strip()]
            err_msg = clean_lines[-1].replace("ERROR:", "").strip() if clean_lines else "Download process terminated."
        else:
            err_msg = "Download process finished with an error."

        with JOBS_LOCK:
            job["status"] = "failed"
            job["errorMessage"] = err_msg

        cleanup_job_files(job_id)

    except Exception as exc:
        with JOBS_LOCK:
            PROCESSES.pop(job_id, None)
            job["status"] = "failed"
            job["errorMessage"] = f"Worker runtime exception: {str(exc)}"
        cleanup_job_files(job_id)


def cleanup_job_files(job_id: str):
    try:
        for f in TEMP_STORAGE_DIR.glob(f"{job_id}_*"):
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass
    except Exception:
        pass


@app.post("/api/download/start")
def start_download_endpoint(payload: StartDownloadRequest):
    valid_url = validate_url_security(payload.url)
    clean_title = sanitize_filename(payload.title)
    job_id = str(uuid.uuid4())

    job = {
        "jobId": job_id,
        "url": valid_url,
        "title": payload.title,
        "thumbnail": payload.thumbnail,
        "formatId": payload.formatId,
        "ext": payload.ext or "mp4",
        "quality": payload.quality or "Best",
        "status": "queued",
        "percent": 0.0,
        "speed": "0 KB/s",
        "eta": "--:--",
        "downloadedBytes": 0,
        "totalBytes": 0,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    with JOBS_LOCK:
        JOBS[job_id] = job

    # Start download in background thread
    threading.Thread(target=run_download_worker, args=(job_id, clean_title), daemon=True).start()

    return {"success": True, "jobId": job_id}


@app.get("/api/download/status/{job_id}")
def download_status_endpoint(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    return {"success": True, "job": job}


@app.get("/api/download/progress/{job_id}")
async def download_progress_sse(job_id: str, request: Request):
    with JOBS_LOCK:
        job = JOBS.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            with JOBS_LOCK:
                current_job = dict(JOBS.get(job_id, {}))

            if not current_job:
                break

            payload = json.dumps(current_job)
            yield f"data: {payload}\n\n"

            if current_job.get("status") in ("completed", "failed", "cancelled"):
                await asyncio.sleep(0.5)
                break

            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/download/cancel/{job_id}")
def cancel_download_endpoint(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        proc = PROCESSES.get(job_id)

        if job:
            job["status"] = "cancelled"
            job["errorMessage"] = "Download was cancelled by user."

        if proc:
            try:
                proc.terminate()
                proc.kill()
            except Exception:
                pass
            PROCESSES.pop(job_id, None)

    cleanup_job_files(job_id)
    return {"success": True, "message": "Job cancelled successfully."}


@app.get("/api/download/file/{job_id}")
def download_file_endpoint(job_id: str):
    if not job_id or not re.match(r"^[0-9a-fA-F-]+$", job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format.")

    with JOBS_LOCK:
        job = JOBS.get(job_id)

    target_path = Path(job.get("filePath")) if job and job.get("filePath") else None

    if not target_path or not target_path.exists():
        candidates = [
            f for f in TEMP_STORAGE_DIR.glob(f"{job_id}_*")
            if not f.name.endswith(".part") and not f.name.endswith(".ytdl")
        ]
        candidates.sort(key=lambda f: f.stat().st_mtime, reverse=True)
        if candidates and candidates[0].exists():
            target_path = candidates[0]

    if not target_path or not target_path.exists():
        raise HTTPException(status_code=404, detail="Requested file was not found or has expired.")

    # Prevent directory traversal
    try:
        target_path.resolve().relative_to(TEMP_STORAGE_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied.")

    ext = target_path.suffix.lower()
    media_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".opus": "audio/opus",
    }
    media_type = media_types.get(ext, "application/octet-stream")
    clean_display_name = target_path.name.replace(f"{job_id}_", "")

    # Starlette FileResponse automatically handles standard Content-Disposition encoding
    return FileResponse(
        path=str(target_path),
        media_type=media_type,
        filename=clean_display_name,
        headers={
            "Cache-Control": "public, max-age=3600",
        },
    )


# Periodic background cleanup of files older than 1 hour
def periodic_temp_cleanup():
    while True:
        try:
            now = time.time()
            one_hour_sec = 3600
            for f in TEMP_STORAGE_DIR.iterdir():
                if f.is_file():
                    try:
                        if now - f.stat().st_mtime > one_hour_sec:
                            f.unlink(missing_ok=True)
                    except Exception:
                        pass
        except Exception:
            pass
        time.sleep(900)  # run every 15 minutes


threading.Thread(target=periodic_temp_cleanup, daemon=True).start()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
