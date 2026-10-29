# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

# Sub path the app is served under, e.g. "/book/" when a reverse proxy mounts it
# there instead of at the root of a host.
ARG BASE_PATH=/

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html postcss.config.js tailwind.config.js tsconfig.json tsconfig.node.json vite.config.js ./
COPY public ./public
COPY src ./src
RUN VITE_BASE_PATH="$BASE_PATH" npm run build

FROM nginx:alpine

LABEL org.opencontainers.image.title="immich-book" \
      org.opencontainers.image.description="Create beautiful photo books from your Immich albums" \
      org.opencontainers.image.source="https://github.com/ch1bo/immich-book" \
      org.opencontainers.image.licenses="AGPL-3.0"

# The sub path is baked into the asset URLs of the build, so the site config
# rendered on start has to agree with it.
ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH

COPY docker/nginx.conf.template /etc/nginx/immich-book/nginx.conf.template
COPY docker/30-immich-book-config.sh /docker-entrypoint.d/30-immich-book-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/30-immich-book-config.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
    CMD wget --spider -q "http://localhost${BASE_PATH%/}/index.html" || exit 1
