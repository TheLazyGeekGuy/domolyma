#!/usr/bin/env python3
"""SHA-256 inventory of Git-indexed files. Excludes itself as data, not as code."""
import argparse
import hashlib
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
def inventory(root):
    tracked=subprocess.run(['git','ls-files','--cached','-z'],cwd=root,capture_output=True,check=True).stdout.decode().split('\0')
    rows=[]
    for name in sorted(set(tracked)-{'','MANIFEST.sha256'}):
        path=root/name
        if path.is_symlink() or not path.is_file():raise ValueError('Fichier indexé absent ou symbolique : '+name)
        if '\n' in name or '\r' in name:raise ValueError('Nom de fichier non pris en charge')
        rows.append(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+name)
    return '\n'.join(rows)+'\n'
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    content=inventory(ROOT);manifest=ROOT/'MANIFEST.sha256'
    if args.check:
        if not manifest.exists() or manifest.read_text()!=content:raise SystemExit('Inventaire périmé : indexer les nouveaux fichiers puis lancer npm run manifest:update.')
        print('Inventaire vérifié : fichiers présents, empreintes et liste indexée conformes.')
    else:
        manifest.write_text(content);print(f'Inventaire régénéré : {len(content.splitlines())} fichiers indexés (hors MANIFEST.sha256).')
