# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json .npmrc ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-worker/package.json ./vairiot-worker/
# Prisma 7 reads the datasource from prisma.config.ts, and vairiot-api's
# postinstall runs `prisma generate`. The config therefore has to be present
# BEFORE npm install, not with the rest of the source afterwards — otherwise
# generate fails with P1012 during the install.
COPY vairiot-api/prisma ./vairiot-api/prisma/
COPY vairiot-api/prisma.config.ts ./vairiot-api/
COPY vairiot-api/package.json ./vairiot-api/

RUN --mount=type=cache,target=/root/.npm npm ci

# Compile shared package first
COPY vairiot-shared ./vairiot-shared
RUN npm run build --workspace=vairiot-shared

COPY vairiot-worker ./vairiot-worker
RUN npm run build --workspace=vairiot-worker

# ---- Runtime image ----
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json .npmrc ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-worker/package.json ./vairiot-worker/
COPY vairiot-api/prisma ./vairiot-api/prisma/
COPY vairiot-api/prisma.config.ts ./vairiot-api/
COPY vairiot-api/package.json ./vairiot-api/

RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace=vairiot-worker

# Copy generated Prisma client from builder (postinstall ran during builder's full npm install)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/vairiot-shared/dist ./vairiot-shared/dist
COPY --from=builder /app/vairiot-shared/package.json ./vairiot-shared/
COPY --from=builder /app/vairiot-worker/dist ./vairiot-worker/dist

WORKDIR /app/vairiot-worker
CMD ["node", "dist/index.js"]
