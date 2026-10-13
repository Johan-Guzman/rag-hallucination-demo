# syntax=docker/dockerfile:1

# Multi-stage build:
#   deps    -> install dependencies (dev + prod) once
#   dev     -> used by docker-compose for local hot reload (see docker-compose.yml)
#   builder -> compile the production bundle with `next build`
#   runner  -> default target: minimal production image started with `next start`
#
# Render builds and runs the DEFAULT (last) stage, so production is the default
# and `next dev` is only ever used through the explicit `dev` target.

# ---------------------------------------------------------------------------
# base: shared configuration
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
# deps: install all dependencies (used by both dev and builder)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# dev: local development target (hot reload). Selected by docker-compose.
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
# `next dev`, bound to all interfaces so the port is reachable from the host.
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]

# ---------------------------------------------------------------------------
# builder: produce the production bundle
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time.
# Render injects the service's environment variables as Docker build args, so
# declaring the ARG makes the dashboard value available to `next build`.
# Empty (the default) => the browser uses the same-origin /api proxy below.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

# ---------------------------------------------------------------------------
# runner: production image (default target used by Render)
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# Runtime dependencies only.
COPY package*.json ./
RUN npm ci --omit=dev
# Production build output + config. `next start` serves from .next and reads
# next.config.js (rewrites) at runtime; it does not need the application source.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.js ./next.config.js
EXPOSE 3000
# Bind to all interfaces on the port Render assigns via $PORT (fallback 3000).
CMD ["sh", "-c", "npm run start -- -H 0.0.0.0 -p ${PORT:-3000}"]
