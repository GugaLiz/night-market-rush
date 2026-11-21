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


def sha(data):
    return hashlib.sha256(data).hexdigest()


def regular(path):
    if not path.is_file() or path.is_symlink():
        raise ValueError(f'Expected a regular file: {path}')
    return path.read_bytes()


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
        meta = json.loads(regular(Path(str(png) + '.meta')))
        uuid = meta['uuid']
        if not isinstance(uuid, str) or len(uuid) != 36 or any(c not in '0123456789abcdef-' for c in uuid):
            raise ValueError(f'Unexpected asset UUID for {name}')
        subdir = uuid[:2]
        native = Path('assets/resources/native') / subdir / (uuid + '.png')
        imported = Path('assets/resources/import') / subdir / (uuid + '.json')
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
    # Do not follow source symlinks, including links hidden in subdirectories.
    if any(p.is_symlink() for p in candidate.rglob('*')):
        raise ValueError('Candidate contains symlinks')
    shutil.copytree(candidate, output)
    for webp_path, webp, import_path, encoded in planned:
        (output / webp_path).write_bytes(webp)
        (output / import_path).write_bytes(encoded)
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
