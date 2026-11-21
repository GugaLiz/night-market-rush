#!/usr/bin/env python3
"""Package a verified Creator candidate and assemble the GitHub Pages site.

The candidate is built separately with Creator. The checked-in archive is a
binary build input, not proof that the game has completed migration. Publishing
is refused if the Creator project no longer matches the recorded source.
"""
import argparse
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
COCOS = ROOT / 'cocos'
RELEASE = ROOT / 'pages-release'
ARCHIVE = RELEASE / 'cocos-web.zip'
MANIFEST = RELEASE / 'manifest.json'
SOURCE_ITEMS = ('assets', 'settings', 'build-templates', 'package.json', 'tsconfig.json')
TEXT_EXTENSIONS = {'.meta', '.ts', '.json', '.ejs', '.scene', '.svg', '.webmanifest'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def files_in(path):
    if not path.exists() or path.is_symlink():
        raise ValueError(f'Missing or symlinked path: {path}')
    if path.is_file():
        return [path]
    result = []
    for item in path.rglob('*'):
        if item.is_symlink():
            raise ValueError(f'Symlinks are not allowed: {item}')
        if item.is_file():
            result.append(item)
    return result


def source_files():
    result = {}
    for name in SOURCE_ITEMS:
        for path in files_in(COCOS / name):
            relative = path.relative_to(COCOS).as_posix()
            data = path.read_bytes()
            # Git's checkout normalizes line endings on some platforms. Hash
            # text in its repository form while leaving binary assets exact.
            if path.suffix.lower() in TEXT_EXTENSIONS:
                data = data.replace(b'\r\n', b'\n')
            result[relative] = digest(data)
    return dict(sorted(result.items()))


def raw_hashes(base, paths):
    return {p.relative_to(base).as_posix(): digest(p.read_bytes()) for p in paths}


def verify_evidence(base, evidence, *, ignore=()):
    expected = {entry['path']: entry['sha256'].lower() for entry in json.loads(evidence.read_text(encoding='utf-8-sig'))}
    actual = raw_hashes(base, files_in(base))
    for name in ignore:
        actual.pop(name, None)
        expected.pop(name, None)
    if actual != expected:
        changed = sorted(set(actual) ^ set(expected) | {k for k in actual.keys() & expected.keys() if actual[k] != expected[k]})
        raise ValueError(f'Candidate evidence mismatch ({len(changed)} files): {changed[:10]}')


def record_evidence(candidate, prefix):
    """Record fresh local evidence only after checking the actual Creator snapshot."""
    if not prefix or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in prefix):
        raise ValueError('Evidence prefix must contain only letters, numbers, hyphens or underscores')
    metadata = json.loads((candidate / 'candidate-build.json').read_text(encoding='utf-8-sig'))
    if metadata.get('purpose') != 'isolated-web-release-candidate' or metadata.get('existingSaveEnabled') is not True:
        raise ValueError('Unexpected candidate provenance or save policy')
    runtime = (ROOT / '.runtime').resolve()
    snapshot = Path(metadata['snapshot']).resolve()
    if snapshot.parent != runtime or not snapshot.name.startswith('cocos-web-candidate-'):
        raise ValueError('Candidate snapshot is outside the expected local runtime directory')
    current = {}
    copied = {}
    for name in SOURCE_ITEMS:
        current.update({p.relative_to(COCOS).as_posix(): p.read_bytes() for p in files_in(COCOS / name)})
        copied.update({p.relative_to(snapshot).as_posix(): p.read_bytes() for p in files_in(snapshot / name)})
    policy = 'assets/scripts/runtime/web-build-policy.ts'
    disabled = b'export const WEB_PERSISTENCE_CANDIDATE: boolean = false;'
    enabled = b'export const WEB_PERSISTENCE_CANDIDATE: boolean = true;'
    if policy not in current or current[policy].count(disabled) != 1:
        raise ValueError('Unexpected source persistence policy')
    current_policy = current[policy]
    current[policy] = current_policy.replace(disabled, enabled)
    if current != copied:
        changed = sorted(set(current) ^ set(copied) | {k for k in current.keys() & copied.keys() if current[k] != copied[k]})
        raise ValueError(f'Candidate snapshot differs from current source ({len(changed)} files): {changed[:10]}')
    current[policy] = current_policy
    output_source = runtime / f'{prefix}-source.json'
    output_build = runtime / f'{prefix}-build.json'
    if output_source.exists() or output_build.exists():
        raise ValueError('Evidence file already exists; choose a new prefix')
    source_entries = [{'path': name, 'sha256': digest(data)} for name, data in sorted(current.items())]
    build_entries = [{'path': path.relative_to(candidate).as_posix(), 'sha256': digest(path.read_bytes())}
                     for path in sorted(files_in(candidate))]
    with output_source.open('x', encoding='utf-8', newline='\n') as out:
        json.dump(source_entries, out, indent=2)
    with output_build.open('x', encoding='utf-8', newline='\n') as out:
        json.dump(build_entries, out, indent=2)
    print(f'Recorded {len(source_entries)} matching source files and {len(build_entries)} candidate files')


def pack(candidate, source_evidence, build_evidence):
    if ARCHIVE.exists() or MANIFEST.exists():
        raise ValueError('Release package already exists; preserve it and choose an explicit replacement workflow')
    # The source evidence lists precisely the items copied to Creator, not the
    # generated cache and build output in the project directory.
    expected = {e['path']: e['sha256'].lower() for e in json.loads(source_evidence.read_text(encoding='utf-8-sig'))}
    actual = {}
    for name in SOURCE_ITEMS:
        actual.update(raw_hashes(COCOS, files_in(COCOS / name)))
    if actual != expected:
        raise ValueError('Current Creator source differs from the verified candidate evidence')
    verify_evidence(candidate, build_evidence)
    metadata = json.loads((candidate / 'candidate-build.json').read_text(encoding='utf-8-sig'))
    settings = json.loads((candidate / 'src/settings.json').read_text(encoding='utf-8-sig'))
    if metadata.get('purpose') != 'isolated-web-release-candidate' or metadata.get('existingSaveEnabled') is not True:
        raise ValueError('Candidate provenance or save policy does not match')
    if settings.get('CocosEngine') != '3.8.8' or settings['engine'].get('debug') is not False or settings['engine'].get('platform') != 'web-mobile':
        raise ValueError('Candidate is not the expected Creator 3.8.8 Web non-debug build')
    if not (candidate / 'index.html').is_file():
        raise ValueError('Candidate lacks index.html')
    source = source_files()
    RELEASE.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ARCHIVE, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files_in(candidate), key=lambda p: p.relative_to(candidate).as_posix()):
            name = path.relative_to(candidate).as_posix()
            # The marker contains an absolute local snapshot path; never publish it.
            if name == 'candidate-build.json':
                continue
            entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    manifest = {'schema': 1, 'engine': '3.8.8', 'platform': 'web-mobile', 'debug': False,
                'prototype': True, 'existingSaveEnabled': True,
                'archiveSha256': digest(ARCHIVE.read_bytes()), 'sourceSha256': source}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'Packaged {len(source)} source files; archive SHA-256 {manifest["archiveSha256"]}')


def verify():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8-sig'))
    if (manifest.get('schema'), manifest.get('engine'), manifest.get('platform'), manifest.get('debug'), manifest.get('prototype'), manifest.get('existingSaveEnabled')) != (1, '3.8.8', 'web-mobile', False, True, True):
        raise ValueError('Unexpected release manifest policy')
    actual = source_files()
    expected = manifest['sourceSha256']
    if actual != expected:
        changed = sorted(set(actual) ^ set(expected) | {k for k in actual.keys() & expected.keys() if actual[k] != expected[k]})
        raise ValueError(f'Creator source changed since package build ({len(changed)} files): {changed[:10]}; rebuild and repackage')
    if digest(ARCHIVE.read_bytes()) != manifest['archiveSha256']:
        raise ValueError('Cocos archive hash does not match its manifest')
    with zipfile.ZipFile(ARCHIVE) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or 'index.html' not in names or 'candidate-build.json' in names or any(n.startswith('legacy/') for n in names):
            raise ValueError('Invalid Cocos archive contents')
        for info in archive.infolist():
            name = PurePosixPath(info.filename)
            if name.is_absolute() or '..' in name.parts or ':' in info.filename or '\\' in info.filename or info.is_dir() or (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError(f'Unsafe archive entry: {info.filename}')
    print(f'Verified {len(actual)} Creator source files and archive SHA-256')


def assemble(out, legacy):
    verify()
    if out.exists():
        raise ValueError('Output already exists; refusing to overwrite it')
    if not (legacy / 'index.html').is_file():
        raise ValueError('Legacy Vite build must contain index.html')
    files_in(legacy)  # reject symlinks before copying
    out.mkdir(parents=True)
    with zipfile.ZipFile(ARCHIVE) as archive:
        archive.extractall(out)
    shutil.copytree(legacy, out / 'legacy')
    print(f'Pages site assembled: Cocos at / and previous Vite build at /legacy/')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('pack')
    p.add_argument('--candidate', type=Path, required=True)
    p.add_argument('--source-evidence', type=Path, required=True)
    p.add_argument('--build-evidence', type=Path, required=True)
    p = sub.add_parser('evidence')
    p.add_argument('--candidate', type=Path, required=True)
    p.add_argument('--prefix', required=True)
    sub.add_parser('verify')
    p = sub.add_parser('assemble')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--legacy', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    if args.command == 'pack': pack(args.candidate.resolve(), args.source_evidence.resolve(), args.build_evidence.resolve())
    elif args.command == 'evidence': record_evidence(args.candidate.resolve(), args.prefix)
    elif args.command == 'verify': verify()
    else: assemble(args.out.resolve(), args.legacy.resolve())


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print(f'Pages package error: {error}', file=sys.stderr)
        sys.exit(1)
