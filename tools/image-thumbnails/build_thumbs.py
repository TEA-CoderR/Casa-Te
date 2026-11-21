"""Product-card thumbnails without touching the image server (plan v3 L9).

Reads the first photo of every product from Supabase (public data, publishable key), downloads the ones not
made yet from img.casaete.top, resizes them to 480 px WebP and writes them to OUT/prodotti/<barcode>/<NN>.webp
(same path as the original). Thumbnails of photos no longer used are removed. The folder is then published
as its own Cloudflare Pages site (.github/workflows/thumbnails.yml); the app's cards load it and fall back to
the full photo when one is missing.

Usage: SUPABASE_URL=… SUPABASE_KEY=… python3 build_thumbs.py OUT [--full]
"""
import concurrent.futures as cf
import io
import json
import os
import re
import sys
import time
import urllib.request

from PIL import Image

WIDTH = 480
QUALITY = 78
SOURCE = re.compile(r'^https://img\.casaete\.top/(prodotti/[^/?#]+/[0-9]{2}\.webp)$')


def get(url, headers=None, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'casate-thumbnails/1.0', **(headers or {})})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # network hiccup: retry with a pause
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def first_photos(base, key):
    """{relative path} of each product's first photo (lowest sort, then oldest)."""
    best = {}
    page, size = 0, 1000
    while True:
        rows = json.loads(get(f'{base}/rest/v1/product_images?select=product_id,path,sort,created_at'
                              f'&order=product_id,sort,created_at&limit={size}&offset={page * size}',
                              {'apikey': key, 'Authorization': f'Bearer {key}'} if not key.startswith('sb_') else {'apikey': key}))
        for r in rows:
            if r['product_id'] not in best:
                best[r['product_id']] = r['path']
        if len(rows) < size:
            break
        page += 1
    out = set()
    for path in best.values():
        m = SOURCE.match(path or '')
        if m:
            out.add(m.group(1))
    return out


def make(out, rel):
    data = get(f'https://img.casaete.top/{rel}')
    im = Image.open(io.BytesIO(data))
    im.load()
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    dst = os.path.join(out, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + '.tmp'
    im.save(tmp, 'WEBP', quality=QUALITY, method=6)
    os.replace(tmp, dst)
    return len(data), os.path.getsize(dst)


def main():
    out = sys.argv[1]
    full = '--full' in sys.argv
    wanted = first_photos(os.environ['SUPABASE_URL'].rstrip('/'), os.environ['SUPABASE_KEY'])
    have = set()
    for root, _, files in os.walk(os.path.join(out, 'prodotti')):
        for f in files:
            have.add(os.path.relpath(os.path.join(root, f), out).replace(os.sep, '/'))
    for rel in have - wanted:  # photo no longer the first one, or product gone
        os.remove(os.path.join(out, rel))
    todo = sorted(wanted if full else wanted - have)
    print(f'first photos: {len(wanted)}, thumbnails kept: {len(have & wanted)}, to make: {len(todo)}', flush=True)
    made = failed = before = after = 0
    with cf.ThreadPoolExecutor(max_workers=6) as pool:  # gentle on the image server
        futures = {pool.submit(make, out, rel): rel for rel in todo}
        for i, f in enumerate(cf.as_completed(futures), 1):
            try:
                a, b = f.result()
                made += 1; before += a; after += b
            except Exception as e:
                failed += 1
                print(f'failed: {futures[f]}: {e}', flush=True)
            if i % 1000 == 0:
                print(f'{i}/{len(todo)}', flush=True)
    if made:
        print(f'made {made}: {before / 1e6:.1f} MB of photos -> {after / 1e6:.1f} MB of thumbnails', flush=True)
    print(f'failed {failed}', flush=True)
    # Long cache and open CORS, like the image server.
    with open(os.path.join(out, '_headers'), 'w') as h:
        h.write('/prodotti/*\n  Cache-Control: public, max-age=2592000\n  Access-Control-Allow-Origin: *\n')
    with open(os.path.join(out, 'index.html'), 'w') as h:
        h.write('<!doctype html><meta charset="utf-8"><title>CASA &amp; TE thumbnails</title><p>Product photo thumbnails.</p>')
    if failed > max(50, len(todo) // 10):
        sys.exit(1)


if __name__ == '__main__':
    main()
