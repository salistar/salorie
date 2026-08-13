FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Le contexte de build sur srv3 contient deja food4k.onnx (212 Mo) ; un clone git nu,
# non — le fichier depasse la limite de 100 Mo de GitHub et reste hors du depot.
# `COPY . .` prend donc le modele quand il est la, et le RUN suivant le recupere quand
# il manque. Les deux chemins produisent la meme image.
#
# Avant le 13 aout 2026 le .onnx n'existait QUE sur srv3 : perdre le serveur emportait
# le tier-0 gratuit du scan d'aliments. La Release rend la reconstruction possible.
COPY . .
ARG MODEL_URL=https://github.com/salistar/salorie/releases/download/food4k-v1/food4k.onnx
RUN if [ ! -f food4k.onnx ]; then \
      apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
      curl -fsSL --retry 3 -o food4k.onnx "$MODEL_URL" && \
      apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*; \
    fi && \
    python -c "import os,sys; s=os.path.getsize('food4k.onnx'); print('modele:', s, 'octets'); sys.exit(0 if s > 2e8 else 1)"

EXPOSE 8000
# 1 worker suffit (onnxruntime CPU) ; augmenter si besoin de debit.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
