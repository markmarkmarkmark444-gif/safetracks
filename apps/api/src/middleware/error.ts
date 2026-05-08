import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const message = statusCode >= 500 ? 'Internal server error' : err.message;

  if (statusCode >= 500) {
    logger.error('Unhandled error', { message: err.message, stack: err.stack });
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env['NODE_ENV'] === 'development' && { detail: err.message, stack: err.stack }),
  });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}
