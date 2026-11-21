#!/usr/bin/env python3
"""Create a Web-only candidate copy with verified WebP/PNG texture choices.

The 3.8.8 ImageAsset importer serializes PNG as format 0 and WebP as 4.
When both are listed as ``4_0``, the engine selects WebP only if supported,
and otherwise keeps the original PNG. Other platforms and the Creator source
remain untouched. The pairs file binds each byte-identical decoded RGBA pair
to the SHA-256 of both encoded files.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAIRS = ROOT / 'scripts' / 'cocos-webp-pairs.json'
ART = ROOT / 'cocos' / 'assets' / 'resources' / 'art'
ORIGINALS = ROOT / 'public' / 'assets'
UI = ROOT / 'cocos' / 'assets' / 'resources' / 'ui'
BOOT_IMAGE = '<img class="boot-courier" src="./boot-art/courier.webp" alt="">'
PRELOAD_MARKER = '<!-- optimized home image preloads -->'
STARTUP_MARKER = '<!-- optimized Creator startup -->'
STARTUP_SCRIPTS = (
    ('src/polyfills.bundle.js', 'f1e4ced3322168d6b9915e782e4c1cf1055d75f66f2b38e7fcd60f48cf89082b'),
    ('src/system.bundle.js', '90f192f3b04f7fcb5bba9c15745cdd1a798d9b855f752c5ee7e48bb526dd543d'),
)
STARTUP_TAGS = (
    '<script src="src/polyfills.bundle.js" charset="utf-8"> </script>',
    '<script src="src/system.bundle.js" charset="utf-8"> </script>',
    '<script src="src/import-map.json" type="systemjs-importmap" charset="utf-8"> </script>',
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def regular(path):
    if not path.is_file() or path.is_symlink():
        raise ValueError(f'Expected a regular file: {path}')
    return path.read_bytes()


def asset_path(source):
    meta = json.loads(regular(Path(str(source) + '.meta')))
    uuid = meta['uuid']
    if not isinstance(uuid, str) or len(uuid) != 36 or any(c not in '0123456789abcdef-' for c in uuid):
        raise ValueError(f'Unexpected asset UUID for {source.name}')
    return Path('assets/resources/native') / uuid[:2] / (uuid + '.png')


def home_preloads(candidate, planned):
    """Prepare optional startup HTML only after validating all referenced assets."""
    index = candidate / 'index.html'
    if not index.exists():
        return None
    html = regular(index).decode('utf-8')
    if 'boot-courier' not in html:
        return None
    if html.count(BOOT_IMAGE) != 1 or html.count('</head>') != 1 or PRELOAD_MARKER in html:
        raise ValueError('Unexpected startup HTML; cannot safely optimize home preloads')
    courier = asset_path(ART / 'clay-chibi-home.png')
    mascots = asset_path(ART / 'clay-market-mascots.png')
    logo_source = UI / 'delivery-box.png'
    logo = asset_path(logo_source)
    paths = {entry[0]: entry[1] for entry in planned}
    for path in (courier.with_suffix('.webp'), mascots.with_suffix('.webp')):
        if path not in paths:
            raise ValueError(f'Missing verified home WebP pair: {path}')
    if regular(candidate / 'boot-art/courier.webp') != paths[courier.with_suffix('.webp')]:
        raise ValueError('Boot courier differs from verified home WebP')
    if regular(candidate / logo) != regular(logo_source):
        raise ValueError('Built home logo differs from source')
    url = lambda path: './' + path.as_posix()
    files = [url(courier.with_suffix('.webp')), url(mascots.with_suffix('.webp'))]
    # The engine may override its canvas probe on Safari. On a negative probe,
    # do not guess which format it will load; the boot image can safely use PNG.
    script = '''%s
  <script>(function () {
    var webp = false;
    try { var c = document.createElement('canvas'); c.getContext('2d');
      webp = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {}
    window.__nightMarketBootWebp = webp;
    var files = webp ? %s : [];
    files.push(%s);
    files.forEach(function (url) {
      var link = document.createElement('link'); link.rel = 'preload';
      link.as = 'image'; link.crossOrigin = 'anonymous'; link.href = url;
      document.head.appendChild(link);
    });
  }());</script>''' % (PRELOAD_MARKER, json.dumps(files), json.dumps(url(logo)))
    boot = ('<img class="boot-courier" crossorigin="anonymous" alt="">'
            '<script>document.currentScript.previousElementSibling.src = '
            'window.__nightMarketBootWebp ? %s : %s;</script>'
            % (json.dumps(url(courier.with_suffix('.webp'))), json.dumps(url(courier))))
    return html.replace('</head>', script + '\n</head>').replace(BOOT_IMAGE, boot).encode('utf-8')


def optimize_startup(candidate, html):
    """Inline only the exact Creator startup scripts and import map we verified."""
    if html is None:
        return None
    text = html.decode('utf-8')
    if (STARTUP_MARKER in text or any(text.count(tag) != 1 for tag in STARTUP_TAGS)
            or [text.index(tag) for tag in STARTUP_TAGS] != sorted(text.index(tag) for tag in STARTUP_TAGS)):
        return html
    sources = []
    for path, expected_hash in STARTUP_SCRIPTS:
        file = candidate / path
        if not file.is_file() or file.is_symlink():
            return html
        data = regular(file)
        if sha(data) != expected_hash or b'</script' in data.lower():
            return html
        sources.append(data.decode('utf-8'))
    map_path = candidate / 'src/import-map.json'
    if not map_path.is_file() or map_path.is_symlink():
        return html
    import_map = json.loads(regular(map_path))
    engine = candidate / 'cocos-js/cc.js'
    if import_map != {'imports': {'cc': './../cocos-js/cc.js'}} or not engine.is_file() or engine.is_symlink():
        return html
    # The external map was relative to src/; the inline map is relative to the page.
    inline_map = json.dumps({'imports': {'cc': './cocos-js/cc.js'}}, separators=(',', ':'))
    replacements = (STARTUP_MARKER + '\n<script>' + sources[0] + '</script>',
                    '<script>' + sources[1] + '</script>',
                    '<script type="systemjs-importmap">' + inline_map + '</script>')
    for old, new in zip(STARTUP_TAGS, replacements):
        text = text.replace(old, new, 1)
    return text.encode('utf-8')


def preload_main_bundle(candidate, html):
    """Preload the main bundle only for the local, unversioned build layout."""
    if html is None:
        return None
    text = html.decode('utf-8')
    marker = '<!-- optimized main bundle preload -->'
    assets = json.loads(regular(candidate / 'src/settings.json')).get('assets', {})
    main = candidate / 'assets/main/index.js'
    if (text.count('</head>') != 1 or marker in text or not main.is_file() or main.is_symlink()
            or assets.get('server') != '' or assets.get('bundleVers', {}).get('main')
            or 'main' in assets.get('remoteBundles', []) or 'main' in assets.get('subpackages', [])
            or not any(isinstance(item, dict) and item.get('bundle') == 'main'
                       and not item.get('version') for item in assets.get('preloadBundles', []))):
        return html
    tag = marker + '\n  <link rel="preload" as="script" crossorigin="anonymous" href="./assets/main/index.js">\n'
    return text.replace('</head>', tag + '</head>', 1).encode('utf-8')


def plan(candidate):
    """Validate every pair and serialized asset before creating an output."""
    settings = json.loads(regular(candidate / 'src' / 'settings.json'))
    if settings.get('CocosEngine') != '3.8.8' or settings['engine'].get('platform') != 'web-mobile':
        raise ValueError('Expected a Creator 3.8.8 web-mobile build')
    pairs = json.loads(regular(PAIRS))
    if pairs.get('schema') != 1 or not isinstance(pairs.get('pairs'), list) or not pairs['pairs']:
        raise ValueError('Unexpected WebP pair manifest')
    planned = []
    seen = set()
    for pair in pairs['pairs']:
        name = pair['name']
        if Path(name).name != name or not name.endswith('.png') or name in seen:
            raise ValueError(f'Invalid or duplicate PNG name: {name}')
        seen.add(name)
        png = ART / name
        webp = ORIGINALS / (png.stem + '.webp')
        png_data, webp_data = regular(png), regular(webp)
        if sha(png_data) != pair['pngSha256'] or sha(webp_data) != pair['webpSha256']:
            raise ValueError(f'Pixel-verified source pair changed: {name}')
        native = asset_path(png)
        imported = Path('assets/resources/import') / native.relative_to('assets/resources/native').with_suffix('.json')
        if regular(candidate / native) != png_data:
            raise ValueError(f'Built texture differs from source: {name}')
        data = json.loads(regular(candidate / imported))
        # Refuse a different Creator serialization rather than guessing.
        if not (isinstance(data, list) and len(data) > 5 and data[3] == ['cc.ImageAsset']
                and isinstance(data[5], list) and isinstance(data[5][0], dict)
                and data[5][0].get('fmt') == '0'):
            raise ValueError(f'Unexpected ImageAsset serialization: {name}')
        if (candidate / native.with_suffix('.webp')).exists():
            raise ValueError(f'Candidate already contains alternate texture: {name}')
        data[5][0]['fmt'] = '4_0'
        planned.append((native.with_suffix('.webp'), webp_data, imported,
                        (json.dumps(data, separators=(',', ':')) + '\n').encode('utf-8')))
    return planned


def optimize(candidate, output):
    candidate, output = candidate.resolve(), output.resolve()
    if not candidate.is_dir() or candidate.is_symlink():
        raise ValueError('Candidate must be an existing build directory')
    if output.exists() or output == candidate or candidate in output.parents or output in candidate.parents:
        raise ValueError('Output must be a new independent directory')
    planned = plan(candidate)
    home_html = home_preloads(candidate, planned)
    index = candidate / 'index.html'
    startup_html = home_html if home_html is not None else regular(index) if index.exists() else None
    startup_html = preload_main_bundle(candidate, optimize_startup(candidate, startup_html))
    # Do not follow source symlinks, including links hidden in subdirectories.
    if any(p.is_symlink() for p in candidate.rglob('*')):
        raise ValueError('Candidate contains symlinks')
    shutil.copytree(candidate, output)
    for webp_path, webp, import_path, encoded in planned:
        (output / webp_path).write_bytes(webp)
        (output / import_path).write_bytes(encoded)
    if startup_html is not None:
        (output / 'index.html').write_bytes(startup_html)
    print(f'Created independent Web candidate with {len(planned)} WebP/PNG fallback pairs: {output}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    optimize(args.candidate, args.output)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        raise SystemExit(f'Web texture optimization failed: {error}')
