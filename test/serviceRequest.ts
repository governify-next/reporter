import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import { bootEnv } from '../src/config/bootConfig.js';

const token = jwt.sign(
    { type: 'service', service: 'reporter', serviceName: 'reporter' },
    bootEnv.JWT_SECRET,
    {
        subject: 'reporter',
        issuer: bootEnv.JWT_ISSUER,
        audience: bootEnv.JWT_AUDIENCE,
    },
);

const authorization = `Bearer ${token}`;

export const serviceRequest = {
    get: (path: string) => request(app).get(path).set('Authorization', authorization),
    post: (path: string) => request(app).post(path).set('Authorization', authorization),
    delete: (path: string) => request(app).delete(path).set('Authorization', authorization),
};
