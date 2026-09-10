# ⚠ NODE 22, ET CE N'EST PAS UN CAPRICE DE VERSION.
# `firebase-admin` 14 declare `engines: { node: ">=22" }`. La 12 tirait une
# chaine de huit alertes (firestore, storage, google-gax, retry-request,
# teeny-request, uuid...) ; la 13 n'en coupait aucune. Passer a la 14 entraine
# donc Node avec elle.
# Et ca tombe bien : Node 20 est en FIN DE VIE depuis avril 2026. Ces conteneurs
# tournaient sur un runtime qui ne recoit plus de correctif de securite — un
# probleme plus serieux que celui qu'on cherchait a fermer.
# `web/__tests__/socleNode.test.ts` et `backend/src/socle-node.spec.ts` refusent
# que ce chiffre et celui de `engines` divergent.
# Salorie backend (NestJS)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY data ./data
# S-fix : ne pas tourner en root. L'image node:alpine fournit l'utilisateur `node`
# (uid 1000) ; les fichiers copiés (dist/data) sont lisibles (aucune écriture locale —
# l'état vit dans Firestore/Mongo/Redis/MinIO).
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
