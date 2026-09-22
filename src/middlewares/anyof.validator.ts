import { type RequestHandler } from 'express';
import { ForbiddenError } from '../utils/customErrors.js';

export const anyOf = (...middlewares: RequestHandler[]): RequestHandler => {
    return async (req, res, next) => {
        let lastError: unknown;

        for (const middleware of middlewares) {
            const passed = await new Promise<boolean>((resolve) => {
                middleware(req, res, (err?: unknown) => {
                    if (err) {
                        lastError = err;
                        return resolve(false);
                    }

                    resolve(true);
                });
            });

            if (passed) return next();
        }

        return next(lastError ?? new ForbiddenError('Insufficient permissions'));
    };
};
