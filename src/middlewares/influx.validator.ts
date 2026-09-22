import { body, validationResult } from 'express-validator';
import { type Request, type Response, type NextFunction } from 'express';
import { ValidationError } from '../utils/customErrors.js';

export const validateSyncStatesBody = [
    ...['updatedFrom', 'updatedTo'].map((field) =>
        body(field)
            .optional()
            .isString()
            .bail()
            .isISO8601({ strict: true })
            .withMessage(`${field} must be a valid ISO 8601 date`)
            .bail()
            .custom((value: string) => Number.isFinite(Date.parse(value)))
            .withMessage(`${field} must be a valid date`),
    ),
    body('updatedTo')
        .optional()
        .custom((value: string, { req }) => {
            const from = req.body?.updatedFrom;
            if (typeof from === 'string' && Date.parse(value) < Date.parse(from)) {
                throw new Error('updatedTo must be after or equal to updatedFrom');
            }
            return true;
        }),
    (req: Request, _res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty())
            return next(new ValidationError('Validation failed', errors.array()));
        next();
    },
];
