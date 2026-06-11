# syntax=docker/dockerfile:1.4
ARG NODE_VERSION=22.18.0

# ---- Runtime / Runner Stage ----
# Baseado em Debian Bookworm Slim, seguro e leve.
FROM node:${NODE_VERSION}-bookworm-slim AS runner

ENV NODE_ENV=production

# Instala apenas dependencias de execucao (jemalloc para performance e fontconfig para fontes)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc2 fontconfig && \
    rm -rf /var/lib/apt/lists/*

# Configura o usuario e grupo 'ghost' para rodar a aplicacao com privilegios reduzidos
RUN groupmod -g 1001 node && \
    usermod -u 1001 node && \
    adduser --disabled-password --gecos "" -u 1000 ghost

WORKDIR /home/ghost

# Habilita o corepack para gerenciar o pnpm
RUN corepack enable

# Copia as configuracoes de workspace do pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copia os package.json das dependencias internas do monorepo necessarias para o Ghost Core
COPY ghost/core/package.json ./ghost/core/
COPY ghost/i18n/package.json ./ghost/i18n/
COPY ghost/parse-email-address/package.json ./ghost/parse-email-address/

# Copia scripts de ciclo de vida do pnpm
COPY .github/scripts ./.github/scripts
COPY .github/hooks ./.github/hooks

# Instala apenas as dependencias de producao na pasta (/root/.local/share/pnpm/store)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,id=pnpm-store \
    pnpm install --prod --frozen-lockfile --prefer-offline --ignore-scripts

# Compila apenas as dependencias nativas de producao
RUN pnpm rebuild

# Copia todo o repositorio (incluindo os assets ja compilados localmente em ghost/core/core/built/admin)
COPY . .

# Prepara a pasta de conteudos padrao (Casper e Source) e da permissao ao usuario ghost
RUN mkdir -p default log && \
    cp -R ghost/core/content base_content && \
    cp -R ghost/core/content/themes/casper default/casper && \
    ([ -d ghost/core/content/themes/source ] && cp -R ghost/core/content/themes/source default/source || true) && \
    chown ghost:ghost /home/ghost && \
    chown -R nobody:nogroup /home/ghost/* && \
    chown -R ghost:ghost /home/ghost/ghost/core/content /home/ghost/log

# Redireciona os Apps Publicos (Portal, Comments, etc.) para carregar localmente caso estejam no build
# Se nao estiverem no build, remova ou comente estas linhas para usar a CDN padrao do Ghost
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
