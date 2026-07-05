# Service de transcription faster-whisper (CPU int8) — vocal → texte pour le
# logging vocal Salorie. Beaucoup plus rapide et moins cher que Gemini audio.
import base64
import os
import tempfile

from fastapi import FastAPI
from pydantic import BaseModel
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
app = FastAPI()


class Req(BaseModel):
    audioBase64: str
    language: str | None = None  # 'fr' | 'en' | 'ar' | None (auto)


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME}


@app.post("/transcribe")
def transcribe(r: Req):
    raw = base64.b64decode(r.audioBase64)
    with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as f:
        f.write(raw)
        path = f.name
    try:
        segments, info = model.transcribe(path, language=r.language, vad_filter=True)
        text = " ".join(s.text.strip() for s in segments).strip()
        return {"text": text, "language": info.language}
    finally:
        os.unlink(path)
