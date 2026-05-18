import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  if (err.message.includes('Token')) {
    return res.status(400).json({ error: err.message });
  }

  if (err.message.includes('Credenciales') || err.message.includes('contraseña') || err.message.includes('OAuth')) {
    return res.status(401).json({ error: err.message });
  }

  logger.error('Unhandled error:', err);

  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
}
