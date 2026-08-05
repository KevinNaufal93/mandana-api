# ─── Stage 1: Install deps ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Stage 3: Runtime (slim) ──────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Non-root user for least-privilege
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Production deps only
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=build /app/dist ./dist

USER appuser

EXPOSE 3000
CMD ["node", "dist/main"]
