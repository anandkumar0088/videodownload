"""
MediaVault Universal Video Downloader - Python Extraction Engine
Compatible with Vercel Python Serverless Functions and local execution.
"""
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import re
import tempfile

try:
    import yt_dlp
except ImportError:
    yt_dlp = None


def get_cookie_file():
    """
    Checks for cookies.txt in environment variables or filesystem.
    """
    # 1. Environment variable containing cookies text
    cookie_env = (
        os.environ.get('YT_COOKIES') or
        os.environ.get('YOUTUBE_COOKIES') or
        os.environ.get('COOKIES_TXT')
    )
    if cookie_env and cookie_env.strip():
        try:
            tf = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8')
            tf.write(cookie_env.strip())
            tf.close()
            return tf.name
        except Exception:
            pass

    # 2. Local cookies.txt file
    candidates = [
        os.path.join(os.getcwd(), 'cookies.txt'),
        os.path.join(os.getcwd(), 'api', 'cookies.txt'),
        os.path.join(os.path.dirname(__file__), 'cookies.txt'),
    ]
    for path in candidates:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path

    return None


def format_duration(seconds):
    if not seconds or seconds <= 0:
        return '0:00'
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hrs > 0:
        return f"{hrs}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def format_bytes(bytes_count):
    if not bytes_count or bytes_count <= 0:
        return 'Unknown size'
    units = ['B', 'KB', 'MB', 'GB']
    size = float(bytes_count)
    unit_idx = 0
    while size >= 1024 and unit_idx < len(units) - 1:
        size /= 1024.0
        unit_idx += 1
    return f"{size:.1f} {units[unit_idx]}"


def extract_video_info(video_url):
    if yt_dlp is None:
        raise RuntimeError("yt-dlp is not installed in the Python environment.")

    cookie_file = get_cookie_file()

    # Client strategies prioritized for cloud/datacenter IP reliability:
    # 1. android_creator: mobile creator protocol, delivers all 4K/2K/1080p formats without web bot gates
    # 2. ios_creator: iOS creator fallback with high quality streams
    # 3. None: standard yt-dlp default extractor
    # 4. android: base mobile client
    client_strategies = [
        ['android_creator'],
        ['ios_creator'],
        None,
        ['android'],
    ]

    raw = None
    last_err_str = ''

    for clients in client_strategies:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'extract_flat': False,
            'no_color': True,
        }

        if clients:
            ydl_opts['extractor_args'] = {
                'youtube': {
                    'player_client': clients,
                }
            }

        if cookie_file and os.path.exists(cookie_file):
            ydl_opts['cookiefile'] = cookie_file

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                raw = ydl.extract_info(video_url, download=False)
            if raw and raw.get('formats'):
                break
        except Exception as err:
            last_err_str = str(err)
            # If it's a permanent failure (DRM, private, 404), no need to retry other clients
            if any(k in last_err_str for k in ['DRM', 'Private video', 'Video unavailable', '404']):
                break
            continue

    if cookie_file and cookie_file.startswith(tempfile.gettempdir()):
        try:
            os.unlink(cookie_file)
        except Exception:
            pass

    if not raw:
        if 'DRM' in last_err_str:
            raise RuntimeError("This content is protected by DRM and cannot be downloaded.")
        elif 'Private video' in last_err_str:
            raise RuntimeError("This video is private and cannot be downloaded.")
        elif 'Video unavailable' in last_err_str or '404' in last_err_str:
            raise RuntimeError("The requested video was not found or is unavailable.")
        elif 'Sign in' in last_err_str or 'bot' in last_err_str:
            raise RuntimeError(
                "YouTube has restricted automated access on this cloud server IP. Please try again shortly or configure YT_COOKIES."
            )
        else:
            clean_err = re.sub(r'^ERROR:\s*', '', last_err_str.strip())
            raise RuntimeError(clean_err if clean_err else "Failed to retrieve media information from source.")

    duration = raw.get('duration') or 0
    width = raw.get('width') or 0
    height = raw.get('height') or 0
    aspect_ratio = raw.get('aspect_ratio') or (width / height if width and height else 1.78)

    is_vertical = bool(
        (height and width and height > width) or
        (aspect_ratio and aspect_ratio < 1) or
        '/shorts/' in video_url or
        '/reel/' in video_url or
        'tiktok.com' in video_url
    )

    raw_formats = raw.get('formats') or []

    # Quality bucket definitions
    quality_targets = [
        {'label': '4K', 'min_h': 2160, 'name': '2160p (4K UHD)'},
        {'label': '2K', 'min_h': 1440, 'name': '1440p (2K QHD)'},
        {'label': '1080p', 'min_h': 1080, 'name': '1080p (Full HD)'},
        {'label': '720p', 'min_h': 720, 'name': '720p (HD)'},
        {'label': '480p', 'min_h': 480, 'name': '480p (SD)'},
        {'label': '360p', 'min_h': 360, 'name': '360p (Data Saver)'},
    ]

    audio_candidates = [
        f for f in raw_formats
        if f.get('vcodec') == 'none' and f.get('acodec') != 'none'
    ]
    best_audio = sorted(audio_candidates, key=lambda f: f.get('abr') or 0, reverse=True)
    best_audio_stream = best_audio[0] if best_audio else None

    parsed_options = []

    for target in quality_targets:
        matching = []
        for f in raw_formats:
            if f.get('vcodec') == 'none':
                continue
            h = f.get('height') or 0
            w = f.get('width') or 0
            eff_h = max(h, w) if is_vertical else h
            note = (f.get('format_note') or '').lower()
            res = (f.get('resolution') or '').lower()

            if target['label'] == '4K':
                if eff_h >= 2160 or w >= 3840 or '2160p' in note or '4k' in note or '3840x' in res:
                    matching.append(f)
            elif target['label'] == '2K':
                if (1440 <= eff_h < 2160) or (2560 <= w < 3840) or '1440p' in note or '2k' in note:
                    matching.append(f)
            elif target['label'] == '1080p':
                if (1080 <= eff_h < 1440) or (1920 <= w < 2560) or '1080p' in note or '1080' in res:
                    matching.append(f)
            elif target['label'] == '720p':
                if (720 <= eff_h < 1080) or (1280 <= w < 1920) or '720p' in note:
                    matching.append(f)
            elif target['label'] == '480p':
                if (480 <= eff_h < 720) or (854 <= w < 1280) or '480p' in note:
                    matching.append(f)
            elif target['label'] == '360p':
                if (360 <= eff_h < 480) or (640 <= w < 854) or '360p' in note:
                    matching.append(f)

        if matching:
            best_match = sorted(
                matching,
                key=lambda f: (f.get('tbr') or f.get('vbr') or 0),
                reverse=True
            )[0]

            has_audio = best_match.get('acodec') != 'none'
            requires_merge = not has_audio

            # Format selector for yt-dlp
            raw_format_id = str(best_match.get('format_id') or target['label'])
            if requires_merge:
                if target['label'] == '4K':
                    format_id = f"{raw_format_id}+140/{raw_format_id}+ba/bestvideo[height>=2160]+bestaudio/best"
                elif target['label'] == '2K':
                    format_id = f"{raw_format_id}+140/{raw_format_id}+ba/bestvideo[height>=1440]+bestaudio/best"
                elif target['label'] == '1080p':
                    format_id = f"{raw_format_id}+140/{raw_format_id}+ba/bestvideo[height>=1080]+bestaudio/best"
                else:
                    format_id = f"{raw_format_id}+ba/best"
            else:
                format_id = raw_format_id

            video_size = best_match.get('filesize') or best_match.get('filesize_approx') or 0
            if not video_size and duration > 0 and best_match.get('tbr'):
                video_size = int((best_match['tbr'] * 1024 * duration) / 8)

            audio_size = 0
            if requires_merge and best_audio_stream:
                audio_size = best_audio_stream.get('filesize') or best_audio_stream.get('filesize_approx') or 0
                if not audio_size and duration > 0 and best_audio_stream.get('abr'):
                    audio_size = int((best_audio_stream['abr'] * 1024 * duration) / 8)

            total_size = video_size + audio_size

            parsed_options.append({
                'formatId': format_id,
                'qualityLabel': target['label'],
                'resolution': target['name'],
                'ext': 'mp4',
                'fps': best_match.get('fps'),
                'filesizeApprox': total_size if total_size > 0 else None,
                'filesizeFormatted': format_bytes(total_size) if total_size > 0 else 'Estimated at download',
                'filesize': total_size if total_size > 0 else None,
                'hasAudio': True,
                'requiresMerge': requires_merge,
                'vcodec': best_match.get('vcodec'),
                'acodec': best_match.get('acodec') or (best_audio_stream.get('acodec') if best_audio_stream else 'aac'),
                'width': best_match.get('width'),
                'height': best_match.get('height'),
            })

    # Audio option
    if best_audio_stream:
        a_size = best_audio_stream.get('filesize') or best_audio_stream.get('filesize_approx') or 0
        if not a_size and duration > 0 and best_audio_stream.get('abr'):
            a_size = int((best_audio_stream['abr'] * 1024 * duration) / 8)

        parsed_options.append({
            'formatId': 'ba/b',
            'qualityLabel': 'Audio Only',
            'resolution': f"{int(best_audio_stream.get('abr'))} kbps Audio" if best_audio_stream.get('abr') else 'High Quality Audio',
            'ext': 'mp3',
            'filesizeApprox': a_size if a_size > 0 else None,
            'filesizeFormatted': format_bytes(a_size) if a_size > 0 else 'Estimated at download',
            'filesize': a_size if a_size > 0 else None,
            'hasAudio': True,
            'requiresMerge': False,
            'acodec': best_audio_stream.get('acodec') or 'mp3',
        })

    # Fallback if no specific resolution buckets matched
    if not parsed_options and raw_formats:
        parsed_options.append({
            'formatId': 'b',
            'qualityLabel': '720p',
            'resolution': 'Standard Best',
            'ext': 'mp4',
            'hasAudio': True,
            'requiresMerge': True,
            'filesizeFormatted': 'Calculated at download',
        })

    return {
        'id': raw.get('id', ''),
        'title': raw.get('title', 'Untitled Video'),
        'description': raw.get('description'),
        'thumbnail': raw.get('thumbnail'),
        'duration': duration,
        'durationFormatted': format_duration(duration),
        'uploader': raw.get('uploader') or 'Unknown Author',
        'uploaderUrl': raw.get('uploader_url'),
        'viewCount': raw.get('view_count'),
        'originalUrl': video_url,
        'isVertical': is_vertical,
        'aspectRatio': aspect_ratio,
        'license': raw.get('license'),
        'formats': parsed_options,
    }


class handler(BaseHTTPRequestHandler):
    """
    Vercel Serverless Function HTTP Handler
    """

    def _send_json(self, status_code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, x-vercel-protection-bypass, authorization')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, x-vercel-protection-bypass, authorization')
        self.end_headers()

    def do_GET(self):
        self._send_json(200, {
            'success': True,
            'service': 'MediaVault Python Extraction Engine',
            'yt_dlp_ready': yt_dlp is not None,
        })

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0:
                self._send_json(400, {'success': False, 'error': 'Empty request body.'})
                return

            body_bytes = self.rfile.read(content_length)
            payload = json.loads(body_bytes.decode('utf-8'))
            url = payload.get('url', '').strip()

            if not url:
                self._send_json(400, {'success': False, 'error': 'A video URL is required.'})
                return

            metadata = extract_video_info(url)
            self._send_json(200, {'success': True, 'data': metadata})

        except json.JSONDecodeError:
            self._send_json(400, {'success': False, 'error': 'Invalid JSON in request.'})
        except Exception as e:
            self._send_json(422, {'success': False, 'error': str(e)})


if __name__ == '__main__':
    # CLI mode for local execution from Node.js
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python api/extract.py <video_url>\n")
        sys.exit(1)

    target_url = sys.argv[1].strip()
    try:
        result = extract_video_info(target_url)
        sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
        sys.exit(0)
    except Exception as exc:
        sys.stderr.write(str(exc) + "\n")
        sys.exit(1)
