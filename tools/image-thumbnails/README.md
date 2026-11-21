# Product photo thumbnails

**In use (21/11/2026): `build_thumbs.py` + `.github/workflows/thumbnails.yml`.** Every night GitHub Actions makes the
480 px copy of each product's first photo and publishes them as the Cloudflare Pages site `casate-thumbs`
(`https://casate-thumbs.pages.dev/prodotti/<barcode>/01.webp`). Nothing runs on the image server; it only serves the
originals once per new photo. Run it by hand: Actions → "Product photo thumbnails" → Run workflow ("full" remakes all).

The server script below is an alternative (copies next to the originals) and is not needed.

Product cards show photos about 160 px wide but downloaded the full photo (800–1500 px, ~74 KB): about 3 MB for a
screen of 40 products. `make-thumbnails.sh` makes a 480 px copy next to each photo (`01.webp` → `01_t.webp`, roughly a quarter of the size; sharp on 3× phone screens).

On the image server (Linux, the files behind https://img.casaete.top):

1. `sudo apt install webp` (or have ImageMagick).
2. Copy `make-thumbnails.sh` to the server, e.g. `/opt/casate/make-thumbnails.sh`, and `chmod +x` it.
3. Run it once on the folder that contains `prodotti` (the first run takes a while):
   `/opt/casate/make-thumbnails.sh /var/www/img.casaete.top`
4. Check one: open `https://img.casaete.top/prodotti/<barcode>/01_t.webp` in the browser.
5. Every night, for new photos: `crontab -e` and add
   `30 2 * * * /opt/casate/make-thumbnails.sh /var/www/img.casaete.top >> /var/log/casate-thumbs.log 2>&1`
6. In the back office: Impostazioni → Immagini → "Usa le miniature" on.

Nothing else on the server changes; the originals are not touched. If the switch is on and a copy is missing, the app
loads the original for that card.
