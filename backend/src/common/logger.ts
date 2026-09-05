import { env } from '../config/env';

type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: unknown): void {
  if (env.isTest && level !== 'error') return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) fn(line, meta);
  else fn(line);
}

export const logger = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
