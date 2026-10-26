#!/usr/bin/env python3
"""Offline local D1/R2 maintenance. No remote resources or overwriting restore."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parent.parent


def state_path(root, instance):
    return root / '.wrangler' / ('state' if instance == 'local' else 'development-state')


@contextmanager
def instance_lock(root, instance):
    directory = root / '.wrangler' / 'locks'
    directory.mkdir(parents=True, exist_ok=True)
    # Never unlink a flock file: another process might already hold its inode.
    with (directory / (instance + '.lock')).open('a+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Instance occupée : arrêter son serveur avant la maintenance.')
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def inventory(directory):
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError('Répertoire de données absent ou symbolique.')
    result = {}
    for path in sorted(directory.rglob('*')):
        if path.is_symlink():
            raise ValueError('Lien symbolique refusé dans les données.')
        if path.is_file():
            result[path.relative_to(directory).as_posix()] = {
                'bytes': path.stat().st_size, 'sha256': sha(path)
            }
        elif not path.is_dir():
            raise ValueError('Fichier spécial refusé.')
    if not result:
        raise ValueError('Données vides : initialiser cette instance.')
    return result


def check_sqlite(directory):
    databases = list(directory.rglob('*.sqlite'))
    if not databases:
        raise ValueError('Aucune base SQLite trouvée.')
    # Validate a disposable copy, including WAL, without altering the archive.
    with tempfile.TemporaryDirectory(prefix='domolyma-integrity-') as temporary:
        for index, database in enumerate(databases):
            target = Path(temporary) / (str(index) + '.sqlite')
            shutil.copy2(database, target)
            for suffix in ('-wal', '-shm'):
                sidecar = Path(str(database) + suffix)
                if sidecar.exists():
                    shutil.copy2(sidecar, Path(str(target) + suffix))
            with sqlite3.connect(target) as connection:
                if connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                    raise ValueError('Intégrité SQLite invalide.')
                if connection.execute('PRAGMA foreign_key_check').fetchone():
                    raise ValueError('Référence étrangère SQLite invalide.')


def private_tree(directory):
    directory.chmod(0o700)
    for path in directory.rglob('*'):
        path.chmod(0o700 if path.is_dir() else 0o600)


def verify(archive):
    manifest_path = archive / 'manifest.json'
    if manifest_path.is_symlink():
        raise ValueError('Manifest symbolique refusé.')
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('format') != 'domolyma-local-state-v1':
        raise ValueError('Format de sauvegarde inconnu.')
    if inventory(archive / 'state') != manifest['files']:
        raise ValueError('Empreintes de sauvegarde invalides.')
    check_sqlite(archive / 'state')
    return manifest


def backup(root, instance):
    source = state_path(root, instance)
    before = inventory(source)
    directory = root / '.domolyma-backups'
    directory.mkdir(mode=0o700, exist_ok=True)
    identifier = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    pending = directory / ('.pending-' + identifier)
    final = directory / (instance + '-' + identifier)
    pending.mkdir(mode=0o700)
    try:
        shutil.copytree(source, pending / 'state')
        if before != inventory(source) or before != inventory(pending / 'state'):
            raise ValueError('Données modifiées pendant la copie : sauvegarde abandonnée.')
        revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root,
                                  capture_output=True, text=True, check=True).stdout.strip()
        dirty = bool(subprocess.run(['git', 'status', '--porcelain'], cwd=root,
                                   capture_output=True, text=True, check=True).stdout)
        manifest = {
            'format': 'domolyma-local-state-v1', 'createdAt': datetime.now(timezone.utc).isoformat(),
            'instance': instance, 'revision': revision, 'dirtySource': dirty,
            'files': before,
            'migrations': {p.name: sha(p) for p in sorted((root / 'migrations').glob('*.sql'))},
            'packageLockSha256': sha(root / 'package-lock.json'),
        }
        (pending / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        private_tree(pending)
        verify(pending)
        pending.rename(final)
        return final
    except BaseException:
        shutil.rmtree(pending, ignore_errors=True)
        raise


def restore(root, instance, archive):
    destination = state_path(root, instance)
    # Even an empty existing directory is refused. No rollback over newer writes.
    if destination.exists() or destination.is_symlink():
        raise ValueError('Destination existante : restauration refusée, conserver les saisies.')
    manifest = verify(archive)
    for name, digest in manifest['migrations'].items():
        path = root / 'migrations' / name
        if Path(name).name != name or not path.is_file() or sha(path) != digest:
            raise ValueError('Migration absente ou modifiée : version compatible nécessaire.')
    if manifest['packageLockSha256'] != sha(root / 'package-lock.json'):
        raise ValueError('Runtime différent : restaurer avec le package-lock sauvegardé.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    pending = destination.parent / ('.restore-' + uuid.uuid4().hex)
    try:
        shutil.copytree(archive / 'state', pending)
        if inventory(pending) != manifest['files']:
            raise ValueError('Copie de restauration invalide.')
        private_tree(pending)
        # All supported writers hold the instance lock throughout this operation.
        if destination.exists():
            raise ValueError('Destination créée entre-temps.')
        pending.rename(destination)
    finally:
        if pending.exists():
            shutil.rmtree(pending)


def prepare_release(root, build):
    build()
    revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root,
                              capture_output=True, text=True, check=True).stdout.strip()
    dirty = bool(subprocess.run(['git', 'status', '--porcelain'], cwd=root,
                               capture_output=True, text=True, check=True).stdout)
    directory = root / 'output' / 'releases' / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8])
    directory.mkdir(parents=True, mode=0o700)
    bundle = directory / 'bundle'
    shutil.copytree(root / 'dist', bundle, ignore=shutil.ignore_patterns('.dev.vars*'))
    config = bundle / 'domolyma_local' / 'wrangler.json'
    settings = json.loads(config.read_text())
    settings['vars'] = {'DEMO_MODE': 'local-only', 'APP_REVISION': revision + ('-dirty' if dirty else ''), 'INSTANCE': 'local'}
    for database in settings['d1_databases']:
        database['migrations_dir'] = str(root / 'migrations')
    config.write_text(json.dumps(settings, indent=2) + '\n')
    manifest = {'revision': revision, 'dirtySource': dirty, 'files': inventory(bundle)}
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    private_tree(directory)
    pointer = root / '.wrangler' / 'local-release.json'
    pointer.parent.mkdir(parents=True, exist_ok=True)
    pending = pointer.with_suffix('.pending')
    pending.write_text(json.dumps({'path': str(directory)}) + '\n')
    pending.chmod(0o600)
    pending.replace(pointer)
    print('Version locale préparée :', directory, flush=True)


def release_config(root):
    pointer = root / '.wrangler' / 'local-release.json'
    if not pointer.exists():
        raise ValueError('Version locale absente : lancer npm run prepare:local.')
    directory = Path(json.loads(pointer.read_text())['path'])
    manifest = json.loads((directory / 'manifest.json').read_text())
    if inventory(directory / 'bundle') != manifest['files']:
        raise ValueError('Version locale altérée : préparer une nouvelle version.')
    return directory / 'bundle' / 'domolyma_local' / 'wrangler.json'


def execute(root, instance, action):
    binary = root / 'node_modules' / '.bin'
    state = state_path(root, instance)
    environment = dict(os.environ, DOMOLYMA_INSTANCE=instance)
    def child(command):
        process = subprocess.Popen(command, cwd=root, env=environment, start_new_session=True)
        def forward(number, _frame):
            try:
                os.killpg(process.pid, number)
            except ProcessLookupError:
                pass
        previous = {number: signal.signal(number, forward) for number in (signal.SIGINT, signal.SIGTERM)}
        try:
            code = process.wait()
            if code:
                raise subprocess.CalledProcessError(code, command)
        finally:
            # Retain the data lock until the runtime has actually stopped.
            process.wait()
            for number, handler in previous.items():
                signal.signal(number, handler)
    if action == 'prepare':
        prepare_release(root, lambda: child(['npm', 'run', 'build']))
        return
    if action == 'start':
        child([str(binary / 'wrangler'), 'dev', '--local', '--ip', '127.0.0.1',
               '--port', '5173', '--persist-to', str(state), '--config', str(release_config(root))])
        return
    if action == 'run':
        child([str(binary / 'vite'), '--host', '127.0.0.1'])
        return
    common = ['domolyma-local', '--local', '--persist-to', str(state), '--config', str(root / 'wrangler.jsonc')]
    if action in ('migrate', 'setup'):
        if state.exists() and any(state.rglob('*.sqlite')):
            print('Sauvegarde avant migration :', backup(root, instance), flush=True)
        child([str(binary / 'wrangler'), 'd1', 'migrations', 'apply', *common])
    if action in ('seed', 'setup'):
        for database in (state / 'v3' / 'd1').rglob('*.sqlite'):
            with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as connection:
                has_settings = connection.execute("SELECT name FROM sqlite_master WHERE name='installation_settings'").fetchone()
                if has_settings and connection.execute("SELECT mode FROM installation_settings WHERE id=1").fetchone() == ('real',):
                    raise ValueError('Données réelles : chargement des exemples refusé. Utiliser les migrations uniquement.')
        for fixture in ('demo.sql', 'residents.sql'):
            child([str(binary / 'wrangler'), 'd1', 'execute', *common,
                   '--file', str(root / 'fixtures' / fixture)])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['run', 'prepare', 'start', 'migrate', 'seed', 'setup', 'backup', 'verify', 'restore'])
    parser.add_argument('--instance', choices=['local', 'development'], default='local')
    parser.add_argument('--archive', type=Path)
    args = parser.parse_args()
    if args.action in ('start', 'prepare') and args.instance != 'local':
        parser.error('La version figée concerne uniquement l’instance local.')
    try:
        if args.action == 'verify':
            if not args.archive:
                parser.error('--archive requis')
            verify(args.archive.resolve())
            print('Sauvegarde vérifiée (empreintes et intégrité SQLite).')
            return
        with instance_lock(ROOT, args.instance):
            if args.action == 'backup':
                print(backup(ROOT, args.instance))
            elif args.action == 'restore':
                if not args.archive:
                    parser.error('--archive requis')
                restore(ROOT, args.instance, args.archive.resolve())
                print('Restauration vérifiée vers une instance absente, source conservée.')
            else:
                execute(ROOT, args.instance, args.action)
    except KeyboardInterrupt:
        return 130
    except (ValueError, OSError, sqlite3.Error, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
