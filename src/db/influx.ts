import { bootEnv } from '../config/bootConfig.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().setTag('influx.ts');

const INFLUX_URL = bootEnv.INFLUX_URL;
const INFLUX_TOKEN = bootEnv.INFLUX_TOKEN;
const INFLUX_DATABASE = bootEnv.INFLUX_DATABASE;
const INFLUX_WRITE_PRECISION = bootEnv.INFLUX_WRITE_PRECISION;
const INFLUX_MAX_FAST_RETRIES = bootEnv.INFLUX_MAX_FAST_RETRIES;
const INFLUX_RETRY_FAST_DELAY_MS = bootEnv.INFLUX_RETRY_FAST_DELAY_MS;
const INFLUX_SLOW_RECONNECTION_MAX_RETRIES = bootEnv.INFLUX_SLOW_RECONNECTION_MAX_RETRIES;
const INFLUX_SLOW_RECONNECTION_STRATEGY = bootEnv.INFLUX_SLOW_RECONNECTION_STRATEGY;
const INFLUX_RETRY_SLOW_DELAY_MS = bootEnv.INFLUX_RETRY_SLOW_DELAY_MS;
const INFLUX_HEALTHCHECK_INTERVAL_MS = bootEnv.INFLUX_HEALTHCHECK_INTERVAL_MS;
const INFLUX_HEALTHCHECK_TIMEOUT_MS = bootEnv.INFLUX_HEALTHCHECK_TIMEOUT_MS;

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

export let isConnected = false;
let wasDisconnected = false;
let isReconnecting = false;

export type InfluxTags = Record<string, string>;
export type InfluxFieldValue = string | number | boolean;
export type InfluxFields = Record<string, InfluxFieldValue>;

export type InfluxPointInput = {
    measurement: string;
    fields: InfluxFields;
    tags?: InfluxTags;
    timestamp?: Date | number | string;
};

export type InfluxWritePrecision = 'auto' | 'nanosecond' | 'microsecond' | 'millisecond' | 'second';

export type InfluxQueryFormat = 'json' | 'jsonl' | 'csv' | 'pretty';

export type InfluxConnection = {
    url: string;
    database: string;
    isConnected: true;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getBaseInfluxUrl = () => INFLUX_URL.replace(/\/+$/, '');

const getHealthUrl = () => `${getBaseInfluxUrl()}/health`;

const getWriteUrl = () => {
    const params = new URLSearchParams({
        db: INFLUX_DATABASE,
        precision: INFLUX_WRITE_PRECISION,
    });

    return `${getBaseInfluxUrl()}/api/v3/write_lp?${params.toString()}`;
};

const getQuerySqlUrl = () => `${getBaseInfluxUrl()}/api/v3/query_sql`;

const getAuthHeaders = () => ({
    Authorization: `Bearer ${INFLUX_TOKEN}`,
});

const checkInfluxHealth = async (): Promise<boolean> => {
    try {
        const response = await fetch(getHealthUrl(), {
            method: 'GET',
            headers: {
                ...getAuthHeaders(),
            },
            signal: AbortSignal.timeout(INFLUX_HEALTHCHECK_TIMEOUT_MS),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            logger.debug(
                `InfluxDB health check failed: ${response.status} ${response.statusText}${
                    body ? ` - ${body}` : ''
                }`,
            );
            return false;
        }

        return true;
    } catch (err) {
        logger.debug('InfluxDB health check failed', err);
        return false;
    }
};

const getRetryDelay = (retries: number): number | false => {
    if (retries < INFLUX_MAX_FAST_RETRIES) {
        logger.warn(
            `InfluxDB fast retry ${retries + 1}/${INFLUX_MAX_FAST_RETRIES} in ${INFLUX_RETRY_FAST_DELAY_MS}ms`,
        );
        return INFLUX_RETRY_FAST_DELAY_MS;
    }

    if (
        INFLUX_SLOW_RECONNECTION_STRATEGY &&
        retries < INFLUX_MAX_FAST_RETRIES + INFLUX_SLOW_RECONNECTION_MAX_RETRIES
    ) {
        logger.warn(
            `InfluxDB slow retry ${
                retries - INFLUX_MAX_FAST_RETRIES + 1
            }/${INFLUX_SLOW_RECONNECTION_MAX_RETRIES} in ${INFLUX_RETRY_SLOW_DELAY_MS}ms`,
        );
        return INFLUX_RETRY_SLOW_DELAY_MS;
    }

    logger.warn('InfluxDB retry limit reached. No more retries');
    return false;
};

const retryUntilConnected = async () => {
    let retries = 0;

    while (true) {
        const ok = await checkInfluxHealth();

        if (ok) {
            if (wasDisconnected) {
                logger.info(`InfluxDB reconnected at ${INFLUX_URL}`);
                wasDisconnected = false;
            } else {
                logger.info(`InfluxDB connected at ${INFLUX_URL}`);
            }

            isConnected = true;
            return;
        }

        isConnected = false;
        wasDisconnected = true;

        const delay = getRetryDelay(retries);
        if (delay === false) return;

        retries += 1;
        await sleep(delay);
    }
};

const stopHealthChecks = () => {
    if (!healthCheckTimer) return;

    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
};

const startHealthChecks = () => {
    if (healthCheckTimer) return;

    healthCheckTimer = setInterval(() => {
        void (async () => {
            if (isReconnecting) return;

            const ok = await checkInfluxHealth();
            if (ok) return;

            logger.warn('InfluxDB connection lost');

            isConnected = false;
            wasDisconnected = true;

            stopHealthChecks();
            await reconnectInflux();
        })();
    }, INFLUX_HEALTHCHECK_INTERVAL_MS);
};

const reconnectInflux = async () => {
    if (isReconnecting) return;

    isReconnecting = true;

    try {
        await retryUntilConnected();

        if (isConnected) {
            startHealthChecks();
        }
    } finally {
        isReconnecting = false;
    }
};

export const connectInflux = async (): Promise<InfluxConnection> => {
    if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_DATABASE) {
        throw new Error(
            'Missing InfluxDB configuration. Set INFLUX_URL, INFLUX_TOKEN, and INFLUX_DATABASE.',
        );
    }

    logger.info(`Connecting to InfluxDB 3 at ${INFLUX_URL}`);

    await reconnectInflux();

    if (!isConnected) {
        throw new Error('Failed to connect to InfluxDB 3');
    }

    return {
        url: INFLUX_URL,
        database: INFLUX_DATABASE,
        isConnected: true,
    };
};

const ensureInfluxConnection = async () => {
    if (!isConnected) {
        await connectInflux();
    }

    if (!isConnected) {
        throw new Error('InfluxDB 3 is not connected');
    }
};

const escapeMeasurement = (value: string) =>
    value.replace(/,/g, '\\,').replace(/ /g, '\\ ').replace(/=/g, '\\=');

const escapeTagKey = escapeMeasurement;

const escapeTagValue = escapeMeasurement;

const escapeFieldKey = escapeMeasurement;

const escapeStringFieldValue = (value: string) =>
    `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const formatFieldValue = (value: InfluxFieldValue): string => {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error(`Invalid numeric field value: ${value}`);
        }

        return String(value);
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    return escapeStringFieldValue(String(value));
};

const formatTimestamp = (timestamp: Date | number | string): string => {
    if (timestamp instanceof Date) {
        return String(timestamp.getTime());
    }

    if (typeof timestamp === 'number') {
        if (!Number.isFinite(timestamp)) {
            throw new Error(`Invalid timestamp: ${timestamp}`);
        }

        return String(timestamp);
    }

    return String(timestamp);
};

const buildLineProtocol = ({
    measurement,
    fields,
    tags = {},
    timestamp,
}: InfluxPointInput): string => {
    if (!measurement) {
        throw new Error('InfluxDB measurement is required');
    }

    const fieldEntries = Object.entries(fields);

    if (fieldEntries.length === 0) {
        throw new Error(`InfluxDB point "${measurement}" must contain at least one field`);
    }

    const encodedMeasurement = escapeMeasurement(measurement);

    const encodedTags = Object.entries(tags)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${escapeTagKey(key)}=${escapeTagValue(String(value))}`)
        .sort()
        .join(',');

    const encodedFields = fieldEntries
        .map(([key, value]) => `${escapeFieldKey(key)}=${formatFieldValue(value)}`)
        .join(',');

    const prefix = encodedTags ? `${encodedMeasurement},${encodedTags}` : encodedMeasurement;
    const suffix = timestamp !== undefined ? ` ${formatTimestamp(timestamp)}` : '';

    return `${prefix} ${encodedFields}${suffix}`;
};

const writeLineProtocol = async (lineProtocol: string) => {
    await ensureInfluxConnection();

    const response = await fetch(getWriteUrl(), {
        method: 'POST',
        headers: {
            ...getAuthHeaders(),
            'Content-Type': 'text/plain; charset=utf-8',
        },
        body: lineProtocol,
        signal: AbortSignal.timeout(INFLUX_HEALTHCHECK_TIMEOUT_MS),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `InfluxDB write failed: ${response.status} ${response.statusText}${
                body ? ` - ${body}` : ''
            }`,
        );
    }
};

export const writeInfluxPoint = async (data: InfluxPointInput) => {
    await writeLineProtocol(buildLineProtocol(data));
};

export const writeInfluxPoints = async (data: InfluxPointInput[]) => {
    if (data.length === 0) return;

    const lineProtocol = data.map(buildLineProtocol).join('\n');

    await writeLineProtocol(lineProtocol);
};

/**
 * No-op intencionado.
 *
 * En esta versión no hay WriteApi con buffer local.
 * Cada llamada a writeInfluxPoint/writeInfluxPoints envía directamente
 * los datos a /api/v3/write_lp.
 */
export const flushInfluxWrites = async () => {
    await ensureInfluxConnection();
};

/**
 * Ejecuta SQL contra InfluxDB 3.
 *
 * Ejemplo:
 *   await queryInfluxRows('SELECT * FROM "cpu" LIMIT 10')
 */
export const queryInfluxRows = async <T = Record<string, unknown>>(query: string): Promise<T[]> => {
    await ensureInfluxConnection();

    const response = await fetch(getQuerySqlUrl(), {
        method: 'POST',
        headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            db: INFLUX_DATABASE,
            q: query,
            format: 'json' satisfies InfluxQueryFormat,
        }),
        signal: AbortSignal.timeout(INFLUX_HEALTHCHECK_TIMEOUT_MS),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `InfluxDB query failed: ${response.status} ${response.statusText}${
                body ? ` - ${body}` : ''
            }`,
        );
    }

    const data = await response.json();

    if (Array.isArray(data)) {
        return data as T[];
    }

    if (data && typeof data === 'object' && Array.isArray(data.results)) {
        return data.results as T[];
    }

    return data as T[];
};

/**
 * Ejecuta InfluxQL contra InfluxDB 3.
 *
 * Útil si quieres hacer queries estilo:
 *   SELECT * FROM cpu LIMIT 10
 */
export const queryInfluxQLRows = async <T = Record<string, unknown>>(
    query: string,
): Promise<T[]> => {
    await ensureInfluxConnection();

    const response = await fetch(`${getBaseInfluxUrl()}/api/v3/query_influxql`, {
        method: 'POST',
        headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            db: INFLUX_DATABASE,
            q: query,
            format: 'json' satisfies InfluxQueryFormat,
        }),
        signal: AbortSignal.timeout(INFLUX_HEALTHCHECK_TIMEOUT_MS),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `InfluxDB InfluxQL query failed: ${response.status} ${response.statusText}${
                body ? ` - ${body}` : ''
            }`,
        );
    }

    const data = await response.json();

    if (Array.isArray(data)) {
        return data as T[];
    }

    if (data && typeof data === 'object' && Array.isArray(data.results)) {
        return data.results as T[];
    }

    return data as T[];
};

export const disconnectInflux = async () => {
    stopHealthChecks();

    isConnected = false;
    wasDisconnected = false;
    isReconnecting = false;

    logger.info('Disconnected from InfluxDB 3');
};
