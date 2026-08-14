# Salorie admin web (Next.js)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
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
