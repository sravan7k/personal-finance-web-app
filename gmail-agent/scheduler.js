const cron = require('node-cron');
const { runAgent } = require('./agent');

function startScheduler() {
  // Every day at 09:00 AM local time
  cron.schedule('0 9 * * *', async () => {
    try {
      await runAgent();
    } catch (err) {
      console.error('[Gmail Agent] Unhandled scheduler error:', err);
    }
  });

  console.log('[Gmail Agent] Scheduler started — runs daily at 09:00 AM');
}

module.exports = { startScheduler };
