import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { bootEnv } from '../src/config/bootConfig.js';
import * as serviceAuthentication from '../src/utils/serviceAuthentication.js';
import { serviceRequest } from './serviceRequest.js';

const orgId = '69cbdee759092b362376ca16';
const scopeId = '69cbdee759092b362376ca17';
const agColId = '69cbe9901d5009a04361925d';
const prefix = `/api/v1/influx/organizations/organization/scopes/${scopeId}/agreementCollections/${agColId}/agreementVersions`;
const path = `${prefix}/auditableVersion/tasks/states/sync`;
const input = { interval: 300000, lookbackMs: 3600000 };
const scope = { _id: scopeId, organizationId: orgId };
const collection = {
    _id: agColId,
    scopeId,
    auditableVersionNumber: 7,
    agreementVersions: [
        {
            versionNumber: 3,
            contract: {
                validity: { initial: '2026-01-01T00:00:00.000Z', end: '2099-01-01T00:00:00.000Z' },
            },
        },
        {
            versionNumber: 7,
            contract: {
                validity: { initial: '2026-08-01T00:00:00.000Z', end: '2099-06-01T00:00:00.000Z' },
            },
        },
    ],
};
const identity = { orgName: 'organization', orgId, scopeId, agColId, agreementVersion: 2 };
const directorBase = bootEnv.DIRECTOR_SERVICE_URL.replace(/\/+$/, '');
const scopeUrl = `${bootEnv.SCOPE_MANAGER_SERVICE_URL.replace(/\/+$/, '')}/api/v1/organizations/organization/scopes/${scopeId}`;
const registryUrl = `${bootEnv.REGISTRY_SERVICE_URL.replace(/\/+$/, '')}/api/v1/organizations/organization/agreementCollections/${agColId}?expand=false`;
const userToken = jwt.sign(
    { type: 'user', userId: 'user-id', username: 'member', systemRole: 'USER' },
    bootEnv.JWT_SECRET,
    { subject: 'user-id', issuer: bootEnv.JWT_ISSUER, audience: bootEnv.JWT_AUDIENCE },
);
const ok = (data: unknown, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => ({ success: status < 400, data }),
});

describe('Reporter synchronization task endpoints', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let selectedCollection: typeof collection;
    let directorStatus: number;

    beforeEach(() => {
        selectedCollection = structuredClone(collection);
        directorStatus = 201;
        fetchMock = vi.fn(async (url: string, init: RequestInit) => {
            if (url === scopeUrl) return ok(scope);
            if (url === registryUrl) return ok(selectedCollection);
            if (url === `${directorBase}/api/v1/tasks`)
                return ok({ _id: 'task-id', ...JSON.parse(init.body as string) }, directorStatus);
            if (url === `${directorBase}/api/v1/tasks/search`) return ok([]);
            if (url === `${directorBase}/api/v1/tasks/search/delete`)
                return ok({ deletedTasksCount: 1, deletedExecutionsCount: 2 });
            throw new Error(`Unexpected request ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(serviceAuthentication, 'getServiceHeaders').mockReturnValue({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
        });
    });

    const directorCalls = () =>
        fetchMock.mock.calls.filter(([url]) => String(url).startsWith(directorBase));

    it('creates one recurring task for the resolved version with stable defaults', async () => {
        const response = await serviceRequest.post(path).send(input);
        expect(response.status).toBe(201);
        expect(response.body.data).toEqual({
            _id: 'task-id',
            script: 'syncAgreementVersionStates',
            type: 'RECURRING',
            enabled: true,
            inputArgs: { ...identity, lookbackMs: input.lookbackMs },
            interval: input.interval,
            startDate: '2026-08-01T00:00:00.000Z',
            anchorDate: '2026-08-01T00:00:00.000Z',
            endDate: '2099-06-01T00:00:00.000Z',
        });
        expect(directorCalls()).toHaveLength(1);
        for (const [, init] of fetchMock.mock.calls) {
            expect(init.headers).toEqual({
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
            });
        }
        directorStatus = 200;
        const repeated = await serviceRequest.post(path).send(input);
        expect(repeated.status).toBe(200);
        expect(repeated.body.data).toEqual(response.body.data);
        expect(directorCalls()[0][1].body).toEqual(directorCalls()[1][1].body);
    });

    it('defaults anchorDate to agreement validity with an explicit startDate', async () => {
        const response = await serviceRequest
            .post(`${prefix}/2/tasks/states/sync?enabled=false`)
            .send({
                ...input,
                startDate: '2099-01-01T12:00:00+02:00',
                endDate: '2099-02-01T00:00:00Z',
            });
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            enabled: false,
            startDate: '2099-01-01T10:00:00.000Z',
            anchorDate: '2026-08-01T00:00:00.000Z',
            endDate: '2099-02-01T00:00:00.000Z',
            inputArgs: { ...identity, lookbackMs: input.lookbackMs },
        });
    });

    it('accepts an explicit anchorDate', async () => {
        const response = await serviceRequest.post(path).send({
            ...input,
            anchorDate: '2026-08-01T12:05:00+02:00',
        });
        expect(response.status).toBe(201);
        expect(response.body.data.anchorDate).toBe('2026-08-01T10:05:00.000Z');
    });

    it.each(['get', 'delete'] as const)(
        'scopes %s to recurring synchronization tasks of the selected agreement',
        async (method) => {
            const response = await serviceRequest[method](path);
            expect(response.status).toBe(200);
            const [url, init] = directorCalls()[0];
            expect(url).toBe(
                `${directorBase}/api/v1/tasks/search${method === 'delete' ? '/delete' : ''}`,
            );
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body as string)).toEqual({
                script: 'syncAgreementVersionStates',
                type: 'RECURRING',
                inputArgs: identity,
            });
            expect(response.body.data).toEqual(
                method === 'get' ? [] : { deletedTasksCount: 1, deletedExecutionsCount: 2 },
            );
        },
    );

    it('returns the task list supplied by Director', async () => {
        const upstream = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation((url, init) =>
            url === `${directorBase}/api/v1/tasks/search`
                ? Promise.resolve(ok([{ _id: 'task-id', inputArgs: identity }]))
                : upstream(url, init),
        );
        const response = await serviceRequest.get(path);
        expect(response.body.data).toEqual([{ _id: 'task-id', inputArgs: identity }]);
    });

    it('uses the explicit version selector independently of the current auditable version', async () => {
        selectedCollection.auditableVersionNumber = 3;
        const response = await serviceRequest.get(`${prefix}/2/tasks/states/sync`);
        expect(response.status).toBe(200);
        expect(JSON.parse(directorCalls()[0][1].body as string).inputArgs.agreementVersion).toBe(2);
    });

    it.each([true, false])(
        'allows an authenticated user to set synchronization enabled=%s',
        async (enabled) => {
            const response = await request(app)
                .post(`${path}?enabled=${enabled}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send(input);
            expect(response.status).toBe(201);
            expect(directorCalls()).toHaveLength(1);
            expect(JSON.parse(directorCalls()[0][1].body as string).enabled).toBe(enabled);
        },
    );

    it.each(['get', 'post', 'delete'] as const)(
        'requires authentication for %s',
        async (method) => {
            const response = await request(app)[method](path).send(input);
            expect(response.status).toBe(401);
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it.each([
        {},
        { interval: 1 },
        { lookbackMs: 1 },
        { ...input, interval: 0 },
        { ...input, lookbackMs: -1 },
        { ...input, interval: 1.5 },
        { ...input, lookbackMs: '3600000' },
        { ...input, interval: Number.MAX_SAFE_INTEGER + 1 },
        { ...input, startDate: 'invalid' },
        { ...input, anchorDate: null },
        { ...input, anchorDate: 'invalid' },
        { ...input, endDate: '2026-02-30T00:00:00Z' },
    ])('rejects invalid task options before contacting services: %j', async (body) => {
        const response = await serviceRequest.post(path).send(body);
        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an omitted body and invalid enabled values', async () => {
        expect((await serviceRequest.post(path)).status).toBe(400);
        expect((await serviceRequest.post(`${path}?enabled=yes`).send(input)).status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['0', '-1', '1.5', '9007199254740992', 'unknown'])(
        'rejects invalid selector %s',
        async (selector) => {
            expect(
                (await serviceRequest.get(`${prefix}/${selector}/tasks/states/sync`)).status,
            ).toBe(400);
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it.each([
        { endDate: '2020-01-01T00:00:00Z' },
        { startDate: '2099-02-01T00:00:00Z', endDate: '2099-01-01T00:00:00Z' },
        { endDate: '2026-07-01T00:00:00Z' },
    ])('rejects invalid schedule bounds before creating a task: %j', async (dates) => {
        expect((await serviceRequest.post(path).send({ ...input, ...dates })).status).toBe(400);
        expect(directorCalls()).toHaveLength(0);
    });

    it.each(['get', 'post', 'delete'] as const)(
        'rejects a collection belonging to another scope for %s',
        async (method) => {
            selectedCollection.scopeId = '69cbdee759092b362376ca18';
            expect((await serviceRequest[method](path).send(input)).status).toBe(404);
            expect(directorCalls()).toHaveLength(0);
        },
    );

    it('rejects a missing numeric or auditable version', async () => {
        selectedCollection.auditableVersionNumber = 99;
        expect((await serviceRequest.post(path).send(input)).status).toBe(404);
        expect((await serviceRequest.get(`${prefix}/3/tasks/states/sync`)).status).toBe(404);
        expect(directorCalls()).toHaveLength(0);
    });

    it.each([scopeUrl, registryUrl, `${directorBase}/api/v1/tasks/search`])(
        'reports an unavailable upstream: %s',
        async (failedUrl) => {
            const upstream = fetchMock.getMockImplementation()!;
            fetchMock.mockImplementation((url, init) =>
                url === failedUrl ? Promise.reject(new Error('Unavailable')) : upstream(url, init),
            );
            expect((await serviceRequest.get(path)).status).toBe(502);
            if (failedUrl !== `${directorBase}/api/v1/tasks/search`)
                expect(directorCalls()).toHaveLength(0);
        },
    );

    it('propagates missing resources and Director validation errors', async () => {
        const upstream = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation((url, init) =>
            url === registryUrl ? Promise.resolve(ok(null, 404)) : upstream(url, init),
        );
        expect((await serviceRequest.delete(path)).status).toBe(404);
        expect(directorCalls()).toHaveLength(0);
        fetchMock.mockImplementation((url, init) =>
            url === `${directorBase}/api/v1/tasks`
                ? Promise.resolve(ok(null, 400))
                : upstream(url, init),
        );
        expect((await serviceRequest.post(path).send(input)).status).toBe(400);
    });

    it.each([null, { success: false }, { success: true }])(
        'rejects invalid Director responses: %j',
        async (result) => {
            const upstream = fetchMock.getMockImplementation()!;
            fetchMock.mockImplementation((url, init) =>
                url === `${directorBase}/api/v1/tasks/search`
                    ? Promise.resolve({ ok: true, status: 200, json: async () => result })
                    : upstream(url, init),
            );
            expect((await serviceRequest.get(path)).status).toBe(502);
        },
    );

    it('rejects invalid JSON from Director', async () => {
        const upstream = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation((url, init) =>
            url === `${directorBase}/api/v1/tasks/search`
                ? Promise.resolve({
                      ok: true,
                      status: 200,
                      json: async () => {
                          throw new Error('Invalid JSON');
                      },
                  })
                : upstream(url, init),
        );
        expect((await serviceRequest.get(path)).status).toBe(502);
    });
});
