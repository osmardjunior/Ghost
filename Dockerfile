# syntax=docker/dockerfile:1.4
ARG NODE_VERSION=22.18.0

# ---- Build Stage ----
# Instala TODAS as deps (incluindo dev como typescript), compila TS, depois limpa devDeps
FROM node:${NODE_VERSION}-bookworm-slim AS builder

WORKDIR /src

# Instala ferramentas de compilacao para modulos nativos (ex: sharp)
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential python3 git && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Cria stub do husky para evitar erro no lifecycle 'prepare'
RUN printf '#!/bin/sh\nexit 0\n' > /usr/local/bin/husky && chmod +x /usr/local/bin/husky
ENV HUSKY=0

# Copia o workspace inteiro (respeitando .dockerignore)
COPY . .

# Instala TODAS as dependencias (dev + prod) para poder compilar TypeScript
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,id=pnpm-store \
    pnpm install --frozen-lockfile --prefer-offline --ignore-scripts && \
    pnpm rebuild

# Compila TypeScript (ghost/core/build:tsc)
RUN cd ghost/core && npx tsc || true

# Remove devDependencies e reinstala somente producao
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,id=pnpm-store \
    pnpm install --prod --frozen-lockfile --prefer-offline --ignore-scripts && \
    pnpm rebuild


# ---- Runtime Stage ----
# Imagem final limpa e sem ferramentas de compilacao
FROM node:${NODE_VERSION}-bookworm-slim AS runner

ENV NODE_ENV=production \
    url=http://localhost:2368 \
    server__host=0.0.0.0 \
    server__port=2368

# Instala jemalloc e fontconfig
RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc2 fontconfig && \
    rm -rf /var/lib/apt/lists/*

RUN groupmod -g 1001 node && \
    usermod -u 1001 node && \
    adduser --disabled-password --gecos "" -u 1000 ghost

WORKDIR /home/ghost

RUN corepack enable

# Copia tudo do builder (source + deps + TS compilado)
COPY --from=builder /src /home/ghost

# Copia o entrypoint
COPY docker-entrypoint.sh /home/ghost/ghost/core/docker-entrypoint.sh
RUN chmod +x /home/ghost/ghost/core/docker-entrypoint.sh

# Prepara os diretorios de conteudo padrao
RUN mkdir -p default log && \
    cp -R ghost/core/content base_content && \
    cp -R ghost/core/content/themes/casper default/casper && \
    ([ -d ghost/core/content/themes/source ] && cp -R ghost/core/content/themes/source default/source || true) && \
    chown -R ghost:ghost /home/ghost/ghost/core/content /home/ghost/log /home/ghost/default /home/ghost/base_content

# URLs dos apps publicos locais
ENV portal__url=/ghost/assets/portal/portal.min.js \
    comments__url=/ghost/assets/comments-ui/comments-ui.min.js \
    sodoSearch__url=/ghost/assets/sodo-search/sodo-search.min.js \
    sodoSearch__styles=/ghost/assets/sodo-search/main.css \
    signupForm__url=/ghost/assets/signup-form/signup-form.min.js \
    announcementBar__url=/ghost/assets/announcement-bar/announcement-bar.min.js \
    adminToolbar__url=/ghost/assets/admin-toolbar/admin-toolbar.min.js

WORKDIR /home/ghost/ghost/core

USER ghost
ENV LD_PRELOAD=libjemalloc.so.2

EXPOSE 2368

CMD ["/home/ghost/ghost/core/docker-entrypoint.sh"]
