#!/usr/bin/env bash
# Makes the 480 px thumbnails of the product photos on the image server (img.casaete.top):
#   <root>/prodotti/<barcode>/01.webp  ->  <root>/prodotti/<barcode>/01_t.webp
# Only missing or outdated thumbnails are made, so it can run every night (cron) and after each upload.
# Needs `cwebp` (Debian/Ubuntu: sudo apt install webp) or ImageMagick (`magick` or `convert`).
# Usage: ./make-thumbnails.sh /var/www/img.casaete.top        (the folder that contains "prodotti")
set -euo pipefail
ROOT="${1:?Usage: $0 <folder that contains prodotti>}"
DIR="$ROOT/prodotti"
[ -d "$DIR" ] || { echo "Not found: $DIR"; exit 1; }
WIDTH=480
if command -v cwebp >/dev/null; then
  make() { cwebp -quiet -q 78 -resize "$WIDTH" 0 "$1" -o "$2"; }
elif command -v magick >/dev/null; then
  make() { magick "$1" -resize "${WIDTH}x>" -quality 78 "$2"; }
elif command -v convert >/dev/null; then
  make() { convert "$1" -resize "${WIDTH}x>" -quality 78 "$2"; }
else
  echo "Install cwebp (sudo apt install webp) or ImageMagick first."; exit 1
fi
made=0; skipped=0; failed=0
while IFS= read -r -d '' src; do
  dst="${src%.webp}_t.webp"
  if [ -f "$dst" ] && [ "$dst" -nt "$src" ]; then skipped=$((skipped+1)); continue; fi
  tmp="$dst.tmp.webp"
  if make "$src" "$tmp" && [ -s "$tmp" ]; then
    mv -f "$tmp" "$dst"; chmod --reference="$src" "$dst" 2>/dev/null || true; made=$((made+1))
  else
    rm -f "$tmp"; failed=$((failed+1)); echo "failed: $src"
  fi
done < <(find "$DIR" -type f -regex '.*/[0-9][0-9]\.webp' -print0)
echo "thumbnails: $made made, $skipped already up to date, $failed failed"
