# Protein Bowl API + scheduled jobs + migration step (same image). Build context: ./server
# NOT YET BUILT OR RUN (no Docker on the author's machine): build it once in CI/your environment before relying on it.
ARG PRISMA_VERSION=6.19.3

FROM node:22-slim AS build
ARG PRISMA_VERSION
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && npm install -g prisma@${PRISMA_VERSION}
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# Build with all dependencies, drop the dev ones, THEN generate the client so it lands in the final node_modules (the prisma CLI is global here).
RUN npm run build && npm prune --omit=dev && prisma generate

FROM node:22-slim
ARG PRISMA_VERSION
WORKDIR /app
ENV NODE_ENV=production
# The prisma CLI (for `prisma migrate deploy`, run as an explicit deploy step, never at container start) and tsx (for the job scripts) are installed
# globally because `npm prune --omit=dev` removed them from the app. PRISMA_VERSION must equal the @prisma/client version in package-lock.json.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
    && npm install -g prisma@${PRISMA_VERSION} tsx@4 && useradd -r -u 10001 app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY package*.json tsconfig.json ./
USER app
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
