import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function isMalformedJson(error: unknown) {
  return (
    error instanceof SyntaxError &&
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 400 &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  );
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (isMalformedJson(err)) {
    res.status(400).json({ error: 'بيانات JSON غير صالحة' });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'بيانات غير صالحة', details: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ في الخادم' });
}
