#!/usr/bin/env bash
# Construye las librerías de vendor/ (lo ejecuta GitHub Actions al publicar).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cd "$TMP"
npm init -y >/dev/null
npm i --no-audit --no-fund mdb-reader@3.2.0 buffer@6.0.3 events@3.3.0 stream-browserify@3.0.0 \
  browserify-zlib@0.2.0 crypto-browserify@3.12.1 esbuild@0.28.2 @supabase/supabase-js@2.115.0 >/dev/null
cp "$RAIZ/build/entry.js" "$RAIZ/build/shim.js" .
mkdir -p "$RAIZ/vendor"
npx esbuild entry.js --bundle --minify --format=iife --platform=browser \
  --alias:stream=stream-browserify --alias:events=events --alias:zlib=browserify-zlib \
  --alias:crypto=crypto-browserify --inject:./shim.js --outfile="$RAIZ/vendor/mdb-reader.js"
cp node_modules/@supabase/supabase-js/dist/umd/supabase.js "$RAIZ/vendor/supabase.js"
echo "vendor/ listo"
