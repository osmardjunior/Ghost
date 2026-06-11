# syntax=docker/dockerfile:1.4
ARG NODE_VERSION=22.18.0

# ---- Build Stage ----
# Esta fase contem as ferramentas de compilacao para rodar e reconstruir modulos nativos
FROM node:${NODE_VERSION}-bookworm-slim AS builder

WORKDIR /src

# Instala ferramentas essenciais de compilacao para modulos nativos (ex: sharp, sqlite3)
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential python3 git && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Copia os arquivos de definicao do workspace do pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copia apenas as dependencias internas do monorepo necessarias
COPY ghost/core/package.json ./ghost/core/
COPY ghost/i18n/package.json ./ghost/i18n/
COPY ghost/parse-email-address/package.json ./ghost/parse-email-address/

# Copia scripts de ciclo de vida do pnpm
COPY .github/scripts ./.github/scripts
COPY .github/hooks ./.github/hooks

# Instala as dependencias de producao e compila os modulos nativos
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,id=pnpm-store \
    pnpm install --prod --frozen-lockfile --prefer-offline --ignore-scripts && \
    pnpm rebuild


# ---- Runtime Stage ----
# Imagem final de execucao, limpa e sem ferramentas de compilacao
FROM node:${NODE_VERSION}-bookworm-slim AS runner

ENV NODE_ENV=production

# Instala jemalloc e fontconfig
RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc2 fontconfig && \
    rm -rf /var/lib/apt/lists/*

RUN groupmod -g 1001 node && \
    usermod -u 1001 node && \
    adduser --disabled-password --gecos "" -u 1000 ghost

WORKDIR /home/ghost

RUN corepack enable

# Copia as dependencias ja instaladas e compiladas da fase anterior
COPY --from=builder /src /home/ghost

# Copia todo o repositorio (os assets prontos do admin e outros arquivos)
# Como o node_modules esta no .dockerignore, ele nao sobrescrevera a pasta gerada acima
COPY . .

# Prepara os diretorios de conteudo padrao
RUN mkdir -p default log && \
    cp -R ghost/core/content base_content && \
    cp -R ghost/core/content/themes/casper default/casper && \
    ([ -d ghost/core/content/themes/source ] && cp -R ghost/core/content/themes/source default/source || true) && \
    chown ghost:ghost /home/ghost && \
    chown -R nobody:nogroup /home/ghost/* && \
    chown -R ghost:ghost /home/ghost/ghost/core/content /home/ghost/log

# Carrega os apps publicos localmente caso existam no build
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

CMD ["node", "index.js"]
