#!/usr/bin/env python3
"""Build the public presentation from an explicit allowlist, without app data."""
from pathlib import Path
import hashlib
import json
import shutil
import re
import posixpath
from html import escape

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'website'
OUTPUT = ROOT / 'dist' / 'site'
PAGES = {
    'home': ('accueil', {'fr': '', 'en': 'en'}),
    'features': ('fonctionnalites', {'fr': 'fonctionnalites', 'en': 'en/features'}),
    'project': ('projet', {'fr': 'projet', 'en': 'en/project'}),
}


def catalogs():
    translations = {locale: json.loads((SOURCE / 'i18n' / (locale + '.json')).read_text())
                    for locale in ['fr', 'en']}
    if translations['fr'].keys() != translations['en'].keys():
        raise ValueError('Translation catalogs must have identical keys')
    if any(not isinstance(value, str) or not value.strip()
           for messages in translations.values() for value in messages.values()):
        raise ValueError('Empty or invalid translation')
    return translations


def render(template, values, messages):
    template = re.sub(r'{{t:([\w.]+)}}', lambda match: escape(messages[match[1]], quote=True), template)
    for key, value in values.items():
        template = template.replace('{{' + key + '}}', value)
    if '{{' in template:
        raise ValueError('Unresolved template placeholder')
    return template



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
    translations = catalogs()
    for page_id, (page, paths) in PAGES.items():
        for locale, path in paths.items():
            def url(target):
                return posixpath.relpath(target or '.', path or '.') + '/'
            values = {
                'root': url(''), 'locale': locale,
                'title': escape(translations[locale]['meta.' + page_id + '.title'], quote=True),
                'description': escape(translations[locale]['meta.' + page_id + '.description'], quote=True),
                'home_url': url(PAGES['home'][1][locale]),
                'features_url': url(PAGES['features'][1][locale]),
                'project_url': url(PAGES['project'][1][locale]),
                'demo_url': url('demo') + '?lang=' + locale,
                'fr_url': url(paths['fr']), 'en_url': url(paths['en']),
                'current_fr': 'aria-current="true"' if locale == 'fr' else '',
                'current_en': 'aria-current="true"' if locale == 'en' else '',
                'current_features': 'aria-current="page"' if page_id == 'features' else '',
                'current_project': 'aria-current="page"' if page_id == 'project' else '',
            }
            html = render(layout.replace('{{content}}', (SOURCE / 'pages' / (page + '.html')).read_text()),
                          values, translations[locale])
            destination = OUTPUT / path
            destination.mkdir(parents=True, exist_ok=True)
            (destination / 'index.html').write_text(html)
    (OUTPUT / '.nojekyll').write_text('')
    fr, en = translations['fr'], translations['en']
    (OUTPUT / '404.html').write_text(
        '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
        '<title>' + escape(fr['notfound.title']) + ' / ' + escape(en['notfound.title']) + '</title>'
        '<style>body{font:18px/1.7 system-ui;color:#292864;margin:10vh 8vw}</style>'
        '<h1>' + escape(fr['notfound.heading']) + '</h1><p lang="en">' + escape(en['notfound.heading']) + '</p>'
        '<p>' + escape(fr['notfound.home']) + ' · <span lang="en">' + escape(en['notfound.home']) + '</span></p></html>')

    files = {p.relative_to(OUTPUT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(OUTPUT.rglob('*')) if p.is_file()}
    (OUTPUT / 'build-manifest.json').write_text(json.dumps({'format': 'domolyma-public-site-v1', 'files': files}, indent=2) + '\n')
    print(f'Site statique : {len(PAGES) * 2} pages bilingues, {len(files)} fichiers — {OUTPUT}')


if __name__ == '__main__':
    build()
