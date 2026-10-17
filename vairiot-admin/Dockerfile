# syntax=docker/dockerfile:1
# Build from repo root context so the npm workspace (incl. vairiot-shared) resolves
FROM node:24-alpine AS builder
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app

COPY package*.json .npmrc ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-admin/package.json ./vairiot-admin/

RUN --mount=type=cache,target=/root/.npm npm ci

# Compile the shared package FIRST so its dist/ exists for admin to import
COPY vairiot-shared ./vairiot-shared
RUN npm run build --workspace=vairiot-shared

COPY vairiot-admin ./vairiot-admin
RUN npm run build --workspace=vairiot-admin

# Unprivileged nginx (W6, G16): runs as uid 101 and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY --from=builder /app/vairiot-admin/dist /usr/share/nginx/html
# The site is a template filled from CSP_* at start-up (G31); the defaults
# allow OpenStreetMap tiles and same-origin requests only.
COPY vairiot-admin/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV CSP_TILE_HOSTS="https://tile.openstreetmap.org" CSP_CONNECT_SRC=""
# The base image's nginx user, stated so scanners and readers can see it.
USER 101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
