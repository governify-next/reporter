import jwt from 'jsonwebtoken';
import { ForbiddenError, UnauthorizedError } from '../utils/customErrors.js';
import { type Request, type Response, type NextFunction } from 'express';
import { getLogger } from '../utils/logger.js';
import { bootEnv } from '../config/bootConfig.js';
import { SystemRole } from '../types/systemRole.js';

const logger = getLogger().setTag('authenticator.validator.ts');

const systemRolePriority: Record<SystemRole, number> = {
    [SystemRole.USER]: 1,
    [SystemRole.ADMIN]: 2,
    [SystemRole.SUPERADMIN]: 3,
};

declare module 'express' {
    interface Request {
        userAuth?: UserJwtPayload;
        serviceAuth?: ServiceJwtPayload;
    }
}

export interface UserJwtPayload {
    type: string; // 'user'
    sub: string; // user ID
    userId: string; // user ID (same as sub, but more explicit)
    username: string; // username of the user
    systemRole: SystemRole; // system role of the user
    iss: string; // issuer
    aud: string; // audience
    jti: string; // JWT ID
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
    }) as UserJwtPayload | ServiceJwtPayload;
};

export const checkUserAuthentication = (req: Request, res: Response, next: NextFunction) => {
    try {
        const decoded = verifyToken(getBearerToken(req));

        if (decoded.type !== 'user') {
            return next(new UnauthorizedError('Invalid user token'));
        }

        req.userAuth = decoded as UserJwtPayload;
        next();
    } catch (err) {
        logger.debug('User JWT verification failed', err);
        next(
            err instanceof UnauthorizedError
                ? err
                : new UnauthorizedError('Invalid or expired token'),
        );
    }
};

export const checkServiceAuthentication = (req: Request, res: Response, next: NextFunction) => {
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

export const hasSystemRole = (requiredRole: SystemRole) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.userAuth) {
            return next(new UnauthorizedError('User not authenticated'));
        }

        const userRole = req.userAuth.systemRole;
        const userRolePriority = systemRolePriority[userRole];
        if (!userRolePriority || userRolePriority < systemRolePriority[requiredRole]) {
            return next(new ForbiddenError('Insufficient permissions'));
        }

        next();
    };
};

export const isService = (req: Request, res: Response, next: NextFunction) => {
    if (!req.serviceAuth) {
        return next(new UnauthorizedError('Service not authenticated'));
    }

    next();
};
