import * as registryIntegrations from '../integrations/registry.integration.js';
import {
    writeInfluxPoints,
    type InfluxPointInput,
    type InfluxFields,
    type InfluxTags,
} from '../db/influx.js';

type WindowPeriod = {
    unit?: string;
    value?: number;
};

type AgreementStateMetric = {
    metricName?: string;
    value?: number | string | boolean;
    evidences?: unknown[];
    metricConfig?: {
        event?: {
            eventId?: string;
            fetcherConfigs?: Array<{
                fetcherId?: string;
                fetchResultId?: string;
                fetcherConfig?: Record<string, unknown>;
            }>;
            processConfig?: Record<string, unknown>;
        };
        aggregation?: {
            aggregatorType?: string;
        };
    };
};

type AgreementState = {
    _id: string;
    signatureId?: string;
    startDate?: string;
    endDate?: string;
    date: string;
    consolidated?: boolean;
    status?: string;
    numericExpression?: string;
    comparator?: string;
    threshold?: number;
    replacedNumericExpression?: string;
    numericExpressionValue?: number | null;
    compliant?: boolean | null;
    indeterminate?: boolean;
    window?: {
        period?: WindowPeriod[];
        anchorDate?: string;
    };
    metrics?: AgreementStateMetric[];
    createdAt?: string;
    updatedAt?: string;
    __v?: number;
};

type AgreementSignature = {
    signatureId: string;
    guarantee?: {
        name?: string;
        numericExpression?: string;
        comparator?: string;
        threshold?: number;
        window?: {
            period?: WindowPeriod[];
            anchorDate?: string;
        };
        metrics?: unknown[];
    };
    states?: AgreementState[];
};

type AuditableAgreementVersionStatesResponse = {
    organizationName: string;
    elementName: string;
    agreementCollectionName: string;
    agreementVersion: {
        versionNumber: number;
        contract?: {
            agreementTemplateName?: string;
            validity?: {
                timezone?: string;
                initial?: string;
                end?: string;
                earlyTermination?: string | null;
            };
            signatures?: AgreementSignature[];
        };
    };
};

const toTagValue = (value: unknown, fallback = 'unknown'): string => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    return String(value);
};

const setField = (
    fields: InfluxFields,
    key: string,
    value: string | number | boolean | null | undefined,
) => {
    if (value === undefined || value === null) return;

    if (typeof value === 'number' && !Number.isFinite(value)) return;

    fields[key] = value;
};

const getAgreementVersion = (agreement: AuditableAgreementVersionStatesResponse): string => {
    return String(agreement.agreementVersion.versionNumber);
};

const getAgreementTemplateName = (agreement: AuditableAgreementVersionStatesResponse): string => {
    return toTagValue(agreement.agreementVersion.contract?.agreementTemplateName);
};

const getSignatureId = (signature: AgreementSignature, state: AgreementState): string => {
    return toTagValue(signature.signatureId ?? state.signatureId);
};

const buildCommonTags = (agreement: AuditableAgreementVersionStatesResponse): InfluxTags => {
    return {
        organizationName: toTagValue(agreement.organizationName),
        elementName: toTagValue(agreement.elementName),
        agreementCollectionName: toTagValue(agreement.agreementCollectionName),
        agreementTemplateName: getAgreementTemplateName(agreement),
        agreementVersion: getAgreementVersion(agreement),
    };
};

const buildStateTags = (
    agreement: AuditableAgreementVersionStatesResponse,
    signature: AgreementSignature,
    state: AgreementState,
): InfluxTags => {
    return {
        ...buildCommonTags(agreement),
        guaranteeName: toTagValue(signature.guarantee?.name),
        signatureId: getSignatureId(signature, state),
        stateId: toTagValue(state._id),
    };
};

const buildStateFields = (state: AgreementState): InfluxFields => {
    const fields: InfluxFields = {};

    setField(fields, 'consolidated', state.consolidated);
    setField(fields, 'compliant', state.compliant);
    setField(fields, 'indeterminate', state.indeterminate);

    setField(fields, 'status', state.status);

    setField(fields, 'numericExpression', state.numericExpression);
    setField(fields, 'replacedNumericExpression', state.replacedNumericExpression);
    setField(fields, 'comparator', state.comparator);
    setField(fields, 'threshold', state.threshold);
    setField(fields, 'numericExpressionValue', state.numericExpressionValue);

    return fields;
};

const buildStatePoint = (
    agreement: AuditableAgreementVersionStatesResponse,
    signature: AgreementSignature,
    state: AgreementState,
): InfluxPointInput => {
    return {
        measurement: 'states',
        tags: buildStateTags(agreement, signature, state),
        fields: buildStateFields(state),
        timestamp: new Date(state.date),
    };
};

const buildMetricPoint = (
    agreement: AuditableAgreementVersionStatesResponse,
    signature: AgreementSignature,
    state: AgreementState,
    metric: AgreementStateMetric,
): InfluxPointInput => {
    const fields: InfluxFields = {};

    setField(fields, 'value', metric.value);

    return {
        measurement: 'state_metrics',
        tags: {
            ...buildCommonTags(agreement),
            signatureId: getSignatureId(signature, state),
            stateId: toTagValue(state._id),
            guaranteeName: toTagValue(signature.guarantee?.name),
            metricName: toTagValue(metric.metricName),
        },
        fields,
        timestamp: new Date(state.date),
    };
};

const buildInfluxPoints = (agreement: AuditableAgreementVersionStatesResponse) => {
    const statePoints: InfluxPointInput[] = [];
    const metricPoints: InfluxPointInput[] = [];

    const signatures = agreement.agreementVersion.contract?.signatures ?? [];

    for (const signature of signatures) {
        const states = signature.states ?? [];

        for (const state of states) {
            if (state.indeterminate) continue;
            statePoints.push(buildStatePoint(agreement, signature, state));
            for (const metric of state.metrics ?? []) {
                metricPoints.push(buildMetricPoint(agreement, signature, state, metric));
            }
        }
    }

    return {
        statePoints,
        metricPoints,
    };
};

export const syncAuditableAgreementVersionStates = async (
    orgName: string,
    elementName: string,
    agColName: string,
): Promise<unknown> => {
    const auditableAgreementVersionStates =
        (await registryIntegrations.getAuditableAgreementVersionStates(
            orgName,
            elementName,
            agColName,
        )) as AuditableAgreementVersionStatesResponse;

    const { statePoints, metricPoints } = buildInfluxPoints(auditableAgreementVersionStates);

    const allPoints = [...statePoints, ...metricPoints];

    await writeInfluxPoints(allPoints);

    return {
        organizationName: auditableAgreementVersionStates.organizationName,
        elementName: auditableAgreementVersionStates.elementName,
        agreementCollectionName: auditableAgreementVersionStates.agreementCollectionName,
        agreementVersion: getAgreementVersion(auditableAgreementVersionStates),
        statePoints: statePoints.length,
        metricPoints: metricPoints.length,
        totalPoints: allPoints.length,
    };
};
