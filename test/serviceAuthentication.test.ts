import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootEnv } from '../src/config/bootConfig.js';
import { fetchServiceToken, getServiceHeaders } from '../src/utils/serviceAuthentication.js';

describe('Reporter service authentication', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('gets its service token from Authenticator', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { token: 'authenticator-token' } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await fetchServiceToken();

        expect(fetchMock).toHaveBeenCalledWith(
            `${bootEnv.AUTHENTICATOR_SERVICE_URL}/api/v1/services/token`,
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    clientId: bootEnv.CLIENT_ID,
                    clientSecret: bootEnv.CLIENT_SECRET,
                }),
            }),
        );
        expect(getServiceHeaders()).toMatchObject({
            Authorization: 'Bearer authenticator-token',
        });
    });
});
