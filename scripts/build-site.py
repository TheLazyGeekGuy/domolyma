#!/usr/bin/env python3
"""Build the public presentation from an explicit allowlist, without app data."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'website'
OUTPUT = ROOT / 'dist' / 'site'
PAGES = [
    ('', 'accueil', 'Domolyma — Le dossier de vie de vos biens',
     'Documents, interventions et décisions : découvrez Domolyma, le dossier de vie de votre copropriété.'),
    ('fonctionnalites', 'fonctionnalites', 'Les fonctionnalités — Domolyma',
     'Coffre documentaire, signalements, équipements, préparation des assemblées et suivi du budget : les fonctionnalités de l’alpha Domolyma.'),
    ('projet', 'projet', 'Le projet — Domolyma',
     'Le projet Domolyma, son état actuel et les prochaines étapes pour accompagner la vie d’une copropriété.'),
    ('demo', 'demo', 'La démonstration — Domolyma',
     'La démonstration interactive de Domolyma est en préparation. Découvrez les parcours prévus avec des données entièrement fictives.'),
]


def build():
    if OUTPUT.is_symlink():
        raise ValueError('Destination symbolique refusée')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # This directory is solely the generated website, never the app release.
    for child in OUTPUT.iterdir():
        if child.is_dir() and not child.is_symlink():
            shutil.rmtree(child)
        else:
            child.unlink()
    assets = OUTPUT / 'assets'
    assets.mkdir()
    for name in ['site.css', 'site.js', 'residence.jpg']:
        shutil.copyfile(SOURCE / 'assets' / name, assets / name)
    shutil.copyfile(ROOT / 'design/brand/domolyma-logo-original.png', assets / 'domolyma-logo-original.png')
    for package, output in [('manrope', 'manrope.woff2'), ('dm-sans', 'dm-sans.woff2')]:
        base = ROOT / 'node_modules/@fontsource-variable' / package
        shutil.copyfile(base / 'files' / (package + '-latin-wght-normal.woff2'), assets / output)
        shutil.copyfile(base / 'LICENSE', assets / (package + '-LICENSE.txt'))
    layout = (SOURCE / 'layout.html').read_text()
    for path, page, title, description in PAGES:
        root = '../' if path else './'
        values = {'root': root, 'title': title, 'description': description,
                  'content': (SOURCE / 'pages' / (page + '.html')).read_text(),
                  'current_features': 'aria-current="page"' if page == 'fonctionnalites' else '',
                  'current_project': 'aria-current="page"' if page == 'projet' else '',
                  'current_demo': 'aria-current="page"' if page == 'demo' else ''}
        html = layout.replace('{{content}}', values.pop('content'))
        for key, value in values.items():
            html = html.replace('{{' + key + '}}', value)
        assert '{{' not in html, f'Unresolved placeholder: {page}'
        destination = OUTPUT / path
        destination.mkdir(exist_ok=True)
        (destination / 'index.html').write_text(html)
    (OUTPUT / '.nojekyll').write_text('')
    (OUTPUT / '404.html').write_text('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page introuvable — Domolyma</title><style>body{font:18px/1.7 system-ui;color:#292864;margin:10vh 8vw}h1{font-size:2.5rem}</style><h1>Cette page est introuvable.</h1><p>Retrouvez l’accueil de Domolyma depuis l’adresse du site.</p></html>')
    files = {p.relative_to(OUTPUT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(OUTPUT.rglob('*')) if p.is_file()}
    (OUTPUT / 'build-manifest.json').write_text(json.dumps({'format': 'domolyma-public-site-v1', 'files': files}, indent=2) + '\n')
    print(f'Site statique : {len(PAGES)} pages, {len(files)} fichiers — {OUTPUT}')


if __name__ == '__main__':
    build()
