FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-worker/package.json ./vairiot-worker/
COPY vairiot-api/prisma ./vairiot-api/prisma/
COPY vairiot-api/package.json ./vairiot-api/

RUN npm install

# Compile shared package first
COPY vairiot-shared ./vairiot-shared
RUN npm run build --workspace=vairiot-shared

COPY vairiot-worker ./vairiot-worker
RUN npm run build --workspace=vairiot-worker

# ---- Runtime image ----
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-worker/package.json ./vairiot-worker/
COPY vairiot-api/prisma ./vairiot-api/prisma/
COPY vairiot-api/package.json ./vairiot-api/

RUN npm install --omit=dev --workspace=vairiot-worker

COPY --from=builder /app/vairiot-shared/dist ./vairiot-shared/dist
COPY --from=builder /app/vairiot-shared/package.json ./vairiot-shared/
COPY --from=builder /app/vairiot-worker/dist ./vairiot-worker/dist

WORKDIR /app/vairiot-worker
CMD ["node", "dist/index.js"]
