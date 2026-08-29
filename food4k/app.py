# Salorie food4k tier-0 — sidecar de classification d'aliments (172 classes : Food-101
# + cuisine marocaine). Reconnaisseur RAPIDE + GRATUIT (CPU, TFLite) place AVANT la cascade VLM :
# si confiance >= seuil -> reponse directe (nom + nutrition per-100g) sans appel VLM/Gemini.
# Sinon le backend NestJS retombe sur la cascade (Cloudflare/Ollama/Groq/Gemini).
import base64, io, json, os
import numpy as np
from PIL import Image
from ai_edge_litert.interpreter import Interpreter
from fastapi import FastAPI
from pydantic import BaseModel

HERE = os.path.dirname(__file__)
IMG = 256
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)

# Modele du TELEPHONE porte sur le serveur le 13 aout 2026. Le serveur tournait sur
# food4k.onnx : 101 classes Food-101, AUCUN plat marocain — il repondait `hamburger`
# devant un tagine et `cup_cakes` devant des kaab el ghazal. Le modele embarque dans
# l'app, lui, connait 172 classes dont toute la cuisine locale.
#
# Mesure sur 50 photos de plats marocains, meme seuil de confiance 0,50 :
#   ONNX 101 classes  ->  9/50 reponses directes (18%), confiance moyenne 0,287, 57,8 ms
#   TFLite 172 classes-> 41/50 reponses directes (82%), confiance moyenne 0,736, 18,6 ms
# Soit quatre fois plus de reponses gratuites, et trois fois plus vite.
#
# ⚠ CE QUE CES 82 % DISENT, ET CE QU'ILS NE DISENT PAS.
# « Reponses directes » = reponses AU-DESSUS DU SEUIL DE CONFIANCE. Ce chiffre
# mesure la COUVERTURE, pas la JUSTESSE : il dit combien de fois le modele a
# tranche, jamais combien de fois il a eu raison. Les deux sont utiles et ne se
# remplacent pas.
#
# La justesse, mesuree le 29/08/2026 contre Food-101 avec les etiquettes du jeu
# (`python valider_modele.py`) :
#   justesse globale                57,4 %  (58 plats sur 101)
#   justesse de ce qui est SERVI    71,9 %  (46 sur les 64 reponses rendues)
# Le palier tient sa place. Avant de le remplacer par un autre modele, refaire
# passer le candidat par valider_modele.py : c'est la justesse qui decide.
#
# Pretraitement DIFFERENT de l'ONNX : resize direct 224x224 et pixels BRUTS 0..255
# (le modele integre sa propre normalisation), exactement comme lib/onDeviceVision.ts.
# Passer par le pretraitement ImageNet de l'ancien modele donnerait des resultats faux
# sans lever la moindre erreur.
classes = json.load(open(os.path.join(HERE, 'label_map_172.json'), encoding='utf-8'))['classes']
# Nutrition fusionnee : 101 entrees de food101_nutrition + 70 de assets/data/local-foods.json
# (la base hors-ligne de l'app, 653 entrees FR/AR). 171 des 172 classes sont couvertes.
NUTRI = json.load(open(os.path.join(HERE, 'nutrition_172.json'), encoding='utf-8'))
NAMES = json.load(open(os.path.join(HERE, 'names_172.json'), encoding='utf-8'))  # {label:{en,fr,ar}}

_it = Interpreter(model_path=os.path.join(HERE, 'food_salorie.tflite'))
_it.allocate_tensors()
_IN, _OUT = _it.get_input_details()[0], _it.get_output_details()[0]
IMG_TFL = int(_IN['shape'][1])

app = FastAPI(title='salorie-food4k-tier0')


def resize_shorter(im, size):
    w, h = im.size
    if w <= h:
        nw, nh = size, max(size, int(round(h * size / w)))
    else:
        nh, nw = size, max(size, int(round(w * size / h)))
    return im.resize((nw, nh), Image.BILINEAR)


def preprocess_onnx(im):
    im = im.convert('RGB')
    im = resize_shorter(im, int(IMG * 1.14))          # cote court -> 292 (comme T.Resize)
    w, h = im.size
    l, t = (w - IMG) // 2, (h - IMG) // 2             # CenterCrop 256
    im = im.crop((l, t, l + IMG, t + IMG))
    a = np.asarray(im, np.float32) / 255.0
    a = (a - MEAN) / STD
    return np.transpose(a, (2, 0, 1))[None].astype(np.float32)


def preprocess(im):
    """Pretraitement de food_salorie.tflite : resize direct, pixels BRUTS 0..255, NHWC.

    Ni recadrage centre ni normalisation ImageNet — le modele integre la sienne. Le
    pretraitement de l'ancien ONNX (`preprocess_onnx` ci-dessus, conserve pour reference)
    donnerait des predictions fausses SANS erreur. Identique a lib/onDeviceVision.ts.
    """
    im = im.convert('RGB').resize((IMG_TFL, IMG_TFL), Image.BILINEAR)
    return np.asarray(im, np.float32)[None]


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


class Req(BaseModel):
    imageBase64: str
    lang: str = 'en'                                  # 'en' | 'fr' | 'ar' -> nom localise


@app.get('/health')
def health():
    return {'ok': True, 'classes': len(classes), 'model': 'food_salorie.tflite'}


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
        _it.set_tensor(_IN['index'], preprocess(img))
        _it.invoke()
        pr = np.asarray(_it.get_tensor(_OUT['index'])).ravel()
        # Le modele peut sortir des probabilites (somme 1) ou des logits selon l'export.
        # On ne normalise que si necessaire : appliquer softmax a des probabilites les
        # aplatirait et ferait passer toutes les confiances sous le seuil.
        if pr.min() < 0 or abs(float(pr.sum()) - 1.0) > 0.05:
            pr = softmax(pr)
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
