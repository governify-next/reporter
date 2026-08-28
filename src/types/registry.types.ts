export enum StateStatus {
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

export enum ComplianceStatus {
    COMPLIANT = 'COMPLIANT',
    NON_COMPLIANT = 'NON_COMPLIANT',
    INDETERMINATE = 'INDETERMINATE',
}

export enum MetricStatus {
    PENDING = 'PENDING',
    COMPUTED = 'COMPUTED',
    UNAVAILABLE = 'UNAVAILABLE',
    FAILED = 'FAILED',
}

export type WindowPeriod = {
    unit: string;
    value: number;
};

export type AgreementStateMetric = {
    metricName: string;
    status: MetricStatus;
    value: number | null;
    evidences: Record<string, unknown>[];
    errorMessage: string | null;
    metricConfig: {
        event: {
            eventId: string;
            fetcherConfigs: Array<{
                fetcherId: string;
                fetcherConfig: Record<string, unknown> | null;
                fetchResult?: {
                    id: string;
                    status: 'IN_PROGRESS' | 'COMPLETED' | 'UNAVAILABLE' | 'FAILED';
                    unavailableReason: string | null;
                };
            }>;
            processConfig: Record<string, unknown> | null;
        };
        aggregation: {
            aggregatorType: string;
            aggregatorConfig: Record<string, unknown>;
        };
    };
};

export type AgreementState = {
    _id: string;
    signatureId: string;
    generationId: string;
    attempt: number;
    startDate: string;
    endDate: string | null;
    date: string;
    consolidated: boolean;
    status: StateStatus;
    numericExpression: string;
    comparator: string;
    threshold: number;
    replacedNumericExpression: string | null;
    numericExpressionValue: number | null;
    complianceStatus: ComplianceStatus | null;
    window: {
        period: WindowPeriod[];
        anchorDate: string;
    };
    metrics: AgreementStateMetric[];
    createdAt?: string;
    updatedAt?: string;
    __v?: number;
};

export type AgreementSignature = {
    signatureId: string;
    guarantee: {
        name: string;
        info: {
            title: string;
            description: string;
            example: string;
        };
        numericExpression: string;
        comparator: string;
        threshold: number;
        window: {
            period: WindowPeriod[];
            anchorDate: string;
        };
        metrics: Array<{
            metricName: string;
        }>;
    };
    states?: AgreementState[];
};

export type AgreementVersion = {
    versionNumber: number;
    contract: {
        agreementTemplateName: string;
        validity: {
            timezone: string;
            initial: string;
            end: string;
            earlyTermination: string | null;
        };
        signatures: AgreementSignature[];
    };
};

export type AgreementVersionStatesResponse = {
    organizationName: string;
    scopeId: string;
    agColId: string;
    agreementVersion: AgreementVersion;
};
