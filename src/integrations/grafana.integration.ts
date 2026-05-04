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

type GrafanaRequestInit = {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
};

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
    return await requestGrafana<SaveDashboardResponse>('/api/dashboards/db', {
        method: 'POST',
        body: JSON.stringify({
            dashboard,
            folderUid: bootEnv.GRAFANA_FOLDER_UID,
            overwrite: true,
            message: 'Governify auditable agreement dashboard sync',
        }),
    });
};
