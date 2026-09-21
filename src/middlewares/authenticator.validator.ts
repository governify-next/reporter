import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/customErrors.js';
import { type Request, type Response, type NextFunction } from 'express';
import { getLogger } from '../utils/logger.js';
import { bootEnv } from '../config/bootConfig.js';

const logger = getLogger().setTag('authenticator.validator.ts');

declare module 'express' {
    interface Request {
        serviceAuth?: ServiceJwtPayload;
    }
}

export interface ServiceJwtPayload {
    type: string; // 'service'
    sub: string; // service ID
    service: string; // service ID (same as sub, but more explicit)
    serviceName: string; // name of the service
    iss: string; // issuer
    aud: string; // audience
    jti: string; // JWT ID
}

const getBearerToken = (req: Request) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Authorization header missing or malformed');
    }

    return authHeader.split(' ')[1];
};

const verifyToken = (token: string) => {
    return jwt.verify(token, bootEnv.JWT_SECRET, {
        issuer: bootEnv.JWT_ISSUER,
        audience: bootEnv.JWT_AUDIENCE,
    }) as ServiceJwtPayload;
};

export const checkServiceAuthentication = (req: Request, res: Response, next: NextFunction) => {
    if (!bootEnv.SERVICE_AUTHENTICATION_ENABLED) {
        return next();
    }

    try {
        const decoded = verifyToken(getBearerToken(req));

        if (decoded.type !== 'service') {
            return next(new UnauthorizedError('Invalid service token'));
        }

        req.serviceAuth = decoded as ServiceJwtPayload;
        next();
    } catch (err) {
        logger.debug('Service JWT verification failed', err);
        next(
            err instanceof UnauthorizedError
                ? err
                : new UnauthorizedError('Invalid or expired token'),
        );
    }
};
