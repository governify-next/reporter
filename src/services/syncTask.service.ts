import * as registryIntegration from '../integrations/registry.integration.js';
import * as scopeManagerIntegration from '../integrations/scope-manager.integration.js';
import * as directorIntegration from '../integrations/director.integration.js';
import { NotFoundError, StdError, ValidationError } from '../utils/customErrors.js';
import { SyncTaskOptions, SyncTaskFilters } from '../types/syncTask.types.js';

const resolveAgreement = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    selector: string,
) => {
    const [scope, collection] = await Promise.all([
        scopeManagerIntegration.getScope(orgName, scopeId),
        registryIntegration.getAgreementCollectionForTasks(orgName, agColId),
    ]);
    if (
        !scope._id ||
        !scope.organizationId ||
        !collection._id ||
        !Array.isArray(collection.agreementVersions)
    ) {
        throw new StdError({
            message: 'Invalid agreement metadata from upstream services',
            httpStatus: 502,
            appCode: 'INVALID_UPSTREAM_RESPONSE',
        });
    }
    if (collection.scopeId !== scope._id) {
        throw new NotFoundError('Agreement collection not found in the selected scope');
    }
    // Registry numeric selectors are one-based array positions, not stored versionNumber values.
    const index =
        selector === 'auditableVersion'
            ? collection.agreementVersions.findIndex(
                  (version) => version.versionNumber === collection.auditableVersionNumber,
              )
            : Number(selector) - 1;
    const version = collection.agreementVersions[index];
    if (!version) throw new NotFoundError('Selected agreement version not found');
    return {
        identity: {
            orgName,
            orgId: scope.organizationId,
            scopeId: scope._id,
            agColId: collection._id,
            agreementVersion: index + 1,
        },
        initial: version.contract.validity.initial,
        end: version.contract.validity.end,
    };
};

export const createSyncTask = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    selector: string,
    options: SyncTaskOptions,
    enabled: boolean,
) => {
    const { identity, initial, end } = await resolveAgreement(orgName, scopeId, agColId, selector);
    const startDate = new Date(options.startDate ?? initial);
    const anchorDate = new Date(options.anchorDate ?? initial);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(anchorDate.getTime())) {
        throw new ValidationError('The task must have valid startDate and anchorDate values');
    }
    const endDate = new Date(options.endDate ?? end);
    if (
        !Number.isFinite(endDate.getTime()) ||
        endDate <= startDate ||
        endDate.getTime() <= Date.now()
    ) {
        throw new ValidationError('endDate must be in the future and after startDate');
    }
    return directorIntegration.createSyncTask({
        script: 'syncAgreementVersionStates',
        type: 'RECURRING',
        inputArgs: { ...identity, lookbackMs: options.lookbackMs },
        enabled,
        interval: options.interval,
        startDate: startDate.toISOString(),
        anchorDate: anchorDate.toISOString(),
        endDate: endDate.toISOString(),
    });
};

const getFilters = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    selector: string,
): Promise<SyncTaskFilters> => {
    const { identity } = await resolveAgreement(orgName, scopeId, agColId, selector);
    return { script: 'syncAgreementVersionStates', type: 'RECURRING', inputArgs: identity };
};

export const getSyncTasks = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    selector: string,
) => directorIntegration.getSyncTasks(await getFilters(orgName, scopeId, agColId, selector));

export const deleteSyncTasks = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    selector: string,
) => directorIntegration.deleteSyncTasks(await getFilters(orgName, scopeId, agColId, selector));
