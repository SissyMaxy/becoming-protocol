"""
Modal worker for hypno video processing — Slice 4 (visual craft extraction).

Responsibilities:
  1. Download a hypno video via yt-dlp.
  2. Strip audio → upload MP3 to Supabase Storage bucket `hypno`.
  3. Detect cuts (ffmpeg scene detection) → editing rhythm.
  4. Dense-sample frames for OCR → every on-screen text string with the exact
     window it held. This is the measurement that makes a pacing template:
     "text holds 2.4s through the first third, 0.4s at the peak."
  5. Sparse-sample frames for JoyTag (labels) + JoyCaption (natural-language
     description of what's on screen at that moment).
  6. Call back to /api/hypno/ingest with the audio key plus the full timeline,
     so the app runs Whisper + feature extraction on the audio and persists the
     visual timeline to hypno_visual_timeline (mig 687).

WHY two sampling rates: OCR needs ~2fps to resolve a 0.5s text flash, and it's
cheap (CPU). The vision models are expensive (GPU seconds), and what's depicted
changes far slower than the text does, so 1 frame / 5s is plenty.

Deploy:
  pip install modal
  modal token new
  modal deploy scripts/hypno-worker/modal_worker.py

Invoke (from /api/hypno/ingest-url):
  POST https://<your-modal-endpoint>.modal.run/process
  Body: { user_jwt, source_url, title?, creator? }

Env vars (set via `modal secret create` — name: "hypno-worker-secrets"):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  APP_INGEST_URL        # e.g. https://your-vercel-app.vercel.app/api/hypno/ingest
"""

import io
import os
import re
import subprocess
import tempfile
import uuid
from typing import Optional

import modal

# ── Image definition ─────────────────────────────────────────────────
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "libgl1", "libglib2.0-0")
    .pip_install(
        "yt-dlp",
        "supabase==2.7.4",
        "requests",
        "pillow",
        "numpy",
        "torch",
        "transformers",
        "accelerate",
        "onnxruntime-gpu",
        "huggingface_hub",
        "easyocr",
    )
)

app = modal.App("hypno-worker", image=image)

JOYTAG_REPO = "fancyfeast/joytag"
# JoyCaption is purpose-built to caption imagery that general-purpose VLMs
# refuse. Same author as JoyTag. Swap the repo for any other local VLM — the
# only contract is (image bytes) -> (str).
JOYCAPTION_REPO = os.environ.get(
    "JOYCAPTION_REPO", "fancyfeast/llama-joycaption-beta-one-hf-llava"
)

OCR_FPS = 2.0            # text-resolution sampling (CPU, cheap)
VISION_INTERVAL_SEC = 5  # tag/caption sampling (GPU, expensive)
SCENE_THRESHOLD = 0.35   # ffmpeg scene-change sensitivity


# ── Vision models (loaded once per container) ────────────────────────
@app.cls(gpu="A10G", timeout=1800, secrets=[modal.Secret.from_name("hypno-worker-secrets")])
class Vision:
    @modal.enter()
    def load(self):
        from huggingface_hub import snapshot_download
        import onnxruntime as ort

        path = snapshot_download(repo_id=JOYTAG_REPO)
        self.session = ort.InferenceSession(
            os.path.join(path, "model.onnx"),
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        with open(os.path.join(path, "top_tags.txt"), "r") as f:
            self.labels = [ln.strip() for ln in f.readlines() if ln.strip()]

        # Captioner is optional — if it fails to load we still get tags and the
        # run degrades instead of dying. Descriptions are the nice-to-have;
        # the timing data is what generation actually needs.
        self.captioner = None
        try:
            import torch
            from transformers import AutoProcessor, LlavaForConditionalGeneration

            self.cap_processor = AutoProcessor.from_pretrained(JOYCAPTION_REPO)
            self.captioner = LlavaForConditionalGeneration.from_pretrained(
                JOYCAPTION_REPO, torch_dtype=torch.bfloat16, device_map="cuda:0"
            ).eval()
        except Exception as e:  # noqa: BLE001
            print(f"[vision] captioner unavailable, tags only: {e}")

    @modal.method()
    def analyze_frame(self, frame_bytes: bytes, threshold: float = 0.4) -> dict:
        """Tag + caption one frame."""
        from PIL import Image
        import numpy as np

        img = Image.open(io.BytesIO(frame_bytes)).convert("RGB")

        arr = np.asarray(img.resize((448, 448)), dtype=np.float32) / 255.0
        arr = arr.transpose(2, 0, 1)[None]
        out = self.session.run(None, {"input": arr})[0][0]
        tags = [self.labels[i] for i, p in enumerate(out) if p > threshold]

        caption = None
        if self.captioner is not None:
            try:
                import torch

                convo = [
                    {
                        "role": "user",
                        "content": "<image>\nDescribe this frame: subject, framing, "
                        "camera distance, lighting, color, and any on-screen text.",
                    }
                ]
                prompt = self.cap_processor.apply_chat_template(
                    convo, tokenize=False, add_generation_prompt=True
                )
                inputs = self.cap_processor(
                    text=[prompt], images=[img], return_tensors="pt"
                ).to("cuda:0")
                inputs["pixel_values"] = inputs["pixel_values"].to(torch.bfloat16)
                with torch.no_grad():
                    gen = self.captioner.generate(
                        **inputs, max_new_tokens=120, do_sample=False
                    )[0]
                caption = self.cap_processor.tokenizer.decode(
                    gen[inputs["input_ids"].shape[1]:], skip_special_tokens=True
                ).strip()
            except Exception as e:  # noqa: BLE001
                print(f"[vision] caption failed: {e}")

        return {"tags": tags, "caption": caption}


# ── Helpers ──────────────────────────────────────────────────────────
def _probe_duration(video_path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def _detect_cuts(video_path: str) -> list[float]:
    """Cut timestamps via ffmpeg scene detection → the editing rhythm."""
    proc = subprocess.run(
        ["ffmpeg", "-i", video_path, "-filter:v",
         f"select='gt(scene,{SCENE_THRESHOLD})',showinfo", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return [
        round(float(m), 3)
        for m in re.findall(r"pts_time:([0-9.]+)", proc.stderr or "")
    ]


def _ocr_timeline(frames_dir: str, fps: float) -> list[dict]:
    """
    OCR every densely-sampled frame, then collapse consecutive identical reads
    into single events with a start and an end.

    The collapse is the whole point: six consecutive frames at 2fps carrying the
    same string is ONE line that held for three seconds — which is the number a
    pacing template needs, not six separate sightings.
    """
    import easyocr

    reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    frame_files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".jpg"))

    raw: list[tuple[float, str]] = []
    for idx, fn in enumerate(frame_files):
        t = idx / fps
        try:
            found = reader.readtext(os.path.join(frames_dir, fn), detail=0)
        except Exception:  # noqa: BLE001
            found = []
        text = " ".join(s.strip() for s in found if s and s.strip())
        raw.append((round(t, 3), re.sub(r"\s+", " ", text).strip().lower()))

    events: list[dict] = []
    current: Optional[dict] = None
    for t, text in raw:
        if not text:
            if current:
                current["t_end_s"] = round(t, 3)
                events.append(current)
                current = None
            continue
        if current and current["value"] == text:
            continue
        if current:
            current["t_end_s"] = round(t, 3)
            events.append(current)
        current = {"value": text, "t_start_s": t, "t_end_s": None}
    if current:
        current["t_end_s"] = round(raw[-1][0] + 1 / fps, 3)
        events.append(current)

    return [e for e in events if (e["t_end_s"] or 0) > e["t_start_s"]]


def _curves(duration: float, cuts: list[float], text_events: list[dict]) -> dict:
    """
    Roll the raw timeline into decile curves — the portable template.

    Everything is normalized to position 0-1, so a 6-minute file and an
    18-minute file can be compared, averaged, and used as one template.
    """
    deciles = [
        {"decile": i, "cuts": 0, "text_events": 0, "text_hold_total": 0.0, "words": 0}
        for i in range(10)
    ]
    if duration <= 0:
        return {"deciles": deciles}

    for t in cuts:
        d = min(9, int((t / duration) * 10))
        deciles[d]["cuts"] += 1

    for e in text_events:
        d = min(9, int((e["t_start_s"] / duration) * 10))
        hold = (e["t_end_s"] or e["t_start_s"]) - e["t_start_s"]
        deciles[d]["text_events"] += 1
        deciles[d]["text_hold_total"] += hold
        deciles[d]["words"] += len(e["value"].split())

    for d in deciles:
        d["avg_text_hold_s"] = (
            round(d["text_hold_total"] / d["text_events"], 2) if d["text_events"] else None
        )
        d["cuts_per_min"] = round(d["cuts"] / max(0.0001, duration / 10 / 60), 1)
        del d["text_hold_total"]

    return {"deciles": deciles}


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
    user_id = sb.auth.get_user(user_jwt).user.id

    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, "video.mp4")
        audio_path = os.path.join(tmp, "audio.mp3")

        subprocess.run(
            ["yt-dlp",
             "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
             "-o", video_path, "--merge-output-format", "mp4", source_url],
            check=True, capture_output=True,
        )

        duration = _probe_duration(video_path)

        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "libmp3lame",
             "-b:a", "96k", audio_path],
            check=True, capture_output=True,
        )
        audio_key = f"{user_id}/{uuid.uuid4()}.mp3"
        with open(audio_path, "rb") as f:
            sb.storage.from_("hypno").upload(
                audio_key, f.read(), {"content-type": "audio/mpeg"}
            )

        # ── Cuts ──
        cuts = _detect_cuts(video_path)

        # ── Dense frames → OCR ──
        ocr_dir = os.path.join(tmp, "ocr")
        os.makedirs(ocr_dir, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-i", video_path, "-vf", f"fps={OCR_FPS}",
             os.path.join(ocr_dir, "f_%05d.jpg")],
            check=True, capture_output=True,
        )
        text_events = _ocr_timeline(ocr_dir, OCR_FPS)

        # ── Sparse frames → tags + captions ──
        vis_dir = os.path.join(tmp, "vis")
        os.makedirs(vis_dir, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-i", video_path, "-vf", f"fps=1/{VISION_INTERVAL_SEC}",
             os.path.join(vis_dir, "v_%04d.jpg")],
            check=True, capture_output=True,
        )
        vision = Vision()
        vision_samples: list[dict] = []
        tag_counts: dict[str, int] = {}
        vis_files = sorted(f for f in os.listdir(vis_dir) if f.endswith(".jpg"))
        for idx, fn in enumerate(vis_files):
            with open(os.path.join(vis_dir, fn), "rb") as f:
                res = vision.analyze_frame.remote(f.read())
            vision_samples.append({
                "t_start_s": round(idx * VISION_INTERVAL_SEC, 3),
                "tags": res.get("tags", []),
                "caption": res.get("caption"),
            })
            for tag in res.get("tags", []):
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

        total_vis = max(1, len(vis_files))
        vision_tags = [
            {"tag": t, "frame_count": c, "prevalence": round(c / total_vis, 2)}
            for t, c in sorted(tag_counts.items(), key=lambda kv: -kv[1])
            if c / total_vis >= 0.2
        ][:50]

    payload = {
        "storagePath": audio_key,
        "title": title,
        "creator": creator,
        "durationS": round(duration, 2),
        "visionTags": vision_tags,
        "timeline": {
            "cuts": cuts,
            "textEvents": text_events,
            "visionSamples": vision_samples,
        },
        "curves": _curves(duration, cuts, text_events),
    }

    resp = requests.post(
        os.environ["APP_INGEST_URL"],
        headers={"Authorization": f"Bearer {user_jwt}", "Content-Type": "application/json"},
        json=payload,
        timeout=300,
    )
    resp.raise_for_status()
    return {
        "ok": True,
        "audioKey": audio_key,
        "durationS": round(duration, 2),
        "cutCount": len(cuts),
        "textEventCount": len(text_events),
        "visionSampleCount": len(vision_samples),
        "ingestResponse": resp.json(),
    }
