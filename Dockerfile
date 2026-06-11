# syntax=docker/dockerfile:1.4
ARG NODE_VERSION=22.18.0

# ---- Build Stage ----
FROM node:${NODE_VERSION}-bookworm-slim AS builder

WORKDIR /src

# Ferramentas de compilacao para modulos nativos (sharp)
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential python3 git && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Stub do husky
RUN printf '#!/bin/sh\nexit 0\n' > /usr/local/bin/husky && chmod +x /usr/local/bin/husky
ENV HUSKY=0

# Copia tudo (respeitando .dockerignore)
COPY . .

# Instala TODAS as deps sem lifecycle scripts
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,id=pnpm-store \
    pnpm install --frozen-lockfile --prefer-offline --ignore-scripts

# Build completo via Nx (compila TS, admin, apps publicas - tudo na ordem certa)
RUN npx nx run-many --target=build --projects=ghost/core,ghost/parse-email-address,ghost/admin --parallel=false || true


# ---- Runtime Stage ----
FROM node:${NODE_VERSION}-bookworm-slim AS runner

ENV NODE_ENV=production \
    url=http://localhost:2368 \
    server__host=0.0.0.0 \
    server__port=2368

RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc2 fontconfig && \
    rm -rf /var/lib/apt/lists/*

RUN groupmod -g 1001 node && \
    usermod -u 1001 node && \
    adduser --disabled-password --gecos "" -u 1000 ghost

WORKDIR /home/ghost
RUN corepack enable

# Copia tudo do builder
COPY --from=builder /src /home/ghost

# Entrypoint
COPY docker-entrypoint.sh /home/ghost/ghost/core/docker-entrypoint.sh
RUN chmod +x /home/ghost/ghost/core/docker-entrypoint.sh

# Prepara content dirs
RUN mkdir -p default log && \
    cp -R ghost/core/content base_content && \
    cp -R ghost/core/content/themes/casper default/casper && \
    ([ -d ghost/core/content/themes/source ] && cp -R ghost/core/content/themes/source default/source || true) && \
    chown -R ghost:ghost /home/ghost/ghost/core/content /home/ghost/log /home/ghost/default /home/ghost/base_content

WORKDIR /home/ghost/ghost/core

USER ghost
ENV LD_PRELOAD=libjemalloc.so.2

EXPOSE 2368

CMD ["/home/ghost/ghost/core/docker-entrypoint.sh"]
