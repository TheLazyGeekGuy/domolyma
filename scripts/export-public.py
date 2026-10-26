#!/usr/bin/env python3
"""Prepare a source-only publication without private history or internal dossiers."""
from pathlib import Path
import argparse
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
DIRECTORIES=['apps','packages','migrations','fixtures','website','public','.github']
FILES=['package.json','package-lock.json','tsconfig.json','vitest.config.ts','vite.config.ts','vite.pages.config.ts','index.html','.gitignore','.gitleaks.toml','.dev.vars.example','wrangler.jsonc','design/palettes.json','design/brand/domolyma-logo-original.png','scripts/build-site.py','scripts/build-pages.mjs','scripts/pdf-assets.ts','scripts/local-instance.py','scripts/project-manifest.py','scripts/check-publication.py','scripts/export-public.py','docs/github-pages.md']
EXCLUDED={'website/README.md','website/PUBLIC-README.md'}
def export(destination):
    if destination.exists():raise ValueError('Destination already exists; export refused.')
    destination.mkdir(parents=True)
    tracked=set(subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines())
    # Include new implementation files deliberately; do not copy ignored runtime state.
    names=set(FILES) | {path.relative_to(ROOT).as_posix() for path in (ROOT/'tests').glob('*.test.ts')} | {'tests/test_local_instance.py'}
    for directory in DIRECTORIES:
        for path in (ROOT/directory).rglob('*'):
            if path.is_file() and not path.is_symlink() and '__pycache__' not in path.parts:names.add(path.relative_to(ROOT).as_posix())
    for name in sorted(names-EXCLUDED):
        path=ROOT/name
        if not path.is_file() or path.is_symlink():raise ValueError('Missing or symbolic source: '+name)
        target=destination/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,target)
    readme=ROOT/'website/PUBLIC-README.md'
    shutil.copyfile(readme if readme.exists() else ROOT/'README.md',destination/'README.md')
    print('Prepared publication files:',len(names-EXCLUDED)+1)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('destination',type=Path);export(parser.parse_args().destination)
