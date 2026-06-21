# Build from repo root context so the npm workspace (incl. vairiot-shared) resolves
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

# Root manifests + each workspace's package.json for a workspace-aware install
COPY package*.json ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-api/package.json ./vairiot-api/

# Prisma schema must be present before install (postinstall runs prisma generate)
COPY vairiot-api/prisma ./vairiot-api/prisma/

RUN npm install

# Shared source + api source, then build just the api workspace
COPY vairiot-shared ./vairiot-shared
COPY vairiot-api ./vairiot-api
RUN npm run build --workspace=vairiot-api

# ---- Runtime image ----
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-api/package.json ./vairiot-api/
COPY vairiot-api/prisma ./vairiot-api/prisma/

RUN npm install --omit=dev --workspace=vairiot-api

# Shared source (consumed as raw TS) + compiled api output
COPY vairiot-shared ./vairiot-shared
COPY --from=builder /app/vairiot-api/dist ./vairiot-api/dist

WORKDIR /app/vairiot-api
EXPOSE 3001
CMD ["node", "dist/index.js"]
