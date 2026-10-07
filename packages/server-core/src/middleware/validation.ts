import { z } from 'zod';

export const idParam = z.string().uuid();
export const externalIdParam = z.coerce.number().int().positive();
