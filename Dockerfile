# syntax=docker/dockerfile:1.7

# ---- Stage 1: dependencies (install with build deps) ---------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Prisma engines + bcrypt require a few system libs at install time.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --include=dev


# ---- Stage 2: build (Next.js standalone) ---------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma-Client für aktuelle Schema generieren.
RUN npx prisma generate
# Next.js-Build mit "output: standalone" liefert .next/standalone + .next/static.
RUN npm run build


# ---- Stage 3: production runtime ----------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home nodejs

# Standalone-Output: kopiert nur die echten Runtime-Dependencies.
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Prisma braucht das Schema + den generierten Client zur Runtime.
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Scripts (für db:push, resync, bulk-describe) bleiben dabei.
COPY --from=builder --chown=nodejs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nodejs:nodejs /app/lib ./lib
COPY --from=builder --chown=nodejs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/dotenv ./node_modules/dotenv

USER nodejs

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3100/api/health || exit 1

CMD ["node", "server.js"]
