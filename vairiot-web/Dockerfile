# Build from repo root context so the npm workspace (incl. vairiot-shared) resolves
FROM node:22-alpine AS builder
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app

# Copy root manifests + every workspace's package.json for a workspace-aware install
COPY package*.json ./
COPY vairiot-shared/package.json ./vairiot-shared/
COPY vairiot-web/package.json ./vairiot-web/

# Install all workspace dependencies (links vairiot-shared locally)
RUN npm install

# Bring in the shared package source and the web app source
COPY vairiot-shared ./vairiot-shared
COPY vairiot-web ./vairiot-web

# Build just the web workspace
RUN npm run build --workspace=vairiot-web

FROM nginx:alpine
COPY --from=builder /app/vairiot-web/dist /usr/share/nginx/html
COPY vairiot-web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
