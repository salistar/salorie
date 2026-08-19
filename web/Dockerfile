# Salorie admin web (Next.js)
FROM node:20-alpine AS build
WORKDIR /app

# ⚠ Le contexte de build est la RACINE du depot, pas `web/` (voir docker-compose).
# Raison : les pages de /me importent des modules de CALCUL du depot mobile —
# `lib/nutriScore`, `lib/readiness`, `lib/panierSouk`, `lib/ramadanAssiettes`,
# `lib/sadaqaCalcul` — et deux tables de `assets/data/`, au lieu d'en garder des
# copies qui divergeraient. Ces regles annoncent des chiffres a quelqu'un : un
# Nutri-Score, un score de forme, un nombre de repas finances.
#
# Ces imports s'ecrivent `../../../../lib/...` depuis `web/app/me/<page>/`, donc
# ils se resolvent a la RACINE du systeme de fichiers une fois `web/` place dans
# `/app`. D'ou les deux COPY vers `/lib` et `/assets` : ils reconstituent
# exactement l'arborescence que le build voit en local.
#
# Sans cela le build echoue sur « Module not found » — ce qui est arrive, et a
# bloque six deploiements d'affilee sans que le build local ne montre rien.
COPY web/package*.json ./
RUN npm install
COPY web/ ./
COPY lib/ /lib/
COPY assets/data/ /assets/data/
# Next.js FIGE les `NEXT_PUBLIC_*` dans le bundle au moment du build : les passer en
# `environment:` (runtime) ne les fait PAS arriver jusqu'au navigateur. Il faut donc un
# ARG de build, alimenté par `args:` dans docker-compose.yml.
ARG NEXT_PUBLIC_GMAP_KEY=""
ENV NEXT_PUBLIC_GMAP_KEY=$NEXT_PUBLIC_GMAP_KEY
# Espace personnel /me : identifiants PUBLICS de Clerk et Firebase. Ils sont deja
# dans l'APK — ce ne sont pas des secrets — mais le depot est public, donc ils
# arrivent par ARG depuis les secrets GitHub `EXPO_PUBLIC_*` de l'app mobile.
# Memes valeurs des deux cotes = meme compte utilisateur sur web et telephone.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_FIREBASE_API_KEY=""
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
ARG NEXT_PUBLIC_FIREBASE_APP_ID=""
ARG NEXT_PUBLIC_FIREBASE_TOKEN_URL=""
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_TOKEN_URL=$NEXT_PUBLIC_FIREBASE_TOKEN_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
