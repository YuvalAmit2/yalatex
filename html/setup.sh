#!/bin/sh
# setup.sh -- install what build.mjs needs, in the cache folder
# ($YA_HTML_CACHE, default ~/.cache/yalatex-html), not in this folder: this
# folder is inside the template, which TeX searches on every compile.
#   Node libraries (MathJax, jsdom; versions in package-lock.json)
#   fontTools in a Python venv (cuts the text fonts down to woff2)
# Run it again after package.json changes. Also needs TeX Live (make4ht).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
cache=${YA_HTML_CACHE:-$HOME/.cache/yalatex-html}
mkdir -p "$cache"
cp "$here/package.json" "$here/package-lock.json" "$cache/"
(cd "$cache" && npm ci --omit=dev --no-audit --no-fund)
if [ ! -x "$cache/.venv/bin/pyftsubset" ]; then
  rm -rf "$cache/.venv"
  python3 -m venv "$cache/.venv"
  # ready-made packages only (no compiler needed); brotli 1.2.1 has them for Python 3.14 and 3.15
  "$cache/.venv/bin/pip" install --quiet --only-binary :all: fonttools==4.60.1 brotli==1.2.1
fi
echo "set up in $cache"
