import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '@cashier/db';

// The class itself lives in @cashier/db: branch scoping raises it from inside a
// transaction, and the database package must not depend on the API.
export { HttpError };

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
