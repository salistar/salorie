# Salorie food4k tier-0 — sidecar de classification d'aliments (Food-101, 91% top-1).
# Reconnaisseur RAPIDE + GRATUIT (CPU, onnxruntime int8) place AVANT la cascade VLM :
# si confiance >= seuil -> reponse directe (nom + nutrition per-100g) sans appel VLM/Gemini.
# Sinon le backend NestJS retombe sur la cascade (Cloudflare/Ollama/Groq/Gemini).
import base64, io, json, os
import numpy as np
from PIL import Image
import onnxruntime as ort
from fastapi import FastAPI
from pydantic import BaseModel

HERE = os.path.dirname(__file__)
IMG = 256
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)

classes = json.load(open(os.path.join(HERE, 'label_map.json'), encoding='utf-8'))['classes']
NUTRI = json.load(open(os.path.join(HERE, 'food101_nutrition.json'), encoding='utf-8'))
NAMES = json.load(open(os.path.join(HERE, 'food101_names_i18n.json'), encoding='utf-8'))  # {label:{en,fr,ar}}
sess = ort.InferenceSession(os.path.join(HERE, 'food4k.onnx'), providers=['CPUExecutionProvider'])
INP = sess.get_inputs()[0].name

app = FastAPI(title='salorie-food4k-tier0')


def resize_shorter(im, size):
    w, h = im.size
    if w <= h:
        nw, nh = size, max(size, int(round(h * size / w)))
    else:
        nh, nw = size, max(size, int(round(w * size / h)))
    return im.resize((nw, nh), Image.BILINEAR)


def preprocess(im):
    im = im.convert('RGB')
    im = resize_shorter(im, int(IMG * 1.14))          # cote court -> 292 (comme T.Resize)
    w, h = im.size
    l, t = (w - IMG) // 2, (h - IMG) // 2             # CenterCrop 256
    im = im.crop((l, t, l + IMG, t + IMG))
    a = np.asarray(im, np.float32) / 255.0
    a = (a - MEAN) / STD
    return np.transpose(a, (2, 0, 1))[None].astype(np.float32)


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


class Req(BaseModel):
    imageBase64: str
    lang: str = 'en'                                  # 'en' | 'fr' | 'ar' -> nom localise


@app.get('/health')
def health():
    return {'ok': True, 'classes': len(classes), 'model': 'food4k.onnx'}


@app.post('/classify')
def classify(req: Req):
    try:
        raw = req.imageBase64
        if ',' in raw[:40] and raw[:20].strip().lower().startswith('data:'):
            raw = raw.split(',', 1)[1]                # tolere le prefixe data:
        img = Image.open(io.BytesIO(base64.b64decode(raw)))
    except Exception as e:
        return {'ok': False, 'error': f'image invalide: {e}'}
    try:
        logits = sess.run(None, {INP: preprocess(img)})[0][0]
        pr = softmax(logits)
        i = int(pr.argmax())
        label = classes[i]
        n = NUTRI.get(label, {'name': label.replace('_', ' ').capitalize(), 'kcal': 0, 'p': 0, 'c': 0, 'f': 0})
        lang = (req.lang or 'en').lower()[:2]
        name = (NAMES.get(label) or {}).get(lang) or n['name']   # nom localise FR/AR, repli EN
        top5 = [{'label': classes[j], 'p': float(pr[j])} for j in pr.argsort()[-5:][::-1]]
        return {
            'ok': True, 'label': label, 'name': name, 'confidence': float(pr[i]),
            'kcal': n['kcal'], 'protein': n['p'], 'carbs': n['c'], 'fat': n['f'],
            'serving': '100 g', 'top5': top5,
        }
    except Exception as e:
        return {'ok': False, 'error': f'inference: {e}'}
