import jwt from 'jsonwebtoken';
import { bootEnv } from '../config/bootConfig.js';

const authToken = jwt.sign(
    { service: bootEnv.GOV_SERVICE_NAME, type: 'service-token' },
    bootEnv.JWT_SECRET,
);

export const serviceHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
};
