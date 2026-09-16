import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import * as registry from '../src/integrations/registry.integration.js';
import * as grafana from '../src/integrations/grafana.integration.js';
import type { AgreementVersion } from '../src/types/registry.types.js';

const route =
    '/api/v1/dashboards/organizations/org/scopes/scope/agreementCollections/collection/agreementVersions/1';
const version = (): AgreementVersion => ({
    versionNumber: 1,
    contract: {
        agreementTemplateName: 'template',
        validity: {
            timezone: 'Europe/Madrid',
            initial: '2026-01-01T00:00:00Z',
            end: '2027-01-01T00:00:00Z',
            earlyTermination: null,
        },
        signatures: ["Álvaro's team", 'Equipo B'].map((label, index) => ({
            signatureId: `69cbea571d5009a04361927${index}`,
            visualizationConfig: { label },
            guarantee: {
                name: 'guarantee',
                info: { title: 'Guarantee', description: 'Description', example: 'Example' },
                numericExpression: 'metric',
                comparator: '>=',
                threshold: 1,
                window: { anchorDate: '2026-01-01T00:00:00Z', period: [{ unit: 'day', value: 1 }] },
                metrics: [{ metricName: 'metric' }],
            },
        })),
    },
});

type Panel = {
    type: string;
    targets: { refId: string; rawSql: string }[];
    fieldConfig: {
        overrides: { matcher: { options: string }; properties: { id: string; value: unknown }[] }[];
    };
};

describe('dashboard signature label selection', () => {
    beforeEach(() => {
        vi.spyOn(registry, 'getAgreementCollectionInfo').mockResolvedValue({ name: 'agreement' });
        vi.spyOn(registry, 'getAgreementVersion').mockResolvedValue(version());
        vi.spyOn(grafana, 'ensureInfluxDataSource').mockResolvedValue({
            uid: 'source',
            name: 'source',
        });
        vi.spyOn(grafana, 'ensureFolder').mockResolvedValue({ uid: 'folder', title: 'folder' });
        vi.spyOn(grafana, 'syncAgreementValidityAnnotations').mockResolvedValue();
        vi.spyOn(grafana, 'saveDashboard').mockResolvedValue({
            uid: 'dashboard',
            url: '/d/dashboard',
            status: 'success',
            version: 1,
        });
    });

    it.each([
        undefined,
        {},
        { signatureLabelMode: 'label' },
        { signatureLabelMode: 'signatureId' },
    ])('uses the requested names throughout the dashboard for body %j', async (body) => {
        const response = await request(app).post(route).send(body);
        expect(response.status).toBe(200);
        const useId = body?.signatureLabelMode === 'signatureId';
        const { panels } = vi.mocked(grafana.saveDashboard).mock.calls[0][0] as { panels: Panel[] };
        const timeline = panels.find((panel) => panel.type === 'timeseries')!;
        const comparison = panels.find((panel) => panel.type === 'barchart')!;
        const expectedName = useId ? '619270' : "Álvaro's team";
        const expectedField = useId ? '619270' : '69cbea571d5009a043619270';
        const expectedSqlName = expectedName.replaceAll("'", "''");
        const query = timeline.targets.find((target) => target.refId === 'S1')!.rawSql;
        expect(query).toContain(`AS '${expectedField}'`);
        expect(query).toContain('"signatureId" = \'69cbea571d5009a043619270\'');
        expect(timeline.fieldConfig.overrides).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    matcher: { id: 'byName', options: expectedField },
                    properties: expect.arrayContaining([
                        { id: 'displayName', value: expectedName },
                    ]),
                }),
                expect.objectContaining({
                    matcher: {
                        id: 'byName',
                        options: `${expectedField} · Consolidated · Compliant`,
                    },
                }),
            ]),
        );
        const comparisonLabel = useId ? 'Signature 1: 619270' : expectedSqlName;
        expect(comparison.targets[0].rawSql).toContain(`THEN '${comparisonLabel}'`);
        expect(comparison.targets[0].rawSql).toContain('GROUP BY "signatureId"');
    });

    it.each([{ labels: ['Shared', 'Shared'] }, { labels: ['Threshold', 'Threshold background'] }])(
        'keeps series identities and colors independent for $labels',
        async ({ labels }) => {
            const selectedVersion = version();
            selectedVersion.contract.signatures.forEach((signature, index) => {
                signature.visualizationConfig.label = labels[index];
            });
            vi.mocked(registry.getAgreementVersion).mockResolvedValue(selectedVersion);
            const response = await request(app).post(route).send({ signatureLabelMode: 'label' });
            expect(response.status).toBe(200);
            const { panels } = vi.mocked(grafana.saveDashboard).mock.calls[0][0] as {
                panels: Panel[];
            };
            const timeline = panels.find((panel) => panel.type === 'timeseries')!;
            for (const [index, signature] of selectedVersion.contract.signatures.entries()) {
                const fieldOverride = timeline.fieldConfig.overrides.find(
                    (override) => override.matcher.options === signature.signatureId,
                )!;
                expect(fieldOverride.properties).toContainEqual({
                    id: 'displayName',
                    value: labels[index],
                });
                const query = timeline.targets.find(
                    (target) => target.refId === `S${index + 1}`,
                )!.rawSql;
                expect(query).toContain(`AS '${signature.signatureId}'`);
            }
            const overridesWithLabels = timeline.fieldConfig.overrides.filter((override) =>
                override.properties.some((property) => property.id === 'displayName'),
            );
            expect(overridesWithLabels).toHaveLength(2);
            expect(
                overridesWithLabels[0].properties.find((property) => property.id === 'color'),
            ).not.toEqual(
                overridesWithLabels[1].properties.find((property) => property.id === 'color'),
            );
        },
    );

    it('keeps older versions without visualizationConfig renderable', async () => {
        const legacy = version();
        for (const signature of legacy.contract.signatures) {
            Reflect.deleteProperty(signature, 'visualizationConfig');
        }
        vi.mocked(registry.getAgreementVersion).mockResolvedValue(legacy);
        const response = await request(app).post(route).send({ signatureLabelMode: 'label' });
        expect(response.status).toBe(200);
        const serialized = JSON.stringify(vi.mocked(grafana.saveDashboard).mock.calls[0][0]);
        expect(serialized).toContain("AS '619270'");
        expect(serialized).toContain("THEN 'Signature 1: 619270'");
    });

    it.each(['invalid', '', null, true, 1, [], {}])(
        'rejects invalid mode %j before contacting services',
        async (mode) => {
            const response = await request(app).post(route).send({ signatureLabelMode: mode });
            expect(response.status).toBe(400);
            expect(response.body.appCode).toBe('VALIDATION_ERROR');
            expect(registry.getAgreementVersion).not.toHaveBeenCalled();
            expect(grafana.saveDashboard).not.toHaveBeenCalled();
        },
    );
});
