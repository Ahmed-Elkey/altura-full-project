import importlib.util
import pathlib
import tarfile
import tempfile
import unittest

class PackageTests(unittest.TestCase):
    def test_upload_contains_build_inputs_but_no_private_or_generated_files(self):
        spec = importlib.util.spec_from_file_location('package', pathlib.Path(__file__).with_name('package.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp) / 'project'
            paths = ['package.json', 'app/page.tsx', 'public/image.webp', 'backend/src/main.ts',
                     'backend/prisma/schema.prisma', 'deploy/demo-bootstrap.cjs', 'app/.env.local',
                     'app/private/secrets.json', 'backend/.env', 'TEAMMATE_LOCAL_CREDENTIALS.json',
                     '.pg/data', 'node_modules/package.json', 'runtime/test.json', 'public/debug.log',
                     'public/source-assets/hero-master.png']
            for name in paths:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('fixture')
            (root / 'public' / 'linked-secret').symlink_to(root / 'TEAMMATE_LOCAL_CREDENTIALS.json')
            output = pathlib.Path(temp) / 'source.tar.gz'
            module.create_archive(root, output)
            with tarfile.open(output) as archive:
                names = set(archive.getnames())
            self.assertEqual(names, {'package.json', 'app/page.tsx', 'public/image.webp',
                                    'backend/src/main.ts', 'backend/prisma/schema.prisma', 'deploy/demo-bootstrap.cjs'})

if __name__ == '__main__':
    unittest.main()
