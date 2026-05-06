const prisma = require('../config/database');

async function cleanup() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const { count } = await prisma.loginEvent.deleteMany({
    where: { created_at: { lt: cutoff } },
  });
  if (count > 0) console.log(`[cleanup] removed ${count} login_events older than 48h`);
}

function schedule() {
  cleanup().catch((err) => console.error('[cleanup] initial run failed:', err.message));
  setInterval(() => {
    cleanup().catch((err) => console.error('[cleanup] periodic run failed:', err.message));
  }, 6 * 60 * 60 * 1000);
}

module.exports = { cleanup, schedule };
