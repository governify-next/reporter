import { bootEnv } from '../config/bootConfig.js';
import { taskServiceRequest } from './taskServiceRequest.js';

export const getScope = async (orgName: string, scopeId: string) => {
    const path = `/api/v1/organizations/${encodeURIComponent(orgName)}/scopes/${encodeURIComponent(scopeId)}`;
    const result = await taskServiceRequest<{ _id: string; organizationId: string }>(
        'Scope Manager',
        `${bootEnv.SCOPE_MANAGER_SERVICE_URL.replace(/\/+$/, '')}${path}`,
        'GET',
    );
    return result.data;
};
