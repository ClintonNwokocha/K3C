# Product image for the frontend (ksccc-frontend). Multi-stage: build the
# Vite bundle with Node, then serve the static output from an unprivileged
# Nginx image — this container only serves the SPA (see frontend/nginx.conf);
# it does not act as a reverse proxy or gateway. Build-time VITE_* args are
# intentionally not hard-coded to any host/IP — the deploying infrastructure
# supplies them so the same image definition works for any environment.

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ARG VITE_MAPBOX_TOKEN=
ARG VITE_PUBLIC_DEMO_MODE=full
ARG VITE_ANALYTICS_ENABLED=false
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN} \
    VITE_PUBLIC_DEMO_MODE=${VITE_PUBLIC_DEMO_MODE} \
    VITE_ANALYTICS_ENABLED=${VITE_ANALYTICS_ENABLED}

RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
