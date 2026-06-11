#!/bin/sh
set -e

# Se o diretorio de content estiver vazio (volume novo), popula com o conteudo padrao
CONTENT_DIR="/home/ghost/ghost/core/content"
BASE_CONTENT="/home/ghost/base_content"

if [ -d "$BASE_CONTENT" ] && [ -z "$(ls -A "$CONTENT_DIR" 2>/dev/null)" ]; then
    echo "Content directory is empty, initializing from base content..."
    cp -R "$BASE_CONTENT"/* "$CONTENT_DIR"/
fi

# Garante que os subdiretorios necessarios existam
mkdir -p "$CONTENT_DIR/themes" "$CONTENT_DIR/data" "$CONTENT_DIR/images" "$CONTENT_DIR/files" "$CONTENT_DIR/logs" "$CONTENT_DIR/adapters"

# Garante que o tema Casper esteja presente
DEFAULT_DIR="/home/ghost/default"
if [ -d "$DEFAULT_DIR/casper" ] && [ ! -d "$CONTENT_DIR/themes/casper" ]; then
    echo "Installing default Casper theme..."
    cp -R "$DEFAULT_DIR/casper" "$CONTENT_DIR/themes/casper"
fi

exec node index.js
