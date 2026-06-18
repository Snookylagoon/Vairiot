import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(i => `${i.timestamp} [worker] ${i.level}: ${i.message}`),
  ),
  transports: [new winston.transports.Console()],
});
