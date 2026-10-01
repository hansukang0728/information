"""위키미디어 공용(Wikimedia Commons)에서 낱말 사진을 가져오는 도구.

  python3 tools/fetch_photos.py candidates   # 낱말마다 후보 사진을 찾아 contact sheet(미리보기 모음)를 만든다
  python3 tools/fetch_photos.py fetch        # photos/selection.json 에 고른 사진을 받아 www/photos/ 에 저장한다

GitHub Actions(wordcards-photos.yml)에서 실행합니다. 저작권이 자유로운 사진(CC0, 퍼블릭 도메인, CC BY, CC BY-SA)만 씁니다.
"""
import io, json, sys, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
API = 'https://commons.wikimedia.org/w/api.php'
UA = 'wordcards-photo-fetcher/1.0 (https://github.com/hansukang0728/information)'
N_CANDIDATES = 5
OK_LICENSE = ('cc0', 'public domain', 'pd', 'cc by', 'cc-by')
BAD_LICENSE = ('nc', 'nd')


def get(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else json.loads(data)


def license_ok(name):
    n = (name or '').lower()
    return any(n.startswith(k) for k in OK_LICENSE) and not any(f'-{b}' in n or f' {b}' in n for b in BAD_LICENSE)


def search(query, width, limit):
    params = {
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6,
        'gsrlimit': limit, 'gsrsearch': f'{query} filetype:bitmap',
        'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size', 'iiurlwidth': width,
    }
    data = get(f'{API}?{urllib.parse.urlencode(params)}')
    out = []
    for page in sorted(data.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 0)):
        info = page['imageinfo'][0]
        meta = info.get('extmetadata', {})
        lic = meta.get('LicenseShortName', {}).get('value', '')
        if not license_ok(lic):
            continue
        if info.get('width', 0) < 500 or info.get('height', 0) < 500:
            continue
        w, h = info['width'], info['height']
        if max(w, h) / min(w, h) > 2.2:   # 너무 길쭉한 사진은 카드에 안 맞음
            continue
        out.append({
            'title': page['title'],
            'thumb': info['thumburl'],
            'page': info['descriptionurl'],
            'license': lic,
            'author': _strip(meta.get('Artist', {}).get('value', '')),
        })
    return out


def _strip(html):
    import re
    return re.sub(r'<[^>]+>', '', html).strip()[:120]


def thumb_for(title, width):
    params = {'action': 'query', 'format': 'json', 'titles': title, 'prop': 'imageinfo',
              'iiprop': 'url|extmetadata', 'iiurlwidth': width}
    data = get(f'{API}?{urllib.parse.urlencode(params)}')
    page = next(iter(data['query']['pages'].values()))
    info = page['imageinfo'][0]
    meta = info.get('extmetadata', {})
    return info['thumburl'], info['descriptionurl'], meta.get('LicenseShortName', {}).get('value', ''), _strip(meta.get('Artist', {}).get('value', ''))


def square(img, size):
    img = img.convert('RGB')
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return img.resize((size, size), Image.LANCZOS)


def load_selection():
    p = ROOT / 'photos/selection.json'
    return json.loads(p.read_text()) if p.exists() else {}


def mode():
    """모든 낱말이 골라졌으면 fetch, 아니면 candidates"""
    queries = json.loads((ROOT / 'photos/queries.json').read_text())
    print('fetch' if all(k in load_selection() for k in queries) else 'candidates')


def candidates():
    # 아직 고르지 않은 낱말만 후보를 찾습니다.
    selected = load_selection()
    queries = {k: v for k, v in json.loads((ROOT / 'photos/queries.json').read_text()).items() if k not in selected}
    for old in (ROOT / 'photos/candidates').glob('sheet-*.png'):
        old.unlink()
    out_dir = ROOT / 'photos/candidates'
    out_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
    result = {}
    slugs = list(queries)
    cell, pad = 200, 6
    per_sheet = 10
    for si in range(0, len(slugs), per_sheet):
        chunk = slugs[si:si + per_sheet]
        sheet = Image.new('RGB', (160 + N_CANDIDATES * (cell + pad), len(chunk) * (cell + pad)), 'white')
        d = ImageDraw.Draw(sheet)
        for row, slug in enumerate(chunk):
            q = queries[slug]
            try:
                cands = search(q['query'], 400, 12)[:N_CANDIDATES]
            except Exception as e:  # 검색 실패해도 다른 낱말은 계속
                print(slug, 'search failed:', e)
                cands = []
            result[slug] = cands
            y = row * (cell + pad)
            d.text((6, y + 6), f'{si + row + 1:02d} {slug}', fill='black', font=font)
            d.text((6, y + 30), q['query'], fill='gray', font=font)
            for ci, c in enumerate(cands):
                try:
                    img = Image.open(io.BytesIO(get(c['thumb'], binary=True)))
                    sheet.paste(square(img, cell), (160 + ci * (cell + pad), y))
                    d.text((160 + ci * (cell + pad) + 4, y + 4), str(ci), fill='red', font=font)
                except Exception as e:
                    print(slug, ci, 'thumb failed:', e)
            print(slug, len(cands), 'candidates')
        sheet.save(out_dir / f'sheet-{si // per_sheet + 1}.png')
    (out_dir / 'candidates.json').write_text(json.dumps(result, ensure_ascii=False, indent=1))


def fetch():
    selection = json.loads((ROOT / 'photos/selection.json').read_text())
    queries = json.loads((ROOT / 'photos/queries.json').read_text())
    out_dir = ROOT / 'www/photos'
    out_dir.mkdir(parents=True, exist_ok=True)
    credits = {}
    for slug, title in selection.items():
        thumb, page, lic, author = thumb_for(title, 900)
        img = Image.open(io.BytesIO(get(thumb, binary=True)))
        square(img, 640).save(out_dir / f'{slug}.jpg', 'JPEG', quality=82, optimize=True)
        credits[slug] = {'word': queries[slug]['word'], 'title': title, 'page': page, 'license': lic, 'author': author}
        print(slug, title, lic)
    (out_dir / 'credits.json').write_text(json.dumps(credits, ensure_ascii=False, indent=1))
    lines = ['# 사진 출처', '', '위키미디어 공용(Wikimedia Commons)의 사진을 사용했습니다.', '',
             '| 낱말 | 파일 | 저작자 | 라이선스 |', '|---|---|---|---|']
    for slug, c in credits.items():
        lines.append(f"| {c['word']} | [{c['title']}]({c['page']}) | {c['author']} | {c['license']} |")
    (out_dir / 'CREDITS.md').write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    {'candidates': candidates, 'fetch': fetch, 'mode': mode}[sys.argv[1]]()
