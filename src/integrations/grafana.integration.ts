import { bootEnv } from '../config/bootConfig.js';

type GrafanaDataSource = {
    id?: number;
    uid: string;
    name: string;
};

type GrafanaFolder = {
    uid: string;
    title: string;
};

type SaveDashboardResponse = {
    uid: string;
    url: string;
    status: string;
    version: number;
};

type GetDashboardResponse = {
    dashboard: {
        id: number;
        uid: string;
        version: number;
    };
};

type GrafanaRequestInit = {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
};

export type AgreementValidityAnnotation = {
    panelId: number;
    boundary: 'start' | 'end';
    time: number;
};

type GrafanaAnnotation = {
    id: number;
    panelId: number;
    time: number;
    timeEnd?: number;
    text: string;
    tags: string[];
};

const AGREEMENT_VALIDITY_TAG = 'governify:agreement-validity';
const getValidityBoundaryTag = (boundary: AgreementValidityAnnotation['boundary']) =>
    `${AGREEMENT_VALIDITY_TAG}:${boundary}`;

const buildValidityAnnotation = (annotation: AgreementValidityAnnotation) => ({
    time: annotation.time,
    timeEnd: annotation.time,
    text: annotation.boundary === 'start' ? 'Agreement validity start' : 'Agreement validity end',
    tags: [AGREEMENT_VALIDITY_TAG, getValidityBoundaryTag(annotation.boundary)],
});

const getValidityAnnotationKey = (
    panelId: number,
    boundary: AgreementValidityAnnotation['boundary'],
) => `${panelId}:${boundary}`;

const getExistingValidityAnnotationKey = (annotation: GrafanaAnnotation) => {
    const boundary = (['start', 'end'] as const).find((candidate) =>
        annotation.tags.includes(getValidityBoundaryTag(candidate)),
    );

    return boundary ? getValidityAnnotationKey(annotation.panelId, boundary) : null;
};

const hasSameAnnotationContent = (
    existing: GrafanaAnnotation,
    expected: ReturnType<typeof buildValidityAnnotation>,
) =>
    existing.time === expected.time &&
    existing.timeEnd === expected.timeEnd &&
    existing.text === expected.text &&
    existing.tags.length === expected.tags.length &&
    expected.tags.every((tag) => existing.tags.includes(tag));

const getGrafanaBaseUrl = () => bootEnv.GRAFANA_URL.replace(/\/+$/, '');

const getAuthHeaders = () => {
    const token = Buffer.from(`${bootEnv.GRAFANA_USER}:${bootEnv.GRAFANA_PASSWORD}`).toString(
        'base64',
    );

    return {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
};

const requestGrafana = async <T>(path: string, init: GrafanaRequestInit = {}): Promise<T> => {
    const response = await fetch(`${getGrafanaBaseUrl()}${path}`, {
        ...init,
        headers: {
            ...getAuthHeaders(),
            ...(init.headers ?? {}),
        },
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `Grafana request failed: ${response.status} ${response.statusText}${
                body ? ` - ${body}` : ''
            }`,
        );
    }

    return (await response.json()) as T;
};

export const syncAgreementValidityAnnotations = async (
    dashboardUid: string,
    annotations: AgreementValidityAnnotation[],
) => {
    const existingAnnotations = await requestGrafana<GrafanaAnnotation[]>(
        `/api/annotations?dashboardUID=${encodeURIComponent(dashboardUid)}&type=annotation&limit=1000`,
    );
    const managedAnnotations = existingAnnotations.filter((annotation) =>
        annotation.tags.includes(AGREEMENT_VALIDITY_TAG),
    );
    const existingByKey = new Map<string, GrafanaAnnotation[]>();

    for (const annotation of managedAnnotations) {
        const key = getExistingValidityAnnotationKey(annotation);
        if (!key) continue;
        existingByKey.set(key, [...(existingByKey.get(key) ?? []), annotation]);
    }

    const retainedAnnotationIds = new Set<number>();
    const upserts: Promise<unknown>[] = [];

    for (const annotation of annotations) {
        const key = getValidityAnnotationKey(annotation.panelId, annotation.boundary);
        const [existing] = existingByKey.get(key) ?? [];
        const payload = buildValidityAnnotation(annotation);

        if (existing) {
            retainedAnnotationIds.add(existing.id);
            if (!hasSameAnnotationContent(existing, payload)) {
                upserts.push(
                    requestGrafana(`/api/annotations/${existing.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify(payload),
                    }),
                );
            }
            continue;
        }

        upserts.push(
            requestGrafana('/api/annotations', {
                method: 'POST',
                body: JSON.stringify({
                    dashboardUID: dashboardUid,
                    panelId: annotation.panelId,
                    ...payload,
                }),
            }),
        );
    }

    await Promise.all(upserts);

    const staleAnnotations = managedAnnotations.filter(
        (annotation) => !retainedAnnotationIds.has(annotation.id),
    );
    await Promise.all(
        staleAnnotations.map((annotation) =>
            requestGrafana(`/api/annotations/${annotation.id}`, { method: 'DELETE' }),
        ),
    );
};

export const ensureInfluxDataSource = async () => {
    const payload = {
        uid: bootEnv.GRAFANA_DATASOURCE_UID,
        name: bootEnv.GRAFANA_DATASOURCE_NAME,
        type: 'influxdb',
        access: 'proxy',
        url: bootEnv.GRAFANA_INFLUX_URL,
        isDefault: true,
        jsonData: {
            version: 'SQL',
            dbName: bootEnv.INFLUX_DATABASE,
            httpMode: 'POST',
            insecureGrpc: true,
        },
        secureJsonData: {
            token: bootEnv.INFLUX_TOKEN,
        },
    };

    const existingResponse = await fetch(
        `${getGrafanaBaseUrl()}/api/datasources/uid/${bootEnv.GRAFANA_DATASOURCE_UID}`,
        { headers: getAuthHeaders() },
    );

    if (existingResponse.status === 404) {
        return await requestGrafana<GrafanaDataSource>('/api/datasources', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }

    if (!existingResponse.ok) {
        const body = await existingResponse.text().catch(() => '');
        throw new Error(
            `Grafana datasource lookup failed: ${existingResponse.status} ${existingResponse.statusText}${
                body ? ` - ${body}` : ''
            }`,
        );
    }

    return await requestGrafana<GrafanaDataSource>(
        `/api/datasources/uid/${bootEnv.GRAFANA_DATASOURCE_UID}`,
        {
            method: 'PUT',
            body: JSON.stringify(payload),
        },
    );
};

export const ensureFolder = async () => {
    const existingResponse = await fetch(
        `${getGrafanaBaseUrl()}/api/folders/${bootEnv.GRAFANA_FOLDER_UID}`,
        { headers: getAuthHeaders() },
    );

    if (existingResponse.status === 404) {
        return await requestGrafana<GrafanaFolder>('/api/folders', {
            method: 'POST',
            body: JSON.stringify({
                uid: bootEnv.GRAFANA_FOLDER_UID,
                title: bootEnv.GRAFANA_FOLDER_TITLE,
            }),
        });
    }

    if (!existingResponse.ok) {
        const body = await existingResponse.text().catch(() => '');
        throw new Error(
            `Grafana folder lookup failed: ${existingResponse.status} ${existingResponse.statusText}${
                body ? ` - ${body}` : ''
            }`,
        );
    }

    return (await existingResponse.json()) as GrafanaFolder;
};

export const saveDashboard = async (dashboard: Record<string, unknown>) => {
    const dashboardUid = dashboard.uid;

    if (typeof dashboardUid !== 'string' || dashboardUid.length === 0) {
        throw new Error('Grafana dashboard UID is required');
    }

    const existingResponse = await fetch(
        `${getGrafanaBaseUrl()}/api/dashboards/uid/${encodeURIComponent(dashboardUid)}`,
        { headers: getAuthHeaders() },
    );

    let dashboardToSave: Record<string, unknown> = {
        ...dashboard,
        version: 0,
    };

    if (existingResponse.ok) {
        const existingDashboard = (await existingResponse.json()) as GetDashboardResponse;
        dashboardToSave = {
            ...dashboard,
            id: existingDashboard.dashboard.id,
            version: existingDashboard.dashboard.version,
        };
    } else if (existingResponse.status !== 404) {
        const body = await existingResponse.text().catch(() => '');
        throw new Error(
            `Grafana dashboard lookup failed: ${existingResponse.status} ${existingResponse.statusText}${
                body ? ` - ${body}` : ''
            }`,
        );
    }

    return await requestGrafana<SaveDashboardResponse>('/api/dashboards/db', {
        method: 'POST',
        body: JSON.stringify({
            dashboard: dashboardToSave,
            folderUid: bootEnv.GRAFANA_FOLDER_UID,
            overwrite: true,
            message: 'Governify agreement version dashboard sync',
        }),
    });
};
