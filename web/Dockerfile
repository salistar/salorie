# Salorie admin web (Next.js)
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
FROM node:22-alpine AS build
# ⚠ `web/` VIT DANS `/app/web`, ET CE N'EST PAS COSMETIQUE.
# Le contexte de build est la RACINE du depot, pas `web/` (voir docker-compose).
# Raison : les pages de /me importent des modules de CALCUL du depot mobile —
# `lib/nutriScore`, `lib/readiness`, `lib/panierSouk`, `lib/ramadanAssiettes`,
# `lib/sadaqaCalcul` — et deux tables de `assets/data/`, au lieu d'en garder des
# copies qui divergeraient. Ces regles annoncent des chiffres a quelqu'un : un
# Nutri-Score, un score de forme, un nombre de repas finances.
#
# Ces imports s'ecrivent `../../../../lib/...` depuis `web/app/me/<page>/`.
# Jusqu'au 10/09/2026, `web/` etait pose dans `/app` et ces chemins se
# resolvaient a la RACINE DU SYSTEME DE FICHIERS — d'ou d'anciens `COPY` vers
# `/lib` et `/assets`. Ca marchait par coincidence, et Next 16 y a mis fin :
# Turbopack ne resout rien hors de la racine du projet (cf. l'entete de
# `next.config.mjs`, qui la fixe au parent de `web/`).
#
# L'arbre reproduit donc maintenant CELUI DU DEPOT : `/app/web`, `/app/lib`,
# `/app/assets/data`. Le build voit exactement ce qu'il voit en local.
#
# Sans cela le build echoue sur « Module not found » — ce qui est arrive, et a
# bloque six deploiements d'affilee sans que le build local ne montre rien.
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
COPY lib/ /app/lib/
COPY assets/data/ /app/assets/data/
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

FROM node:22-alpine
# ⚠ LE MEME CHEMIN ABSOLU QUE L'ETAGE DE BUILD, ET CE N'EST PAS NEGOCIABLE.
# Next 16 depose dans `.next/node_modules/` des liens symboliques ABSOLUS vers
# les paquets qu'il externalise — `firebase-admin`, `mongoose`,
# `require-in-the-middle`, `import-in-the-middle` — sous des noms haches
# (`require-in-the-middle-0b638d63113f337b`). Ces liens pointent vers le chemin
# qu'avait `node_modules` AU MOMENT DU BUILD.
#
# Servir le meme `.next` depuis un autre chemin les fait donc pendre dans le
# vide. Constate le 10/09/2026 : l'image se construisait, le conteneur
# demarrait, et TOUTE page rendait 500 —
# « An error occurred while loading the instrumentation hook:
#   Cannot find module 'require-in-the-middle-0b638d63113f337b' ».
#
# Le meme `.next` servi depuis `/app/web` en local repondait 200 : c'est une
# panne que seul le conteneur peut montrer, et elle survit au deploiement vert.
WORKDIR /app/web
ENV NODE_ENV=production
# L'image finale n'a plus besoin de `lib/` ni de `assets/` : leur contenu est
# deja compile dans `.next`.
COPY --from=build /app/web/.next ./.next
COPY --from=build /app/web/node_modules ./node_modules
COPY --from=build /app/web/package.json ./package.json
COPY --from=build /app/web/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
