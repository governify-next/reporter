import { bootEnv } from '../config/bootConfig.js';
import { serviceHeaders } from '../utils/serviceAuth.js';

const REGISTRY_SERVICE_URL = bootEnv.REGISTRY_SERVICE_URL;

export const getAuditableAgreementVersionStates = async (
    orgName: string,
    elementName: string,
    agColName: string,
): Promise<unknown> => {
    const response = await fetch(
        `${REGISTRY_SERVICE_URL}/api/v1/organizations/${orgName}/elements/${elementName}/agreementCollections/${agColName}/agreementVersions/auditableVersion/states`,
        {
            method: 'GET',
            headers: serviceHeaders,
        },
    );
    const result = await response.json();

    if (!result.success)
        throw new Error(
            `Failed to fetch auditable agreement version states for organization ${orgName}, element ${elementName}, and agreement collection ${agColName}`,
        );

    return result.data;
};
