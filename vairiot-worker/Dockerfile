# Build from repo root context for workspace-aware install
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
COPY vairiot-worker/package.json ./vairiot-worker/

# Prisma schema needed: worker uses @prisma/client (postinstall generates it)
COPY vairiot-api/prisma ./vairiot-api/prisma/
COPY vairiot-api/package.json ./vairiot-api/

RUN npm install

COPY vairiot-worker ./vairiot-worker
RUN npm run build --workspace=vairiot-worker

# ---- Runtime image ----
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
COPY vairiot-worker/package.json ./vairiot-worker/
COPY vairiot-api/prisma ./vairiot-api/prisma/
COPY vairiot-api/package.json ./vairiot-api/

RUN npm install --omit=dev --workspace=vairiot-worker

COPY --from=builder /app/vairiot-worker/dist ./vairiot-worker/dist

WORKDIR /app/vairiot-worker
CMD ["node", "dist/index.js"]
