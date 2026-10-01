#!/usr/bin/env bash
# Usage: optimize.sh <input.svg> <output.svg> [precision]
# precision defaults to 2 decimal places (safe/lossless-looking).
set -euo pipefail
IN="$1"
OUT="$2"
PRECISION="${3:-2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$PRECISION" = "2" ]; then
  CONFIG="$SCRIPT_DIR/svgo.config.js"
else
  CONFIG="$(mktemp).config.js"
  sed "s/floatPrecision: 2/floatPrecision: $PRECISION/g; s/transformPrecision: 2/transformPrecision: $PRECISION/g" \
    "$SCRIPT_DIR/svgo.config.js" > "$CONFIG"
fi

npx --yes svgo -i "$IN" -o "$OUT" --config "$CONFIG" >/dev/null 2>&1

ORIG=$(wc -c < "$IN")
NEW=$(wc -c < "$OUT")
PCT=$(python3 -c "print(f'{100*(1-$NEW/$ORIG):.1f}')")
echo "$(basename "$IN"): $ORIG -> $NEW bytes (-$PCT%)"
