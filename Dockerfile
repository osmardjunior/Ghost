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

# Stub do husky + desabilita scripts problematicos
RUN printf '#!/bin/sh\nexit 0\n' > /usr/local/bin/husky && chmod +x /usr/local/bin/husky
ENV HUSKY=0 npm_config_ignore_scripts=true

# Copia tudo (respeitando .dockerignore)
COPY . .

# Instala TODAS as deps sem rodar nenhum lifecycle script
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,id=pnpm-store \
    pnpm install --frozen-lockfile --prefer-offline --ignore-scripts

# Reconstroi apenas os modulos nativos necessarios (sharp)
RUN cd node_modules/.pnpm/sharp@*/node_modules/sharp 2>/dev/null && node install/check.js || true

# Compila TypeScript - parse-email-address primeiro (dependencia do core)
RUN cd ghost/parse-email-address && npx tsc || true
RUN cd ghost/core && npx tsc || true

# Compila o Admin UI (Ember) - necessario para /ghost/ funcionar
# Desabilita temporariamente ignore_scripts para o ember-cli funcionar
RUN npm_config_ignore_scripts= cd ghost/admin && npx ember build --environment=production --silent || \
    (echo "Admin build failed, creating placeholder..." && \
     mkdir -p /src/ghost/core/core/built/admin && \
     echo '<html><head><meta http-equiv="refresh" content="0;url=/"></head><body>Admin build pending</body></html>' > /src/ghost/core/core/built/admin/index.html)

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

# Copia tudo do builder (source + deps compilados + TS compilado)
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
