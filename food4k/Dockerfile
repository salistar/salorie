FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Le modele servi est desormais food_salorie.tflite — 4,6 Mo, DANS le depot. Plus rien
# a telecharger au build : l'ancien food4k.onnx pesait 212 Mo, au-dela de la limite de
# GitHub, ce qui obligeait a le tirer d'une Release. Il est exclu de l'image par
# .dockerignore, mais reste publie en Release food4k-v1 pour l'historique.
COPY . .

# Controle a la construction : une image sans modele ne doit pas partir en production.
RUN python -c "import os,sys; s=os.path.getsize('food_salorie.tflite'); print('modele:', s, 'octets'); sys.exit(0 if s > 4_000_000 else 1)"

EXPOSE 8000
# 1 worker suffit (CPU) ; augmenter si besoin de debit.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
