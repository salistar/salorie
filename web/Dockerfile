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
