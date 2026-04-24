"""
Modal worker for hypno video processing — Slice 3.

Responsibilities:
  1. Download a YouTube / Twitter / Reddit / direct-URL hypno video via yt-dlp.
  2. Strip audio → upload MP3 to Supabase Storage bucket `hypno`.
  3. Sample frames every 5s, run JoyTag (adult-content-tolerant vision tagger),
     aggregate tags across frames, upload a tags.json alongside the audio.
  4. Call back to the app's /api/hypno/ingest endpoint with { storagePath, visionTags }
     so the existing ingest pipeline (Whisper + feature extraction) runs on the audio
     and the vision tags get merged into hypno_features as feature_type='visual_tag'.

Deploy:
  pip install modal
  modal token new
  modal deploy scripts/hypno-worker/modal_worker.py

Invoke (from /api/hypno/ingest-url fronting endpoint, which you'll create):
  POST https://<your-modal-endpoint>.modal.run/process
  Body: { user_jwt, source_url, title?, creator? }

Env vars (set via `modal secret create` — name: "hypno-worker-secrets"):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  APP_INGEST_URL        # e.g. https://your-vercel-app.vercel.app/api/hypno/ingest
"""

import io
import json
import os
import subprocess
import tempfile
import uuid
from typing import Optional

import modal

# ── Image definition ─────────────────────────────────────────────────
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "yt-dlp",
        "supabase==2.7.4",
        "requests",
        "pillow",
        "torch",
        "transformers",
        "onnxruntime",
        "huggingface_hub",
    )
)

app = modal.App("hypno-worker", image=image)

JOYTAG_REPO = "fancyfeast/joytag"  # small vision tagger, adult-content-tolerant
FRAME_INTERVAL_SEC = 5


# ── JoyTag model loading (cached on container) ───────────────────────
@app.cls(gpu="T4", timeout=600, secrets=[modal.Secret.from_name("hypno-worker-secrets")])
class Tagger:
    def __enter__(self):
        """Load the tagger once per container."""
        from huggingface_hub import snapshot_download
        import onnxruntime as ort
        import json as _json

        path = snapshot_download(repo_id=JOYTAG_REPO)
        self.session = ort.InferenceSession(
            os.path.join(path, "model.onnx"),
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        with open(os.path.join(path, "top_tags.txt"), "r") as f:
            self.labels = [ln.strip() for ln in f.readlines() if ln.strip()]

    @modal.method()
    def tag_frame(self, frame_bytes: bytes, threshold: float = 0.4) -> list[str]:
        """Run a single frame through JoyTag, return tags above threshold."""
        from PIL import Image
        import numpy as np

        img = Image.open(io.BytesIO(frame_bytes)).convert("RGB").resize((448, 448))
        arr = np.asarray(img, dtype=np.float32) / 255.0
        arr = arr.transpose(2, 0, 1)[None]
        out = self.session.run(None, {"input": arr})[0][0]
        return [self.labels[i] for i, p in enumerate(out) if p > threshold]


# ── Main processing entry point ──────────────────────────────────────
@app.function(
    timeout=3600,
    secrets=[modal.Secret.from_name("hypno-worker-secrets")],
    image=image,
)
@modal.web_endpoint(method="POST")
def process(body: dict):
    import requests
    from supabase import create_client

    user_jwt: str = body["user_jwt"]
    source_url: str = body["source_url"]
    title: Optional[str] = body.get("title")
    creator: Optional[str] = body.get("creator")

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # Identify the user from the JWT for storage path scoping + RLS
    user_resp = sb.auth.get_user(user_jwt)
    user_id = user_resp.user.id

    # 1. Download video + strip audio via yt-dlp
    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, "video.mp4")
        audio_path = os.path.join(tmp, "audio.mp3")

        subprocess.run(
            [
                "yt-dlp",
                "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
                "-o", video_path,
                "--merge-output-format", "mp4",
                source_url,
            ],
            check=True,
            capture_output=True,
        )

        # Extract audio
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "libmp3lame", "-b:a", "96k", audio_path],
            check=True,
            capture_output=True,
        )

        # Upload audio to Supabase Storage
        audio_key = f"{user_id}/{uuid.uuid4()}.mp3"
        with open(audio_path, "rb") as f:
            sb.storage.from_("hypno").upload(
                audio_key,
                f.read(),
                {"content-type": "audio/mpeg"},
            )

        # 2. Sample frames every FRAME_INTERVAL_SEC
        frames_dir = os.path.join(tmp, "frames")
        os.makedirs(frames_dir, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-i", video_path, "-vf", f"fps=1/{FRAME_INTERVAL_SEC}", os.path.join(frames_dir, "f_%04d.jpg")],
            check=True,
            capture_output=True,
        )

        # 3. Tag frames and aggregate
        tagger = Tagger()
        tag_counts: dict[str, int] = {}
        frame_files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".jpg"))
        for fn in frame_files:
            with open(os.path.join(frames_dir, fn), "rb") as f:
                frame_bytes = f.read()
            for t in tagger.tag_frame.remote(frame_bytes):
                tag_counts[t] = tag_counts.get(t, 0) + 1

        # Keep tags that appear in >= 20% of frames (signal, not noise)
        total_frames = max(1, len(frame_files))
        vision_tags = [
            {"tag": t, "frame_count": c, "prevalence": round(c / total_frames, 2)}
            for t, c in sorted(tag_counts.items(), key=lambda kv: -kv[1])
            if c / total_frames >= 0.2
        ][:50]

    # 4. Call back to app ingest endpoint with the audio storage key + vision tags
    resp = requests.post(
        os.environ["APP_INGEST_URL"],
        headers={
            "Authorization": f"Bearer {user_jwt}",
            "Content-Type": "application/json",
        },
        json={
            "storagePath": audio_key,
            "title": title,
            "creator": creator,
            "visionTags": vision_tags,
        },
        timeout=120,
    )
    resp.raise_for_status()
    return {
        "ok": True,
        "audioKey": audio_key,
        "frameCount": total_frames,
        "visionTags": vision_tags,
        "ingestResponse": resp.json(),
    }
