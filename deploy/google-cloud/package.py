"""Upload build inputs only, never the local database or credentials."""
import pathlib
import sys
import tarfile

FILES = ('package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts',
         'tsconfig.json', 'postcss.config.mjs', '.dockerignore', 'compose.yaml',
         'backend/package.json', 'backend/package-lock.json', 'backend/tsconfig.json',
         'backend/tsconfig.build.json', 'backend/nest-cli.json')
DIRECTORIES = ('app', 'components', 'data', 'lib', 'public', 'styles', 'deploy',
               'backend/src', 'backend/prisma')

def permitted(path, root):
    parts = path.relative_to(root).parts
    blocked = {'node_modules', '__pycache__', 'private', 'secrets', '.git', '.next', 'dist', 'source-assets'}
    return (not any(part in blocked for part in parts)
            and not any(part.startswith('.env') for part in parts)
            and not any('CREDENTIALS' in part.upper() for part in parts)
            and path.suffix.lower() not in {'.log', '.backup', '.dump', '.zip', '.pyc'}
            and not any((root.joinpath(*parts[:i])).is_symlink() for i in range(1, len(parts)+1)))

def create_archive(root, output):
    root = pathlib.Path(root).resolve()
    paths = [root / name for name in FILES]
    for directory in DIRECTORIES:
        folder = root / directory
        if folder.is_dir() and not folder.is_symlink():
            paths.extend(folder.rglob('*'))
    with tarfile.open(output, 'w:gz') as archive:
        for path in sorted(set(paths)):
            if path.is_file() and permitted(path, root):
                archive.add(path, arcname=str(path.relative_to(root)), recursive=False)

if __name__ == '__main__':
    create_archive(sys.argv[1], sys.argv[2])
