import dotenv from 'dotenv';
import path from 'path';

// Load .env file
const envPath = process.env.GOV_BOOT_ENV_PATH || path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath, quiet: true });

export const bootEnv = {
    // Service configuration
    NODE_ENV: process.env.NODE_ENV || 'development',
    GOV_LOG_LEVEL: process.env.GOV_LOG_LEVEL || 'INFO',
    GOV_SERVICE_NAME: process.env.GOV_SERVICE_NAME || 'reporter',
    PORT: process.env.PORT || '5905',

    // Internal service URLs
    REGISTRY_SERVICE_URL: process.env.REGISTRY_SERVICE_URL || 'http://localhost:5902',

    // Database URIs
    MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/governify',
    INFLUX_URL: process.env.INFLUX_URL || 'http://localhost:8181',

    // JWT configuration
    SERVICE_AUTHENTICATION_ENABLED: process.env.SERVICE_AUTHENTICATION_ENABLED === 'true',
    JWT_SECRET: process.env.JWT_SECRET || 'governify_secret_key',

    // InfluxDB settings
    INFLUX_TOKEN: process.env.INFLUX_TOKEN || 'supersecrettoken',
    INFLUX_DATABASE: process.env.INFLUX_DATABASE || 'governify',
    INFLUX_WRITE_PRECISION: process.env.INFLUX_WRITE_PRECISION || 'millisecond',
    INFLUX_MAX_FAST_RETRIES: Number(process.env.INFLUX_MAX_FAST_RETRIES || '5'),
    INFLUX_RETRY_FAST_DELAY_MS: Number(process.env.INFLUX_RETRY_FAST_DELAY_MS || '1000'),
    INFLUX_SLOW_RECONNECTION_MAX_RETRIES: Number(
        process.env.INFLUX_SLOW_RECONNECTION_MAX_RETRIES || '10',
    ),
    INFLUX_SLOW_RECONNECTION_STRATEGY: process.env.INFLUX_SLOW_RECONNECTION_STRATEGY === 'true',
    INFLUX_RETRY_SLOW_DELAY_MS: Number(process.env.INFLUX_RETRY_SLOW_DELAY_MS || '10000'),
    INFLUX_HEALTHCHECK_INTERVAL_MS: Number(process.env.INFLUX_HEALTHCHECK_INTERVAL_MS || '10000'),
    INFLUX_HEALTHCHECK_TIMEOUT_MS: Number(process.env.INFLUX_HEALTHCHECK_TIMEOUT_MS || '3000'),
};
