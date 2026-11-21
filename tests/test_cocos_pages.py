import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('cocos_pages', Path(__file__).resolve().parents[1] / 'scripts/cocos_pages.py')
pages = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pages)


class PagesPackageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.original = (pages.ROOT, pages.COCOS, pages.ARCHIVE, pages.MANIFEST)
        pages.ROOT = self.root
        pages.COCOS = self.root / 'cocos'
        pages.ARCHIVE = self.root / 'cocos-web.zip'
        pages.MANIFEST = self.root / 'manifest.json'
        for name in ('assets', 'settings', 'build-templates'):
            (pages.COCOS / name).mkdir(parents=True)
        (pages.COCOS / 'assets/main.ts').write_bytes(b'one\r\ntwo\r\n')
        policy = pages.COCOS / 'assets/scripts/runtime/web-build-policy.ts'
        policy.parent.mkdir(parents=True)
        policy.write_bytes(b'export const WEB_PERSISTENCE_CANDIDATE: boolean = false;\n')
        (pages.COCOS / 'assets/art.png').write_bytes(b'\x00\r\n\x01')
        (pages.COCOS / 'settings/project.json').write_bytes(b'{}\r\n')
        (pages.COCOS / 'build-templates/index.ejs').write_bytes(b'<html>\r\n')
        (pages.COCOS / 'package.json').write_bytes(b'{}\n')
        (pages.COCOS / 'tsconfig.json').write_bytes(b'{}\n')
        with zipfile.ZipFile(pages.ARCHIVE, 'w') as archive:
            archive.writestr('index.html', 'COCOS')
            archive.writestr('assets/game.png', b'asset')
        self.write_manifest()

    def tearDown(self):
        pages.ROOT, pages.COCOS, pages.ARCHIVE, pages.MANIFEST = self.original
        self.temp.cleanup()

    def write_manifest(self):
        manifest = {'schema': 1, 'engine': '3.8.8', 'platform': 'web-mobile', 'debug': False,
                    'prototype': True, 'existingSaveEnabled': True,
                    'archiveSha256': hashlib.sha256(pages.ARCHIVE.read_bytes()).hexdigest(),
                    'sourceSha256': pages.source_files()}
        pages.MANIFEST.write_text(json.dumps(manifest), encoding='utf8')

    def test_cross_platform_text_and_exact_binary(self):
        (pages.COCOS / 'assets/main.ts').write_bytes(b'one\ntwo\n')
        pages.verify()
        (pages.COCOS / 'assets/art.png').write_bytes(b'\x00\n\x01')
        with self.assertRaisesRegex(ValueError, 'source changed'):
            pages.verify()

    def test_added_removed_and_modified_source_refuse_publish(self):
        path = pages.COCOS / 'assets/new.ts'
        path.write_text('new', encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'source changed'):
            pages.verify()
        path.unlink()
        source = pages.COCOS / 'assets/main.ts'
        source.unlink()
        with self.assertRaisesRegex(ValueError, 'source changed'):
            pages.verify()
        source.write_text('different', encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'source changed'):
            pages.verify()

    def test_archive_tampering_and_unsafe_paths_refuse_publish(self):
        pages.ARCHIVE.write_bytes(pages.ARCHIVE.read_bytes() + b'tampered')
        with self.assertRaisesRegex(ValueError, 'archive hash'):
            pages.verify()
        with zipfile.ZipFile(pages.ARCHIVE, 'w') as archive:
            archive.writestr('index.html', 'COCOS')
            archive.writestr('../outside.txt', 'unsafe')
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, 'Unsafe archive entry'):
            pages.verify()

    def test_assembly_preserves_legacy_and_refuses_overwrite(self):
        legacy = self.root / 'legacy-input'
        legacy.mkdir()
        (legacy / 'index.html').write_text('OLD', encoding='utf8')
        out = self.root / 'site'
        pages.assemble(out, legacy)
        self.assertEqual((out / 'index.html').read_text(), 'COCOS')
        self.assertEqual((out / 'legacy/index.html').read_text(), 'OLD')
        self.assertFalse((out / 'candidate-build.json').exists())
        with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
            pages.assemble(out, legacy)

    def test_evidence_requires_exact_source_snapshot(self):
        runtime = self.root / '.runtime'
        runtime.mkdir()
        snapshot = runtime / 'cocos-web-candidate-test'
        shutil.copytree(pages.COCOS, snapshot)
        policy = snapshot / 'assets/scripts/runtime/web-build-policy.ts'
        policy.write_bytes(policy.read_bytes().replace(b'boolean = false;', b'boolean = true;'))
        candidate = self.root / 'candidate'
        candidate.mkdir()
        (candidate / 'index.html').write_text('CANDIDATE', encoding='utf8')
        (candidate / 'candidate-build.json').write_text(json.dumps({
            'purpose': 'isolated-web-release-candidate', 'existingSaveEnabled': True, 'snapshot': str(snapshot),
        }), encoding='utf8')
        pages.record_evidence(candidate, 'good')
        source = json.loads((runtime / 'good-source.json').read_text(encoding='utf8'))
        self.assertEqual(len(source), len(pages.source_files()))
        (snapshot / 'assets/main.ts').write_text('different', encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'snapshot differs'):
            pages.record_evidence(candidate, 'bad')
        self.assertFalse((runtime / 'bad-source.json').exists())


if __name__ == '__main__':
    unittest.main()
