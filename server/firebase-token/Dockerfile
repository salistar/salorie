# Clerk -> Firebase token endpoint — production image.
# ⚠ NODE 22 DEPUIS LE 13/09/2026 : Node 20 est en fin de vie depuis avril 2026,
# donc sans correctif de securite. Ce service frappe les jetons Firebase qui
# ouvrent l'espace /me et l'application mobile — c'est le dernier endroit ou
# laisser tourner un runtime qui n'est plus entretenu.
# `firebase-admin` reste en 13 ici, volontairement : voir le README.
FROM node:22-alpine

WORKDIR /app

# Install only production deps first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# App source (standalone server is the entrypoint).
COPY standalone-server.mjs ./

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Lightweight healthcheck against /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/health || exit 1

CMD ["node", "standalone-server.mjs"]
