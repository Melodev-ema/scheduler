# Image de production : `next build` en sortie standalone, servie par le
# `server.js` minimal que Next génère. Aucune variable d'environnement n'est
# figée ici : toutes les pages sont dynamiques (nonce de la CSP) et `getEnv()`
# n'est lu qu'à la requête, donc le build n'a besoin d'aucune clé.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# `server.js` ne sert ni `public` ni `.next/static` tant qu'on ne les copie
# pas à côté de lui.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
