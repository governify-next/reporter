import { afterEach, vi } from 'vitest';

process.env.SERVICE_AUTHENTICATION_ENABLED = 'false';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
