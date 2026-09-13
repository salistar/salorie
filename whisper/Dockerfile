# faster-whisper CPU (int8) — le modèle est PRÉ-TÉLÉCHARGÉ au build (démarrage instantané).
FROM python:3.11-slim
ENV HF_HOME=/models PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir faster-whisper fastapi "uvicorn[standard]"
ARG WHISPER_MODEL=small
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"
COPY app.py /app.py
EXPOSE 9000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9000"]
