import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('local_instance', Path(__file__).resolve().parents[1] / 'scripts/local-instance.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


class LocalMaintenanceTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'fixture'], check=True)
        (self.root / 'package-lock.json').write_text('{}')
        (self.root / 'migrations').mkdir()
        (self.root / 'migrations/0001.sql').write_text('CREATE TABLE test(id);')
        state = ops.state_path(self.root, 'local')
        state.mkdir(parents=True)
        with sqlite3.connect(state / 'personal.sqlite') as db:
            db.execute('CREATE TABLE test(value TEXT)')
            db.execute('INSERT INTO test VALUES (?)', ('saisie conservée',))
        (state / 'r2').mkdir()
        (state / 'r2/photo.bin').write_bytes(b'original-file\x00\xff')

    def test_roundtrip_database_and_binary_and_no_overwrite(self):
        archive = ops.backup(self.root, 'local')
        ops.restore(self.root, 'development', archive)
        destination = ops.state_path(self.root, 'development')
        self.assertEqual(ops.inventory(destination), ops.inventory(ops.state_path(self.root, 'local')))
        with sqlite3.connect(destination / 'personal.sqlite') as db:
            self.assertEqual(db.execute('SELECT value FROM test').fetchone()[0], 'saisie conservée')
        with self.assertRaisesRegex(ValueError, 'Destination existante'):
            ops.restore(self.root, 'development', archive)
        self.assertEqual((archive.stat().st_mode & 0o777), 0o700)
        self.assertEqual(((archive / 'state/r2/photo.bin').stat().st_mode & 0o777), 0o600)

    def test_tampered_missing_and_extra_files_refused(self):
        archive = ops.backup(self.root, 'local')
        photo = archive / 'state/r2/photo.bin'
        photo.write_bytes(b'tamper')
        with self.assertRaisesRegex(ValueError, 'Empreintes'):
            ops.restore(self.root, 'development', archive)
        photo.unlink()
        with self.assertRaisesRegex(ValueError, 'Empreintes'):
            ops.verify(archive)
        photo.write_bytes(b'original-file\x00\xff')
        (archive / 'state/r2/unknown').write_text('extra')
        with self.assertRaisesRegex(ValueError, 'Empreintes'):
            ops.verify(archive)
        self.assertFalse(ops.state_path(self.root, 'development').exists())

    def test_changed_migration_or_runtime_refused(self):
        archive = ops.backup(self.root, 'local')
        migration = self.root / 'migrations/0001.sql'
        migration.write_text('changed')
        with self.assertRaisesRegex(ValueError, 'Migration'):
            ops.restore(self.root, 'development', archive)
        migration.write_text('CREATE TABLE test(id);')
        (self.root / 'package-lock.json').write_text('{"version":2}')
        with self.assertRaisesRegex(ValueError, 'Runtime différent'):
            ops.restore(self.root, 'development', archive)

    def test_corrupt_database_rejected_even_with_matching_hash(self):
        archive = ops.backup(self.root, 'local')
        (archive / 'state/personal.sqlite').write_bytes(b'not sqlite')
        manifest = json.loads((archive / 'manifest.json').read_text())
        manifest['files'] = ops.inventory(archive / 'state')
        (archive / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(sqlite3.DatabaseError):
            ops.verify(archive)

    def test_symlink_refused(self):
        state = ops.state_path(self.root, 'local')
        (state / 'external').symlink_to(self.root / 'package-lock.json')
        with self.assertRaisesRegex(ValueError, 'symbolique'):
            ops.backup(self.root, 'local')

    def test_instance_lock_blocks_writers_and_backup(self):
        with ops.instance_lock(self.root, 'local'):
            with self.assertRaisesRegex(ValueError, 'occupée'):
                with ops.instance_lock(self.root, 'local'):
                    self.fail('Lock bypassed')
            with ops.instance_lock(self.root, 'development'):
                pass
        with ops.instance_lock(self.root, 'local'):
            pass

    def test_wal_records_are_preserved(self):
        state = ops.state_path(self.root, 'local')
        db = sqlite3.connect(state / 'personal.sqlite')
        self.addCleanup(db.close)
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('INSERT INTO test VALUES (?)', ('écriture WAL',))
        db.commit()
        archive = ops.backup(self.root, 'local')
        ops.restore(self.root, 'development', archive)
        with sqlite3.connect(ops.state_path(self.root, 'development') / 'personal.sqlite') as recovered:
            self.assertEqual(recovered.execute('SELECT count(*) FROM test').fetchone()[0], 2)

    def test_local_release_is_independent_and_tampering_is_refused(self):
        worker = self.root / 'dist/domolyma_local'
        worker.mkdir(parents=True)
        (worker / 'wrangler.json').write_text(json.dumps({'d1_databases': [{'migrations_dir': '../../migrations'}]}))
        (worker / 'index.js').write_text('compiled-v1')
        (worker / '.dev.vars').write_text('DO_NOT_COPY=private')
        ops.prepare_release(self.root, lambda: None)
        config = ops.release_config(self.root)
        (worker / 'index.js').write_text('compiled-v2')
        self.assertEqual((config.parent / 'index.js').read_text(), 'compiled-v1')
        self.assertFalse((config.parent / '.dev.vars').exists())
        self.assertEqual(json.loads(config.read_text())['vars']['DEMO_MODE'], 'local-only')
        (config.parent / 'index.js').write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'altérée'):
            ops.release_config(self.root)

    def test_residence_budget_migration_preserves_existing_records(self):
        project = Path(__file__).resolve().parents[1]
        with sqlite3.connect(':memory:') as db:
            for name in ['migrations/0001_initial.sql','fixtures/demo.sql','migrations/0002_resident_operations.sql','migrations/0003_building_version.sql','migrations/0004_rentals.sql','fixtures/residents.sql']:
                db.executescript((project / name).read_text())
            tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            columns = {table:[row[1] for row in db.execute(f'PRAGMA table_info("{table}")')] for table in tables}
            before = {table:db.execute(f'SELECT * FROM "{table}"').fetchall() for table in tables}
            db.executescript((project / 'migrations/0005_residence_budget.sql').read_text())
            for table in tables:
                selection = ','.join('"'+column+'"' for column in columns[table])
                self.assertEqual(before[table],db.execute(f'SELECT {selection} FROM "{table}"').fetchall(),table)
            db.executescript((project / 'migrations/0006_incident_followups.sql').read_text())
            for table in tables:
                selection = ','.join('"'+column+'"' for column in columns[table])
                self.assertEqual(before[table],db.execute(f'SELECT {selection} FROM "{table}"').fetchall(),table)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])


if __name__ == '__main__':
    unittest.main()
