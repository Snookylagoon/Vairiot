# Build from repo root context so the npm workspace (incl. vairiot-shared) resolves
FROM node:22-alpine AS builder
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app

COPY package*.json ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-admin/package.json ./vairiot-admin/

RUN npm install

# Compile the shared package FIRST so its dist/ exists for admin to import
COPY vairiot-shared ./vairiot-shared
RUN npm run build --workspace=vairiot-shared

COPY vairiot-admin ./vairiot-admin
RUN npm run build --workspace=vairiot-admin

FROM nginx:alpine
COPY --from=builder /app/vairiot-admin/dist /usr/share/nginx/html
COPY vairiot-admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
