import * as registryIntegration from '../integrations/registry.integration.js';
import {
    writeInfluxPoints,
    type InfluxPointInput,
    type InfluxFields,
    type InfluxTags,
} from '../db/influx.js';
import {
    StateStatus,
    type AgreementSignature,
    type AgreementState,
    type AgreementStateMetric,
    type AgreementVersionStatesResponse,
} from '../types/registry.types.js';

const toRequiredTagValue = (value: unknown, fieldName: string): string => {
    if (value === undefined || value === null || value === '') {
        throw new Error(`Registry response is missing required field ${fieldName}`);
    }
    return String(value);
};

const toTimestamp = (value: string, fieldName: string): Date => {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
        throw new Error(`Registry returned an invalid ${fieldName}: ${value}`);
    }
    return timestamp;
};

const getNumericProjection = (value: number | null) => {
    const available = value !== null && Number.isFinite(value);
    return {
        value: available ? value : 0,
        available,
    };
};

const getAgreementVersion = (agreement: AgreementVersionStatesResponse): string => {
    return String(agreement.agreementVersion.versionNumber);
};

const getComplianceStatusProjection = (state: AgreementState): string => {
    if (state.complianceStatus !== null && state.complianceStatus !== undefined) {
        return state.complianceStatus;
    }
    if (state.status === StateStatus.IN_PROGRESS) {
        return 'PENDING';
    }
    throw new Error(
        `Terminal State ${state._id} is missing complianceStatus; migrate or regenerate it in Registry`,
    );
};

const getSignatureId = (signature: AgreementSignature, state: AgreementState): string => {
    return toRequiredTagValue(
        signature.signatureId ?? state.signatureId,
        'agreementVersion.contract.signatures[].signatureId',
    );
};

const buildCommonTags = (agreement: AgreementVersionStatesResponse): InfluxTags => {
    return {
        organizationName: toRequiredTagValue(agreement.organizationName, 'organizationName'),
        scopeId: toRequiredTagValue(agreement.scopeId, 'scopeId'),
        agColId: toRequiredTagValue(agreement.agColId, 'agColId'),
        agreementTemplateName: toRequiredTagValue(
            agreement.agreementVersion.contract.agreementTemplateName,
            'agreementVersion.contract.agreementTemplateName',
        ),
        agreementVersion: getAgreementVersion(agreement),
    };
};

const buildStateTags = (
    agreement: AgreementVersionStatesResponse,
    signature: AgreementSignature,
    state: AgreementState,
): InfluxTags => {
    return {
        ...buildCommonTags(agreement),
        guaranteeName: toRequiredTagValue(
            signature.guarantee.name,
            'agreementVersion.contract.signatures[].guarantee.name',
        ),
        signatureId: getSignatureId(signature, state),
        stateId: toRequiredTagValue(state._id, 'state._id'),
    };
};

const buildStateFields = (state: AgreementState): InfluxFields => {
    const numericExpressionValue = getNumericProjection(state.numericExpressionValue);

    return {
        generationId: state.generationId,
        attempt: state.attempt,
        consolidated: state.consolidated,
        status: state.status,
        complianceStatus: getComplianceStatusProjection(state),
        startDate: state.startDate,
        endDate: state.endDate ?? '',
        endDateAvailable: state.endDate !== null,
        numericExpression: state.numericExpression,
        replacedNumericExpression: state.replacedNumericExpression ?? '',
        replacedNumericExpressionAvailable: state.replacedNumericExpression !== null,
        comparator: state.comparator,
        threshold: state.threshold,
        numericExpressionValue: numericExpressionValue.value,
        numericExpressionValueAvailable: numericExpressionValue.available,
    };
};

const buildStatePoint = (
    agreement: AgreementVersionStatesResponse,
    signature: AgreementSignature,
    state: AgreementState,
): InfluxPointInput => {
    return {
        measurement: 'states',
        tags: buildStateTags(agreement, signature, state),
        fields: buildStateFields(state),
        timestamp: toTimestamp(state.date, 'state.date'),
    };
};

const buildMetricPoint = (
    agreement: AgreementVersionStatesResponse,
    signature: AgreementSignature,
    state: AgreementState,
    metric: AgreementStateMetric,
): InfluxPointInput => {
    const metricValue = getNumericProjection(metric.value);

    return {
        measurement: 'state_metrics',
        tags: {
            ...buildCommonTags(agreement),
            signatureId: getSignatureId(signature, state),
            stateId: toRequiredTagValue(state._id, 'state._id'),
            guaranteeName: toRequiredTagValue(
                signature.guarantee.name,
                'agreementVersion.contract.signatures[].guarantee.name',
            ),
            metricName: toRequiredTagValue(metric.metricName, 'state.metrics[].metricName'),
        },
        fields: {
            status: metric.status,
            value: metricValue.value,
            valueAvailable: metricValue.available,
            errorMessage: metric.errorMessage ?? '',
            errorMessageAvailable: metric.errorMessage !== null,
            eventId: metric.metricConfig.event.eventId,
            aggregatorType: metric.metricConfig.aggregation.aggregatorType,
        },
        timestamp: toTimestamp(state.date, 'state.date'),
    };
};

export const buildInfluxPoints = (agreement: AgreementVersionStatesResponse) => {
    const statePoints: InfluxPointInput[] = [];
    const metricPoints: InfluxPointInput[] = [];

    for (const signature of agreement.agreementVersion.contract.signatures) {
        for (const state of signature.states ?? []) {
            statePoints.push(buildStatePoint(agreement, signature, state));
            for (const metric of state.metrics) {
                metricPoints.push(buildMetricPoint(agreement, signature, state, metric));
            }
        }
    }

    return {
        statePoints,
        metricPoints,
    };
};

export const syncAgreementVersionStates = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    agreementVersion: string,
) => {
    const agreementVersionStates = await registryIntegration.getAgreementVersionStates(
        orgName,
        scopeId,
        agColId,
        agreementVersion,
    );
    const { statePoints, metricPoints } = buildInfluxPoints(agreementVersionStates);
    const allPoints = [...statePoints, ...metricPoints];
    const writeResult = await writeInfluxPoints(allPoints);

    return {
        organizationName: agreementVersionStates.organizationName,
        scopeId: agreementVersionStates.scopeId,
        agColId: agreementVersionStates.agColId,
        agreementVersion: getAgreementVersion(agreementVersionStates),
        statePoints: statePoints.length,
        metricPoints: metricPoints.length,
        totalPoints: allPoints.length,
        batches: writeResult.batches,
    };
};
