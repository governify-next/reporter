import { getServiceHeaders } from '../utils/serviceAuthentication.js';
import { StdError } from '../utils/customErrors.js';

// Shared transport for the services used to manage synchronization tasks.
export const taskServiceRequest = async <T>(
    service: string,
    url: string,
    method: 'GET' | 'POST',
    body?: unknown,
): Promise<{ data: T; status: number }> => {
    let response: Response;
    try {
        response = await fetch(url, {
            method,
            headers: getServiceHeaders(),
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    } catch (error) {
        throw new StdError({
            message: `${service} is unavailable`,
            httpStatus: 502,
            appCode: 'UPSTREAM_UNAVAILABLE',
            details: error instanceof Error ? error.message : undefined,
        });
    }

    let result: { success?: boolean; data?: T; message?: string; error?: unknown } | null;
    try {
        result = await response.json();
    } catch {
        throw new StdError({
            message: `${service} returned an invalid response`,
            httpStatus: 502,
            appCode: 'INVALID_UPSTREAM_RESPONSE',
        });
    }
    if (
        !response.ok ||
        result?.success !== true ||
        result.data === undefined ||
        result.data === null
    ) {
        throw new StdError({
            message: result?.message ?? `${service} request failed`,
            httpStatus: response.status >= 400 && response.status < 500 ? response.status : 502,
            appCode: 'UPSTREAM_REQUEST_FAILED',
            details: result?.error,
        });
    }
    return { data: result.data, status: response.status };
};
