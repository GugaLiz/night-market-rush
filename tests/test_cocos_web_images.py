import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location('cocos_web_images', Path(__file__).resolve().parents[1] / 'scripts/optimize-cocos-web-images.py')
images = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(images)


class WebImageOptimizationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.old = (images.ART, images.ORIGINALS, images.PAIRS, images.UI)
        images.ART = self.root / 'art'
        images.ORIGINALS = self.root / 'originals'
        images.PAIRS = self.root / 'pairs.json'
        images.UI = self.root / 'ui'
        images.ART.mkdir()
        images.ORIGINALS.mkdir()
        images.UI.mkdir()
        self.candidate = self.root / 'candidate'
        self.output = self.root / 'optimized'
        self.uuid = '01234567-89ab-cdef-0123-456789abcdef'
        self.png = b'known PNG fixture'
        self.webp = b'known verified WebP fixture'
        (images.ART / 'game.png').write_bytes(self.png)
        (images.ART / 'game.png.meta').write_text(json.dumps({'uuid': self.uuid}), encoding='utf-8')
        (images.ORIGINALS / 'game.webp').write_bytes(self.webp)
        images.PAIRS.write_text(json.dumps({'schema': 1, 'pairs': [{
            'name': 'game.png', 'pngSha256': hashlib.sha256(self.png).hexdigest(),
            'webpSha256': hashlib.sha256(self.webp).hexdigest()}]}), encoding='utf-8')
        (self.candidate / 'src').mkdir(parents=True)
        (self.candidate / 'src/settings.json').write_text(json.dumps({
            'CocosEngine': '3.8.8', 'engine': {'platform': 'web-mobile'}}), encoding='utf-8')
        self.native = Path('assets/resources/native/01') / (self.uuid + '.png')
        self.imported = Path('assets/resources/import/01') / (self.uuid + '.json')
        (self.candidate / self.native).parent.mkdir(parents=True)
        (self.candidate / self.imported).parent.mkdir(parents=True)
        (self.candidate / self.native).write_bytes(self.png)
        self.asset_json = [1, 0, 0, ['cc.ImageAsset'], 0, [{'fmt': '0', 'w': 2, 'h': 1}, -1]]
        (self.candidate / self.imported).write_text(json.dumps(self.asset_json), encoding='utf-8')

    def tearDown(self):
        images.ART, images.ORIGINALS, images.PAIRS, images.UI = self.old
        self.tmp.cleanup()

    def test_selects_webp_with_png_fallback_on_an_independent_copy(self):
        images.optimize(self.candidate, self.output)
        self.assertEqual((self.output / self.native).read_bytes(), self.png)
        self.assertEqual((self.output / self.native.with_suffix('.webp')).read_bytes(), self.webp)
        asset = json.loads((self.output / self.imported).read_text())
        self.assertEqual(asset[5][0], {'fmt': '4_0', 'w': 2, 'h': 1})
        self.assertEqual(json.loads((self.candidate / self.imported).read_text())[5][0]['fmt'], '0')
        self.assertFalse((self.candidate / self.native.with_suffix('.webp')).exists())

    def test_refuses_changed_source_candidate_or_serialization(self):
        (images.ORIGINALS / 'game.webp').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'source pair changed'):
            images.optimize(self.candidate, self.output)
        (images.ORIGINALS / 'game.webp').write_bytes(self.webp)
        (self.candidate / self.native).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'differs from source'):
            images.optimize(self.candidate, self.output)
        (self.candidate / self.native).write_bytes(self.png)
        self.asset_json[5][0]['fmt'] = '5'
        (self.candidate / self.imported).write_text(json.dumps(self.asset_json))
        with self.assertRaisesRegex(ValueError, 'serialization'):
            images.optimize(self.candidate, self.output)
        self.assertFalse(self.output.exists())

    def test_refuses_existing_or_nested_output(self):
        with self.assertRaisesRegex(ValueError, 'new independent'):
            images.optimize(self.candidate, self.candidate)
        with self.assertRaisesRegex(ValueError, 'new independent'):
            images.optimize(self.candidate, self.candidate / 'nested')
        self.output.mkdir()
        with self.assertRaisesRegex(ValueError, 'new independent'):
            images.optimize(self.candidate, self.output)

    def test_home_preloads_require_matching_assets_and_leave_source_untouched(self):
        paths = []
        for directory, name, uuid, contents in (
                (images.ART, 'clay-chibi-home.png', self.uuid, self.png),
                (images.ART, 'clay-market-mascots.png', '12345678-89ab-cdef-0123-456789abcdef', b'mascot'),
                (images.UI, 'delivery-box.png', '23456789-89ab-cdef-0123-456789abcdef', b'logo')):
            source = directory / name
            source.write_bytes(contents)
            Path(str(source) + '.meta').write_text(json.dumps({'uuid': uuid}))
            native = images.asset_path(source)
            (self.candidate / native).parent.mkdir(parents=True, exist_ok=True)
            (self.candidate / native).write_bytes(contents)
            paths.append(native)
        (self.candidate / 'boot-art').mkdir()
        (self.candidate / 'boot-art/courier.webp').write_bytes(self.webp)
        original = '<head></head><body>' + images.BOOT_IMAGE + '</body>'
        (self.candidate / 'index.html').write_text(original)
        planned = [(paths[0].with_suffix('.webp'), self.webp),
                   (paths[1].with_suffix('.webp'), b'webp mascot')]
        html = images.home_preloads(self.candidate, planned).decode()
        self.assertIn(images.PRELOAD_MARKER, html)
        self.assertIn(paths[0].with_suffix('.webp').as_posix(), html)
        self.assertIn(paths[0].as_posix(), html)
        self.assertIn(paths[2].as_posix(), html)
        self.assertIn("link.crossOrigin = 'anonymous'", html)
        self.assertIn('crossorigin="anonymous"', html)
        self.assertEqual((self.candidate / 'index.html').read_text(), original)
        (self.candidate / 'boot-art/courier.webp').write_bytes(b'different')
        with self.assertRaisesRegex(ValueError, 'Boot courier differs'):
            images.home_preloads(self.candidate, planned)
        (self.candidate / 'boot-art/courier.webp').write_bytes(self.webp)
        (self.candidate / paths[2]).write_bytes(b'different')
        with self.assertRaisesRegex(ValueError, 'logo differs'):
            images.home_preloads(self.candidate, planned)

    def test_startup_inline_validates_exact_scripts_and_relocates_map(self):
        originals = images.STARTUP_SCRIPTS
        self.addCleanup(setattr, images, 'STARTUP_SCRIPTS', originals)
        sources = [b'/* polyfill */', b'/* system */']
        images.STARTUP_SCRIPTS = tuple((path, hashlib.sha256(data).hexdigest())
                                       for (path, _), data in zip(originals, sources))
        for (path, _), data in zip(images.STARTUP_SCRIPTS, sources):
            (self.candidate / path).write_bytes(data)
        map_path = self.candidate / 'src/import-map.json'
        map_path.write_text(json.dumps({'imports': {'cc': './../cocos-js/cc.js'}}))
        engine = self.candidate / 'cocos-js/cc.js'
        engine.parent.mkdir()
        engine.write_text('fixture')
        html = ('<head></head><body>' + ''.join(images.STARTUP_TAGS) + '</body>').encode()
        result = images.optimize_startup(self.candidate, html)
        self.assertIn(b'<script>/* polyfill */</script>', result)
        self.assertIn(b'<script>/* system */</script>', result)
        self.assertIn(b'"cc":"./cocos-js/cc.js"', result)
        self.assertNotIn(b'src="src/system.bundle.js"', result)
        self.assertEqual(images.optimize_startup(self.candidate, result), result)
        map_path.write_text(json.dumps({'imports': {'cc': '../other.js'}}))
        self.assertEqual(images.optimize_startup(self.candidate, html), html)
        map_path.write_text(json.dumps({'imports': {'cc': './../cocos-js/cc.js'}}))
        unsafe = b'bad </ScRiPt> injection'
        (self.candidate / images.STARTUP_SCRIPTS[0][0]).write_bytes(unsafe)
        images.STARTUP_SCRIPTS = ((images.STARTUP_SCRIPTS[0][0], hashlib.sha256(unsafe).hexdigest()),
                                  images.STARTUP_SCRIPTS[1])
        self.assertEqual(images.optimize_startup(self.candidate, html), html)
        self.assertEqual(images.optimize_startup(self.candidate, html.replace(b'system.bundle.js', b'system.hash.js')), html.replace(b'system.bundle.js', b'system.hash.js'))

    def test_main_preload_skips_versioned_remote_or_missing_bundle(self):
        html = b'<head></head><body></body>'
        settings = {'assets': {'server': '', 'bundleVers': {}, 'remoteBundles': [],
                               'preloadBundles': [{'bundle': 'main'}]}}
        settings_path = self.candidate / 'src/settings.json'
        settings_path.write_text(json.dumps(settings))
        main = self.candidate / 'assets/main/index.js'
        main.parent.mkdir(parents=True)
        main.write_text('fixture')
        result = images.preload_main_bundle(self.candidate, html)
        self.assertIn(b'as="script" crossorigin="anonymous" href="./assets/main/index.js"', result)
        self.assertEqual(images.preload_main_bundle(self.candidate, result), result)
        for change in ('versioned', 'remote', 'subpackage', 'preload_version', 'missing'):
            with self.subTest(change=change):
                other = json.loads(json.dumps(settings))
                if change == 'versioned':
                    other['assets']['bundleVers']['main'] = '1234'
                elif change == 'remote':
                    other['assets']['server'] = 'https://cdn.example/'
                elif change == 'subpackage':
                    other['assets']['subpackages'] = ['main']
                elif change == 'preload_version':
                    other['assets']['preloadBundles'][0]['version'] = '1234'
                else:
                    main.unlink()
                settings_path.write_text(json.dumps(other))
                self.assertEqual(images.preload_main_bundle(self.candidate, html), html)


if __name__ == '__main__':
    unittest.main()
