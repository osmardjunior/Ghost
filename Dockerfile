# syntax=docker/dockerfile:1.4
ARG NODE_VERSION=22.18.0

# ---- Build Stage ----
FROM node:${NODE_VERSION}-bookworm-slim AS builder

WORKDIR /src

# Install build dependencies for compiling native node modules
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential python3 git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm support
RUN corepack enable

# Copy root workspace configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all package.json files to leverage Docker layer caching for dependency installation
COPY apps/activitypub/package.json ./apps/activitypub/
COPY apps/admin/package.json ./apps/admin/
COPY apps/admin-toolbar/package.json ./apps/admin-toolbar/
COPY apps/admin-x-design-system/package.json ./apps/admin-x-design-system/
COPY apps/admin-x-framework/package.json ./apps/admin-x-framework/
COPY apps/admin-x-settings/package.json ./apps/admin-x-settings/
COPY apps/announcement-bar/package.json ./apps/announcement-bar/
COPY apps/comments-ui/package.json ./apps/comments-ui/
COPY apps/portal/package.json ./apps/portal/
COPY apps/posts/package.json ./apps/posts/
COPY apps/shade/package.json ./apps/shade/
COPY apps/signup-form/package.json ./apps/signup-form/
COPY apps/sodo-search/package.json ./apps/sodo-search/
COPY apps/stats/package.json ./apps/stats/

COPY ghost/admin/package.json ./ghost/admin/
COPY ghost/core/package.json ./ghost/core/
COPY ghost/i18n/package.json ./ghost/i18n/
COPY ghost/parse-email-address/package.json ./ghost/parse-email-address/

# Copy workspace lifecycle hooks and scripts
COPY .github/scripts ./.github/scripts
COPY .github/hooks ./.github/hooks

# Install all workspace dependencies (development + production)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,id=pnpm-store \
    pnpm install --frozen-lockfile --prefer-offline

# Copy the rest of the monorepo source files
COPY . .

# Build the TypeScript backend, assets, and Ember/React Admin apps
RUN pnpm run build:production

# Build all public-facing React apps
RUN pnpm nx run-many -t build --projects=@tryghost/portal,@tryghost/comments-ui,@tryghost/sodo-search,@tryghost/signup-form,@tryghost/announcement-bar,@tryghost/admin-toolbar

# Copy the built public apps into the Admin assets directory of Ghost core
# This allows them to be served locally from the backend rather than CDN
RUN mkdir -p ghost/core/core/built/admin/assets/portal && \
    cp -r apps/portal/umd/* ghost/core/core/built/admin/assets/portal/ && \
    mkdir -p ghost/core/core/built/admin/assets/comments-ui && \
    cp -r apps/comments-ui/umd/* ghost/core/core/built/admin/assets/comments-ui/ && \
    mkdir -p ghost/core/core/built/admin/assets/sodo-search && \
    cp -r apps/sodo-search/umd/* ghost/core/core/built/admin/assets/sodo-search/ && \
    mkdir -p ghost/core/core/built/admin/assets/signup-form && \
    cp -r apps/signup-form/umd/* ghost/core/core/built/admin/assets/signup-form/ && \
    mkdir -p ghost/core/core/built/admin/assets/announcement-bar && \
    cp -r apps/announcement-bar/umd/* ghost/core/core/built/admin/assets/announcement-bar/ && \
    mkdir -p ghost/core/core/built/admin/assets/admin-toolbar && \
    cp -r apps/admin-toolbar/umd/* ghost/core/core/built/admin/assets/admin-toolbar/

# Deploy the Ghost core package to a production staging directory with production-only dependencies
RUN pnpm --filter ghost deploy /opt/ghost-prod --prod --config.inject-workspace-packages=true


# ---- Runtime Stage ----
FROM node:${NODE_VERSION}-bookworm-slim AS runner

ENV NODE_ENV=production

# Install libjemalloc2 for efficient memory management and fontconfig for rendering fonts
RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc2 fontconfig && \
    rm -rf /var/lib/apt/lists/*

# Map nodes group and user to matching ids and add ghost user
RUN groupmod -g 1001 node && \
    usermod -u 1001 node && \
    adduser --disabled-password --gecos "" -u 1000 ghost

WORKDIR /home/ghost

# Copy the packaged production output from the builder stage
COPY --from=builder /opt/ghost-prod /home/ghost

# Prepare persistent folders and copy default content/themes (Casper and Source)
RUN mkdir -p default log && \
    cp -R content base_content && \
    cp -R content/themes/casper default/casper && \
    ([ -d content/themes/source ] && cp -R content/themes/source default/source || true) && \
    chown ghost:ghost /home/ghost && \
    chown -R nobody:nogroup /home/ghost/* && \
    chown -R ghost:ghost /home/ghost/content /home/ghost/log

# Override public apps URLs to load them locally from the server instead of jsDelivr CDN
ENV portal__url=/ghost/assets/portal/portal.min.js \
    comments__url=/ghost/assets/comments-ui/comments-ui.min.js \
    sodoSearch__url=/ghost/assets/sodo-search/sodo-search.min.js \
    sodoSearch__styles=/ghost/assets/sodo-search/main.css \
    signupForm__url=/ghost/assets/signup-form/signup-form.min.js \
    announcementBar__url=/ghost/assets/announcement-bar/announcement-bar.min.js \
    adminToolbar__url=/ghost/assets/admin-toolbar/admin-toolbar.min.js

USER ghost
ENV LD_PRELOAD=libjemalloc.so.2

EXPOSE 2368

CMD ["node", "index.js"]
