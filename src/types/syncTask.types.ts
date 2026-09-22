export type SyncTaskOptions = {
    interval: number;
    lookbackMs: number;
    startDate?: string;
    endDate?: string;
    anchorDate?: string;
};

export type SyncTaskIdentity = {
    orgName: string;
    orgId: string;
    scopeId: string;
    agColId: string;
    agreementVersion: number;
};

export type SyncTaskFilters = {
    script: 'syncAgreementVersionStates';
    type: 'RECURRING';
    inputArgs: SyncTaskIdentity;
};

export type RecurringSyncTask = {
    script: 'syncAgreementVersionStates';
    type: 'RECURRING';
    inputArgs: SyncTaskIdentity & { lookbackMs: number };
    enabled: boolean;
    startDate: string;
    anchorDate: string;
    endDate?: string;
    interval: number;
};
