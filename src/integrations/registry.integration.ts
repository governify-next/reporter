import { bootEnv } from '../config/bootConfig.js';
import { getServiceHeaders } from '../utils/serviceAuthentication.js';
import { StdError } from '../utils/customErrors.js';
import type {
    AgreementCollectionInfo,
    AgreementCollectionForTasks,
    AgreementTemplate,
    AgreementVersion,
    AgreementVersionStatesResponse,
    StateUpdatedRange,
} from '../types/registry.types.js';

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

const requestRegistryData = async <T>(
    path: string,
    resourceDescription: string,
    options: { method: 'GET' | 'POST'; body?: string } = { method: 'GET' },
): Promise<T> => {
    let response: Response;
    try {
        response = await fetch(`${REGISTRY_SERVICE_URL}${path}`, {
            ...options,
            headers: getServiceHeaders(),
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

    if (!response.ok || !result?.success || result.data === undefined || result.data === null) {
        throw new StdError({
            message: result?.message ?? `Failed to fetch ${resourceDescription} from Registry`,
            httpStatus: response.status >= 400 && response.status < 500 ? response.status : 502,
            appCode: result?.appCode ?? 'REGISTRY_REQUEST_FAILED',
            details: result?.error,
        });
    }

    return result.data;
};

export const getAgreementCollectionForTasks = async (orgName: string, agColId: string) => {
    const path = `/api/v1/organizations/${encodePathSegment(orgName)}/agreementCollections/${encodePathSegment(agColId)}?expand=false`;
    return requestRegistryData<AgreementCollectionForTasks>(
        path,
        'agreement collection for synchronization tasks',
    );
};

export const getAgreementVersionStates = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    agreementVersion: string,
    range: StateUpdatedRange = {},
): Promise<AgreementVersionStatesResponse> => {
    const path = `${buildAgreementVersionPath(orgName, scopeId, agColId, agreementVersion)}/states/search`;
    return await requestRegistryData<AgreementVersionStatesResponse>(
        path,
        `states for agreement version ${agreementVersion}`,
        { method: 'POST', body: JSON.stringify(range) },
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
    return await requestRegistryData<AgreementVersion>(
        path,
        `agreement version ${agreementVersion}`,
    );
};

export const getAgreementTemplate = async (
    orgName: string,
    agreementTemplateName: string,
): Promise<AgreementTemplate> => {
    const path = `/api/v1/organizations/${encodePathSegment(orgName)}/agreementTemplates/${encodePathSegment(agreementTemplateName)}`;
    return await requestRegistryData<AgreementTemplate>(
        path,
        `agreement template ${agreementTemplateName}`,
    );
};

export const getAgreementCollectionInfo = async (
    orgName: string,
    agColId: string,
): Promise<AgreementCollectionInfo> => {
    const path = `/api/v1/organizations/${encodePathSegment(orgName)}/agreementCollections/${encodePathSegment(agColId)}?expand=false`;
    const collection = await requestRegistryData<AgreementCollectionInfo>(
        path,
        'agreement information',
    );
    return {
        name: collection.name,
        displayName: collection.displayName,
        description: collection.description,
    };
};
