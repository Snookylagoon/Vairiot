import { createApp } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const PORT = Number(process.env.API_PORT) || 3001;

async function main() {
  await prisma.$connect();
  logger.info('Database connected');
  const app = createApp();
  app.listen(PORT, () => {
    logger.info(`Vairiot API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });
}

main().catch((err) => { logger.error('Failed to start', { error: err }); process.exit(1); });
