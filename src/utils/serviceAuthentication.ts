import { bootEnv } from '../config/bootConfig.js';

const AUTHENTICATOR_SERVICE_URL = bootEnv.AUTHENTICATOR_SERVICE_URL;
const CLIENT_ID = bootEnv.CLIENT_ID;
const CLIENT_SECRET = bootEnv.CLIENT_SECRET;

let serviceToken: string | null = null;

export const fetchServiceToken = async () => {
    if (!bootEnv.SERVICE_AUTHENTICATION_ENABLED) return null;

    const response = await fetch(`${AUTHENTICATOR_SERVICE_URL}/api/v1/services/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
        }),
    });

    const result = (await response.json()) as {
        success: boolean;
        data?: { token?: string };
    };

    if (!response.ok || !result.success || !result.data?.token)
        throw new Error(
            `Failed to fetch service token from authenticator (status: ${response.status})`,
        );

    const token = result.data.token;

    serviceToken = token;

    return token;
};

export const getServiceHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (!bootEnv.SERVICE_AUTHENTICATION_ENABLED) return headers;
    if (!serviceToken) throw new Error('Reporter service token has not been initialized');

    headers.Authorization = `Bearer ${serviceToken}`;
    return headers;
};
