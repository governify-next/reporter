import { bootEnv } from '../config/bootConfig.js';
import { serviceHeaders } from '../utils/serviceAuth.js';
import { StdError } from '../utils/customErrors.js';
import type { AgreementVersion, AgreementVersionStatesResponse } from '../types/registry.types.js';

const REGISTRY_SERVICE_URL = bootEnv.REGISTRY_SERVICE_URL.replace(/\/+$/, '');

type RegistryResponse<T> = {
    success: boolean;
    message?: string;
    appCode?: string;
    data?: T;
    error?: unknown;
};

const encodePathSegment = (value: string) => encodeURIComponent(value);

const buildAgreementVersionPath = (
    orgName: string,
    scopeId: string,
    agColId: string,
    agreementVersion: string,
) => {
    return `/api/v1/organizations/${encodePathSegment(orgName)}/scopes/${encodePathSegment(
        scopeId,
    )}/agreementCollections/${encodePathSegment(agColId)}/agreementVersions/${encodePathSegment(
        agreementVersion,
    )}`;
};

const getRegistryData = async <T>(path: string, resourceDescription: string): Promise<T> => {
    let response: Response;
    try {
        response = await fetch(`${REGISTRY_SERVICE_URL}${path}`, {
            method: 'GET',
            headers: serviceHeaders,
        });
    } catch (error) {
        throw new StdError({
            message: `Registry is unavailable while fetching ${resourceDescription}`,
            httpStatus: 502,
            appCode: 'REGISTRY_UNAVAILABLE',
            details: error instanceof Error ? error.message : error,
        });
    }

    let result: RegistryResponse<T>;
    try {
        result = (await response.json()) as RegistryResponse<T>;
    } catch {
        throw new StdError({
            message: `Registry returned an invalid response while fetching ${resourceDescription}`,
            httpStatus: 502,
            appCode: 'INVALID_REGISTRY_RESPONSE',
        });
    }

    if (!response.ok || !result.success || result.data === undefined) {
        throw new StdError({
            message: result.message ?? `Failed to fetch ${resourceDescription} from Registry`,
            httpStatus: response.status >= 400 && response.status < 500 ? response.status : 502,
            appCode: result.appCode ?? 'REGISTRY_REQUEST_FAILED',
            details: result.error,
        });
    }

    return result.data;
};

export const getAgreementVersionStates = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    agreementVersion: string,
): Promise<AgreementVersionStatesResponse> => {
    const path = `${buildAgreementVersionPath(orgName, scopeId, agColId, agreementVersion)}/states`;
    return await getRegistryData<AgreementVersionStatesResponse>(
        path,
        `states for agreement version ${agreementVersion}`,
    );
};

export const getAgreementVersion = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    agreementVersion: string,
): Promise<AgreementVersion> => {
    const path = `${buildAgreementVersionPath(
        orgName,
        scopeId,
        agColId,
        agreementVersion,
    )}?expand=true`;
    return await getRegistryData<AgreementVersion>(path, `agreement version ${agreementVersion}`);
};
