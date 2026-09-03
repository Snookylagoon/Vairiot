# Build from repo root context so the npm workspace (incl. vairiot-shared) resolves
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-api/package.json ./vairiot-api/
# Prisma 7 reads the datasource from prisma.config.ts, and vairiot-api's
# postinstall runs `prisma generate`. The config therefore has to be present
# BEFORE npm install, not with the rest of the source afterwards — otherwise
# generate fails with P1012 during the install.
COPY vairiot-api/prisma ./vairiot-api/prisma/
COPY vairiot-api/prisma.config.ts ./vairiot-api/

RUN npm install

# Compile the shared package first so its dist/ exists for api to import
COPY vairiot-shared ./vairiot-shared
RUN npm run build --workspace=vairiot-shared

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
COPY vairiot-api/prisma.config.ts ./vairiot-api/

RUN npm install --omit=dev --workspace=vairiot-api

# Bring in the COMPILED shared output (dist) + compiled api output
COPY --from=builder /app/vairiot-shared/dist ./vairiot-shared/dist
COPY --from=builder /app/vairiot-shared/package.json ./vairiot-shared/
COPY --from=builder /app/vairiot-api/dist ./vairiot-api/dist

WORKDIR /app/vairiot-api
EXPOSE 3001
CMD ["node", "dist/index.js"]
