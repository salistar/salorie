# Salorie backend (NestJS)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
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
