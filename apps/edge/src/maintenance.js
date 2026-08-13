import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

function checksum(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function checkDatabase(path) {
  const db = new DatabaseSync(path);
  try {
    const row = db.prepare('PRAGMA quick_check').get();
    const value = row?.quick_check ?? Object.values(row ?? {})[0];
    if (value !== 'ok') throw new Error(`SQLite quick_check failed: ${String(value)}`);
  } finally {
    db.close();
  }
}

export async function backupEdgeState({ dbPath, keyPath, outDir, revision = 'unknown' }) {
  if (!existsSync(dbPath)) throw new Error(`Edge database does not exist: ${dbPath}`);
  if (!existsSync(keyPath)) throw new Error(`Edge master key does not exist: ${keyPath}`);
  const directory = resolve(outDir);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const database = join(directory, 'edge.db');
  const masterKey = join(directory, 'edge-master.key');
  const source = new DatabaseSync(dbPath);
  try {
    await backup(source, database);
  } finally {
    source.close();
  }
  checkDatabase(database);
  copyFileSync(keyPath, masterKey);
  try { chmodSync(masterKey, 0o600); } catch { /* POSIX modes are not available everywhere. */ }
  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    revision,
    databaseSha256: checksum(database),
    masterKeySha256: checksum(masterKey),
  };
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function verifyEdgeBackup({ backupDir }) {
  const directory = resolve(backupDir);
  const database = join(directory, 'edge.db');
  const masterKey = join(directory, 'edge-master.key');
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1) throw new Error(`Unsupported Edge backup format: ${manifest.formatVersion}`);
  if (checksum(database) !== manifest.databaseSha256) throw new Error('Backup database checksum mismatch');
  if (checksum(masterKey) !== manifest.masterKeySha256) throw new Error('Backup master-key checksum mismatch');
  checkDatabase(database);
  return manifest;
}

export function restoreEdgeState({ backupDir, dbPath, keyPath }) {
  verifyEdgeBackup({ backupDir });
  const directory = resolve(backupDir);
  mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  mkdirSync(dirname(resolve(keyPath)), { recursive: true });
  if (existsSync(dbPath)) {
    const current = new DatabaseSync(dbPath);
    try {
      const checkpoint = current.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
      if (Number(checkpoint?.busy ?? 0) !== 0) throw new Error('Edge database is busy; stop Edge Hub before restore');
    } finally {
      current.close();
    }
  }
  copyFileSync(join(directory, 'edge.db'), dbPath);
  copyFileSync(join(directory, 'edge-master.key'), keyPath);
  try { chmodSync(keyPath, 0o600); } catch { /* POSIX modes are not available everywhere. */ }
  checkDatabase(dbPath);
}
