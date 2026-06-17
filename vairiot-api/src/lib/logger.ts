import winston from 'winston';
const { combine, timestamp, json, colorize, simple } = winston.format;
const isTest = process.env.NODE_ENV === 'test';
const isDev  = process.env.NODE_ENV === 'development';
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  silent: isTest,
  format: combine(timestamp(), isDev ? colorize() : json(), isDev ? simple() : json()),
  transports: [new winston.transports.Console()],
});
