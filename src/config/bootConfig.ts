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

    // JWT configuration
    SERVICE_AUTHENTICATION_ENABLED: process.env.SERVICE_AUTHENTICATION_ENABLED === 'true',
    JWT_SECRET: process.env.JWT_SECRET || 'governify_secret_key',
};
