import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/customErrors.js';

const collectErrors = (req: Request, _res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new ValidationError('Validation failed', errors.array()));
    next();
};

export const validateSyncTaskParams = [
    param('orgName').isString().notEmpty(),
    param('scopeId').isMongoId(),
    param('agColId').isMongoId(),
    param('agreementVersion')
        .custom(
            (value: string) =>
                value === 'auditableVersion' ||
                (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))),
        )
        .withMessage('agreementVersion must be auditableVersion or a one-based positive integer'),
    collectErrors,
];

export const validateCreateSyncTask = [
    body().isObject({ strict: true }).withMessage('A JSON object is required'),
    ...['interval', 'lookbackMs'].map((field) =>
        body(field)
            .custom(
                (value: unknown) =>
                    typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
            )
            .withMessage(`${field} must be a positive integer in milliseconds`),
    ),
    ...['startDate', 'anchorDate', 'endDate'].map((field) =>
        body(field)
            .optional()
            .isString()
            .bail()
            .isISO8601({ strict: true })
            .bail()
            .custom((value: string) => Number.isFinite(Date.parse(value)))
            .withMessage(`${field} must be a valid ISO 8601 date`),
    ),
    query('enabled')
        .optional()
        .custom((value: unknown) => value === 'true' || value === 'false')
        .withMessage('enabled must be true or false'),
    collectErrors,
];
