const app = require('./app');
const config = require('./config');
const prisma = require('./config/database');
const { schedule: scheduleCleanup } = require('./jobs/cleanupLoginEvents');

async function main() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');

    scheduleCleanup();
    console.log('Login events cleanup scheduled (every 6h, retention 48h)');

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port} [${config.nodeEnv}]`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

main();
