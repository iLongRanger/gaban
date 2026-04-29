export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDb } = await import('./lib/db.js');
    initDb();
    const { loadSchedulesOnStartup, loadOutreachWorkerOnStartup } = await import('./lib/scheduler');
    loadSchedulesOnStartup();
    loadOutreachWorkerOnStartup();
  }
}
