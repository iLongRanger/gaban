import fs from 'node:fs';
import path from 'node:path';

function isoDay(value) {
  return value.toISOString().slice(0, 10);
}

function writeSetting(db, key, value, at) {
  db.prepare(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), at.toISOString());
}

export class BackupService {
  constructor({ db, backupDir = path.resolve(process.cwd(), 'data/backups'), logger = console } = {}) {
    if (!db) throw new Error('db required');
    this.db = db;
    this.backupDir = backupDir;
    this.logger = logger;
  }

  backupPath({ now = new Date() } = {}) {
    return path.join(this.backupDir, `${isoDay(now)}.sqlite`);
  }

  hasBackupForDay({ now = new Date() } = {}) {
    return fs.existsSync(this.backupPath({ now }));
  }

  async createDailyBackup({ now = new Date(), force = false } = {}) {
    fs.mkdirSync(this.backupDir, { recursive: true });
    const target = this.backupPath({ now });
    if (!force && fs.existsSync(target)) {
      writeSetting(this.db, 'outreach.last_backup_path', target, now);
      return { created: false, path: target };
    }

    await this.db.backup(target);
    writeSetting(this.db, 'outreach.last_backup_path', target, now);
    writeSetting(this.db, 'outreach.last_backup_at', now.toISOString(), now);
    this.logger.log?.(`SQLite backup written to ${target}`);
    return { created: true, path: target };
  }
}
