export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDb } = await import('./lib/db.js');
    const db = initDb();
    const { StartupRecovery } = await import('../services/startupRecovery.js');
    const Recovery = StartupRecovery as any;
    new Recovery({ db }).run();
    const { BackupService } = await import('../services/backupService.js');
    const Backup = BackupService as any;
    await new Backup({ db }).createDailyBackup();
    const { loadSchedulesOnStartup, loadOutreachWorkerOnStartup } = await import('./lib/scheduler');
    loadSchedulesOnStartup();
    loadOutreachWorkerOnStartup();
  }
}
