import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { bootEnv } from '../src/config/bootConfig.js';
import * as registryIntegration from '../src/integrations/registry.integration.js';
import * as influxService from '../src/services/influx.service.js';
import * as dashboardService from '../src/services/dashboard.service.js';
import * as grafanaIntegration from '../src/integrations/grafana.integration.js';
import { connectInflux, disconnectInflux, writeInfluxPoints } from '../src/db/influx.js';
import * as influxDb from '../src/db/influx.js';
import {
    ComplianceStatus,
    MetricStatus,
    StateStatus,
    type AgreementState,
    type AgreementVersionStatesResponse,
} from '../src/types/registry.types.js';

const buildState = (overrides: Partial<AgreementState> = {}): AgreementState => ({
    _id: '665e5f6a7b8c9d0e1f2a3b4c',
    signatureId: '69cbea571d5009a043619276',
    generationId: 'generation-1',
    attempt: 1,
    startDate: '2026-08-24T00:00:01.000Z',
    endDate: '2026-08-24T00:00:02.000Z',
    date: '2026-08-24T00:00:00.000Z',
    consolidated: true,
    status: StateStatus.COMPLETED,
    numericExpression: 'metric',
    comparator: '>=',
    threshold: 1,
    replacedNumericExpression: null,
    numericExpressionValue: null,
    complianceStatus: ComplianceStatus.INDETERMINATE,
    window: {
        anchorDate: '2026-08-23T00:00:00.000Z',
        period: [{ unit: 'day', value: 1 }],
    },
    metrics: [
        {
            metricName: 'metric',
            status: MetricStatus.UNAVAILABLE,
            value: null,
            evidences: [],
            errorMessage: null,
            metricConfig: {
                event: {
                    eventId: 'EVENT',
                    fetcherConfigs: [],
                    processConfig: null,
                },
                aggregation: {
                    aggregatorType: 'count',
                    aggregatorConfig: {},
                },
            },
        },
    ],
    ...overrides,
});

const agreementVersionStates: AgreementVersionStatesResponse = {
    organizationName: 'organization',
    scopeId: 'scope-id',
    agColId: '69cbe9901d5009a04361925d',
    agreementVersion: {
        versionNumber: 2,
        contract: {
            agreementTemplateName: 'template',
            validity: {
                timezone: 'Europe/Madrid',
                initial: '2026-01-01T00:00:00.000Z',
                end: '2026-12-31T23:59:59.000Z',
                earlyTermination: null,
            },
            signatures: [
                {
                    signatureId: '69cbea571d5009a043619276',
                    visualizationConfig: { label: 'Alice' },
                    guarantee: {
                        name: 'guarantee',
                        info: {
                            title: 'Guarantee title',
                            description: 'Guarantee description',
                            example: 'Guarantee example',
                        },
                        numericExpression: 'metric',
                        comparator: '>=',
                        threshold: 1,
                        window: {
                            anchorDate: '2026-08-23T00:00:00.000Z',
                            period: [{ unit: 'day', value: 1 }],
                        },
                        metrics: [{ metricName: 'metric' }],
                    },
                    states: [
                        buildState(),
                        buildState({
                            _id: '665e5f6a7b8c9d0e1f2a3b4d',
                            generationId: 'generation-2',
                            date: '2026-08-25T00:00:00.000Z',
                            endDate: null,
                            status: StateStatus.IN_PROGRESS,
                            complianceStatus: null,
                            metrics: [
                                {
                                    ...buildState().metrics[0],
                                    status: MetricStatus.PENDING,
                                },
                            ],
                        }),
                    ],
                },
            ],
        },
    },
};

describe('Registry integration', () => {
    it('loads agreement information without expanding versions and encodes identifiers', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                data: {
                    name: 'agreement',
                    displayName: 'Project agreement',
                    description: 'Description',
                    permissions: { private: true },
                    agreementVersions: [],
                },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);
        expect(
            await registryIntegration.getAgreementCollectionInfo(
                'organization name',
                'collection/id',
            ),
        ).toEqual({
            name: 'agreement',
            displayName: 'Project agreement',
            description: 'Description',
        });
        expect(fetchMock).toHaveBeenCalledWith(
            `${bootEnv.REGISTRY_SERVICE_URL.replace(/\/+$/, '')}/api/v1/organizations/organization%20name/agreementCollections/collection%2Fid?expand=false`,
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('uses the Registry State search route and safely encodes path parameters', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: agreementVersionStates }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await registryIntegration.getAgreementVersionStates(
            'organization name',
            'scope/id',
            agreementVersionStates.agColId,
            'auditableVersion',
        );

        expect(fetchMock).toHaveBeenCalledWith(
            `${bootEnv.REGISTRY_SERVICE_URL.replace(/\/+$/, '')}/api/v1/organizations/organization%20name/scopes/scope%2Fid/agreementCollections/${agreementVersionStates.agColId}/agreementVersions/auditableVersion/states/search`,
            expect.objectContaining({ method: 'POST', body: '{}' }),
        );
    });

    it('propagates Registry client errors through the Reporter response model', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                json: async () => ({
                    success: false,
                    message: 'Agreement version not found',
                    appCode: 'NOT_FOUND',
                    error: { message: 'Agreement version not found' },
                }),
            }),
        );

        await expect(
            registryIntegration.getAgreementVersionStates(
                'organization',
                'scope',
                agreementVersionStates.agColId,
                '3',
            ),
        ).rejects.toMatchObject({
            message: 'Agreement version not found',
            httpStatus: 404,
            appCode: 'NOT_FOUND',
        });
    });
});

describe('InfluxDB State projection', () => {
    it('includes indeterminate and in-progress States without leaving nullable values ambiguous', () => {
        const { statePoints, metricPoints } =
            influxService.buildInfluxPoints(agreementVersionStates);

        expect(statePoints).toHaveLength(2);
        expect(metricPoints).toHaveLength(2);
        expect(statePoints[0].tags).toMatchObject({
            organizationName: 'organization',
            scopeId: 'scope-id',
            agColId: agreementVersionStates.agColId,
            agreementVersion: '2',
        });
        expect(statePoints[0].fields).toMatchObject({
            status: StateStatus.COMPLETED,
            complianceStatus: ComplianceStatus.INDETERMINATE,
            numericExpressionValue: 0,
            numericExpressionValueAvailable: false,
        });
        expect(statePoints[1].fields).toMatchObject({
            status: StateStatus.IN_PROGRESS,
            complianceStatus: 'PENDING',
            endDateAvailable: false,
        });
        expect(metricPoints[0].fields).toMatchObject({
            status: MetricStatus.UNAVAILABLE,
            value: 0,
            valueAvailable: false,
        });
    });

    it('rejects terminal States that still use the previous Registry compliance model', () => {
        const staleAgreementVersionStates = structuredClone(agreementVersionStates);
        staleAgreementVersionStates.agreementVersion.contract.signatures[0].states![0].complianceStatus =
            undefined as never;

        expect(() => influxService.buildInfluxPoints(staleAgreementVersionStates)).toThrow(
            'is missing complianceStatus; migrate or regenerate it in Registry',
        );
    });

    it('splits large manual synchronizations into bounded write batches', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 204,
            statusText: 'No Content',
            text: async () => '',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await connectInflux();
            const result = await writeInfluxPoints(
                Array.from({ length: 5001 }, (_, index) => ({
                    measurement: 'batch_test',
                    tags: { stateId: String(index) },
                    fields: { value: index },
                    timestamp: index,
                })),
            );

            expect(result).toEqual({ points: 5001, batches: 2 });
            expect(
                fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/v3/write_lp')),
            ).toHaveLength(2);
        } finally {
            await disconnectInflux();
        }
    });
});

describe('Grafana dashboard projection', () => {
    beforeEach(() => {
        vi.spyOn(registryIntegration, 'getAgreementCollectionInfo').mockResolvedValue({
            name: 'agreement',
            displayName: 'Project agreement',
            description: 'Practices agreed with the project team.',
        });
        vi.spyOn(grafanaIntegration, 'syncAgreementValidityAnnotations').mockResolvedValue();
    });

    it('builds queries using scope, agreement collection id, and complianceStatus', async () => {
        vi.spyOn(registryIntegration, 'getAgreementVersion').mockResolvedValue(
            agreementVersionStates.agreementVersion,
        );
        vi.spyOn(grafanaIntegration, 'ensureInfluxDataSource').mockResolvedValue({
            uid: 'datasource',
            name: 'InfluxDB',
        });
        vi.spyOn(grafanaIntegration, 'ensureFolder').mockResolvedValue({
            uid: 'folder',
            title: 'Governify',
        });
        const saveDashboardSpy = vi.spyOn(grafanaIntegration, 'saveDashboard').mockResolvedValue({
            uid: 'dashboard',
            url: '/grafana/d/dashboard/organization-project-agreement-v2',
            status: 'success',
            version: 1,
        });

        const dashboardResult = await dashboardService.createAgreementVersionDashboard(
            'organization',
            'scope-id',
            agreementVersionStates.agColId,
            'auditableVersion',
        );

        const serializedDashboard = JSON.stringify(saveDashboardSpy.mock.calls[0][0]);
        const dashboardWithOverview = saveDashboardSpy.mock.calls[0][0] as {
            title: string;
            panels: Array<{
                id: number;
                type: string;
                title: string;
                gridPos: { y: number; h: number; w: number };
                options?: { content: string };
            }>;
        };
        const overview = dashboardWithOverview.panels[0];
        expect(dashboardWithOverview.title).toBe('organization / Project agreement / v2');
        expect(dashboardResult.grafanaUrl).toBe(
            `${bootEnv.GRAFANA_PUBLIC_URL.replace(/\/+$/, '')}/d/dashboard`,
        );
        expect(overview).toMatchObject({
            type: 'text',
            title: '',
            gridPos: { y: 0, w: 24 },
        });
        expect(overview.options?.content).toContain('## Project agreement');
        expect(overview.options?.content).toContain(
            '**Decription:** Practices agreed with the project team',
        );
        expect(overview.options?.content).toContain(
            '**Organization:** organization · **Version:** 2',
        );
        expect(overview.options?.content).toContain('**Template:** template');
        expect(overview.options?.content).toContain('01 Jan 2026, 01:00:00');
        expect(overview.options?.content).toContain('01 Jan 2027, 00:59:59');
        expect(overview.options?.content).toContain('Europe/Madrid');
        expect(overview.options?.content).not.toContain('**Practices:**');
        expect(overview.options?.content).not.toContain('**Signatures:**');
        expect(
            dashboardWithOverview.panels
                .slice(1)
                .every((panel) => panel.gridPos.y >= overview.gridPos.h),
        ).toBe(true);
        expect(new Set(dashboardWithOverview.panels.map((panel) => panel.id)).size).toBe(
            dashboardWithOverview.panels.length,
        );
        expect(serializedDashboard).toContain('scopeId');
        expect(serializedDashboard).toContain('agColId');
        expect(serializedDashboard).toContain('complianceStatus');
        expect(serializedDashboard).not.toContain('elementName');
        expect(serializedDashboard).not.toContain('agreementCollectionName');
        expect(serializedDashboard).not.toContain('"compliant"');
        expect(serializedDashboard).toContain('"axisSoftMin":0');
        expect(serializedDashboard).not.toContain('#5794F2');

        const savedDashboard = saveDashboardSpy.mock.calls[0][0] as {
            panels?: Array<{
                type?: string;
                title?: string;
                pluginVersion?: string;
                targets?: Array<{ refId?: string; rawSql?: string }>;
                transformations?: Array<{
                    id?: string;
                    options?: { fields?: string[] };
                }>;
                options?: {
                    mode?: string;
                    content?: string;
                    mapping?: string;
                    series?: unknown[];
                    legend?: { showLegend?: boolean };
                    tooltip?: { mode?: string };
                    axisColor?: string;
                    currentColor?: string;
                    currentSize?: number;
                    decimals?: number;
                    hoverSize?: number;
                    lineColor?: string;
                    lineWidth?: number;
                    otherColor?: string;
                    otherSize?: number;
                };
                fieldConfig?: {
                    defaults?: Record<string, unknown>;
                    overrides?: Array<{
                        matcher?: { id?: string; options?: string };
                        properties?: Array<{ id?: string; value?: unknown }>;
                    }>;
                };
            }>;
        };
        const timelinePanels = savedDashboard.panels?.filter(
            (panel) => panel.type === 'timeseries',
        );
        const guaranteeRow = savedDashboard.panels?.find((panel) => panel.type === 'row');
        const guaranteeInfoPanel = savedDashboard.panels
            ?.slice(1)
            .find((panel) => panel.type === 'text' && panel.title === '');
        const signatureGaugePanels = savedDashboard.panels?.filter(
            (panel) => panel.type === 'gauge' && panel.title?.startsWith('Signature '),
        );
        const complianceGaugePanels = savedDashboard.panels?.filter(
            (panel) => panel.type === 'gauge',
        );
        const rankingPanel = savedDashboard.panels?.find(
            (panel) => panel.title === 'Compliance ranking',
        );
        const guaranteeRowIndex = savedDashboard.panels?.indexOf(guaranteeRow!);
        const guaranteeInfoPanelIndex = savedDashboard.panels?.indexOf(guaranteeInfoPanel!);
        const timelinePanelIndex = savedDashboard.panels?.findIndex(
            (panel) => panel.type === 'timeseries',
        );
        expect(savedDashboard).toMatchObject({
            links: [],
            timepicker: {
                quick_ranges: expect.arrayContaining([
                    {
                        display: 'Agreement validity',
                        from: '2026-01-01T00:00:00.000Z',
                        to: '2026-12-31T23:59:59.000Z',
                    },
                    {
                        display: 'Last 5 minutes',
                        from: 'now-5m',
                        to: 'now',
                    },
                    {
                        display: 'This fiscal year',
                        from: 'now/fy',
                        to: 'now/fy',
                    },
                ]),
            },
            annotations: {
                list: [
                    expect.objectContaining({
                        builtIn: 1,
                        enable: true,
                        name: 'Agreement validity',
                    }),
                ],
            },
            templating: {
                list: [
                    expect.objectContaining({
                        current: { selected: true, text: 'true', value: 'true' },
                        label: 'Evolutive points',
                        name: 'showEvolutivePoints',
                        options: [
                            { selected: true, text: 'true', value: 'true' },
                            { selected: false, text: 'false', value: 'false' },
                        ],
                        type: 'switch',
                    }),
                ],
            },
            time: {
                from: '2026-01-01T00:00:00.000Z',
                to: '2026-12-31T23:59:59.000Z',
            },
        });
        expect(grafanaIntegration.syncAgreementValidityAnnotations).toHaveBeenCalledWith(
            'dashboard',
            [
                {
                    panelId: 6,
                    boundary: 'start',
                    time: new Date('2026-01-01T00:00:00.000Z').getTime(),
                },
                {
                    panelId: 6,
                    boundary: 'end',
                    time: new Date('2026-12-31T23:59:59.000Z').getTime(),
                },
            ],
        );
        expect(guaranteeRow?.title).toBe('Guarantee title');
        expect(guaranteeRowIndex).toBeLessThan(guaranteeInfoPanelIndex!);
        expect(guaranteeInfoPanelIndex).toBeLessThan(timelinePanelIndex!);
        expect(guaranteeInfoPanel).toMatchObject({
            title: '',
            options: {
                mode: 'markdown',
            },
        });
        expect(guaranteeInfoPanel?.options?.content).toContain(
            '**Description:** Guarantee description',
        );
        expect(guaranteeInfoPanel?.options?.content).toContain('**Example:** Guarantee example');
        expect(guaranteeInfoPanel?.options?.content).not.toContain('**Guarantee template:**');
        expect(guaranteeInfoPanel?.options?.content).toContain('**Formula:** `metric`');
        expect(guaranteeInfoPanel?.options?.content).toContain(
            '**Comparator:** `>=` · **Threshold:** `1`',
        );
        expect(guaranteeInfoPanel?.options?.content).toContain('**Condition:** `metric >= 1`');
        expect(guaranteeInfoPanel?.options?.content).toContain(
            '**Window:** 1 day · **Anchor date:** `2026-08-23T00:00:00.000Z`',
        );
        expect(guaranteeInfoPanel?.options?.content).toContain('**Metrics:** `metric`');
        expect(timelinePanels?.[0]?.title).toBe('Timeline - Guarantee title >= 1');
        expect(timelinePanels?.length).toBeGreaterThan(0);
        expect(signatureGaugePanels).toHaveLength(0);
        for (const gaugePanel of complianceGaugePanels ?? []) {
            expect(gaugePanel.targets?.[0]?.rawSql).toContain('AND "consolidated" = TRUE');
        }
        expect(rankingPanel).toMatchObject({
            type: 'governify-compliance-ranking-panel',
            pluginVersion: '1.0.2',
            options: {
                axisColor: '#4a4a4a',
                currentColor: '#3274d9',
                currentSize: 7,
                decimals: 1,
                hoverSize: 12,
                lineColor: '#c7c7c7',
                lineWidth: 2,
                otherColor: '#4a4a4a',
                otherSize: 5,
            },
        });
        expect(rankingPanel?.targets?.map((target) => target.refId)).toEqual(['R', 'O', 'C']);

        const rankingRangeQuery = rankingPanel?.targets?.find(
            (target) => target.refId === 'R',
        )?.rawSql;
        expect(rankingRangeQuery).toContain('CAST(0 AS DOUBLE) AS "Compliance"');
        expect(rankingRangeQuery).toContain('CAST(100 AS DOUBLE) AS "Compliance"');
        expect(rankingRangeQuery).not.toContain('Agreement collection ID');

        const otherAgreementsQuery = rankingPanel?.targets?.find(
            (target) => target.refId === 'O',
        )?.rawSql;
        const currentAgreementQuery = rankingPanel?.targets?.find(
            (target) => target.refId === 'C',
        )?.rawSql;
        for (const rankingQuery of [otherAgreementsQuery, currentAgreementQuery]) {
            expect(rankingQuery).toContain('AND "consolidated" = TRUE');
            expect(rankingQuery).toContain('compliance AS "Compliance"');
            expect(rankingQuery).not.toContain('Agreement collection ID');
            expect(rankingQuery).toContain('CAST(1 AS DOUBLE)');
            expect(rankingQuery).toContain('COUNT(*) AS agreement_count');
            expect(rankingQuery).toContain('AS contains_current_agreement');
            expect(rankingQuery).toContain('GROUP BY compliance');
            expect(rankingQuery).toContain('CAST(agreement_count AS VARCHAR) AS "Agreements"');
            expect(rankingQuery).not.toContain('ROW_NUMBER()');
            expect(rankingQuery).not.toContain('rank_position');
            expect(rankingQuery).not.toContain('LIMIT');
            expect(rankingQuery).not.toContain('CAST(NULL AS DOUBLE)');
        }
        expect(otherAgreementsQuery).toContain('WHERE contains_current_agreement = 0');
        expect(otherAgreementsQuery).toContain('AS "Other agreements"');
        expect(currentAgreementQuery).toContain('WHERE contains_current_agreement = 1');
        expect(currentAgreementQuery).toContain('AS "Current agreement"');
        for (const timelinePanel of timelinePanels ?? []) {
            expect(timelinePanel.fieldConfig?.defaults).toMatchObject({
                color: { mode: 'palette-classic-by-name' },
                decimals: 0,
            });
            expect(
                (timelinePanel.fieldConfig?.defaults?.custom as Record<string, unknown>)
                    ?.axisSoftMax,
            ).toBeUndefined();
            expect(timelinePanel.targets?.map((target) => target.refId)).toEqual(['T', 'S1']);

            const thresholdQuery = timelinePanel.targets?.find(
                (target) => target.refId === 'T',
            )?.rawSql;
            expect(thresholdQuery).toContain('CAST(NULL AS DOUBLE) AS "Threshold background"');
            expect(thresholdQuery).toContain('CAST(1 AS DOUBLE) AS "Threshold"');

            const signatureQuery = timelinePanel.targets?.find(
                (target) => target.refId === 'S1',
            )?.rawSql;
            expect(signatureQuery).toContain('"consolidated" = TRUE');
            expect(signatureQuery).toContain("'${showEvolutivePoints:raw}' = 'true'");
            expect(signatureQuery).toContain('"consolidated" = FALSE');
            for (const pointSeriesName of [
                '69cbea571d5009a043619276 · Consolidated · Compliant',
                '69cbea571d5009a043619276 · Consolidated · Non-compliant',
                '69cbea571d5009a043619276 · Consolidated · Indeterminate',
                '69cbea571d5009a043619276 · Evolutive · Compliant',
                '69cbea571d5009a043619276 · Evolutive · Non-compliant',
                '69cbea571d5009a043619276 · Evolutive · Indeterminate',
            ]) {
                expect(signatureQuery).toContain(pointSeriesName);
            }
            expect(signatureQuery).toContain('"complianceStatus" = \'COMPLIANT\'');
            expect(signatureQuery).toContain('"complianceStatus" = \'NON_COMPLIANT\'');

            const thresholdBackgroundOverride = timelinePanel.fieldConfig?.overrides?.find(
                (override) => override.matcher?.options === 'Threshold background',
            );
            expect(thresholdBackgroundOverride?.matcher?.id).toBe('byName');
            expect(thresholdBackgroundOverride?.properties).toEqual(
                expect.arrayContaining([
                    {
                        id: 'thresholds',
                        value: {
                            mode: 'absolute',
                            steps: [
                                { value: null, color: 'red' },
                                { value: 1, color: 'green' },
                            ],
                        },
                    },
                    { id: 'custom.thresholdsStyle', value: { mode: 'area' } },
                    { id: 'custom.lineWidth', value: 0 },
                    { id: 'custom.showPoints', value: 'never' },
                    {
                        id: 'custom.hideFrom',
                        value: { legend: true, tooltip: true, viz: false },
                    },
                ]),
            );

            const thresholdLineOverride = timelinePanel.fieldConfig?.overrides?.find(
                (override) => override.matcher?.options === 'Threshold',
            );
            expect(thresholdLineOverride?.matcher?.id).toBe('byName');
            expect(thresholdLineOverride?.properties).toEqual(
                expect.arrayContaining([
                    {
                        id: 'color',
                        value: { mode: 'fixed', fixedColor: 'green' },
                    },
                    { id: 'custom.thresholdsStyle', value: { mode: 'off' } },
                    { id: 'custom.lineWidth', value: 1 },
                    { id: 'custom.showPoints', value: 'never' },
                    {
                        id: 'custom.hideFrom',
                        value: { legend: true, tooltip: true, viz: false },
                    },
                ]),
            );

            const signatureLineOverride = timelinePanel.fieldConfig?.overrides?.find(
                (override) => override.matcher?.options === '69cbea571d5009a043619276',
            );
            const consolidatedPointOverride = timelinePanel.fieldConfig?.overrides?.find(
                (override) =>
                    override.matcher?.options ===
                    '69cbea571d5009a043619276 · Consolidated · Compliant',
            );
            const evolutivePointOverride = timelinePanel.fieldConfig?.overrides?.find(
                (override) =>
                    override.matcher?.options ===
                    '69cbea571d5009a043619276 · Evolutive · Non-compliant',
            );
            expect(consolidatedPointOverride?.matcher?.id).toBe('byName');
            expect(consolidatedPointOverride?.properties).toEqual(
                expect.arrayContaining([
                    { id: 'custom.drawStyle', value: 'points' },
                    { id: 'custom.lineWidth', value: 0 },
                    { id: 'custom.showPoints', value: 'always' },
                    { id: 'custom.pointSize', value: 6 },
                    {
                        id: 'custom.hideFrom',
                        value: { legend: true, tooltip: true, viz: false },
                    },
                ]),
            );
            expect(evolutivePointOverride?.matcher?.id).toBe('byName');
            expect(evolutivePointOverride?.properties).toEqual(
                expect.arrayContaining([
                    { id: 'custom.drawStyle', value: 'points' },
                    { id: 'custom.lineWidth', value: 0 },
                    { id: 'custom.showPoints', value: 'always' },
                    { id: 'custom.pointSize', value: 3 },
                    {
                        id: 'custom.hideFrom',
                        value: { legend: true, tooltip: true, viz: false },
                    },
                ]),
            );
            const signatureColor = signatureLineOverride?.properties?.find(
                (property) => property.id === 'color',
            )?.value;
            expect(signatureColor).toMatchObject({ mode: 'fixed' });
            expect(String((signatureColor as { fixedColor?: string })?.fixedColor)).toMatch(
                /^#[0-9a-f]{6}$/,
            );
            expect(
                consolidatedPointOverride?.properties?.find((property) => property.id === 'color')
                    ?.value,
            ).toEqual(signatureColor);
            expect(
                evolutivePointOverride?.properties?.find((property) => property.id === 'color')
                    ?.value,
            ).toEqual(signatureColor);
        }
    });

    it('compares multiple signatures in one horizontal bar chart', async () => {
        const selectedAgreementVersion = structuredClone(agreementVersionStates.agreementVersion);
        const sourceSignature = selectedAgreementVersion.contract.signatures[0];
        selectedAgreementVersion.contract.signatures.push({
            ...structuredClone(sourceSignature),
            signatureId: '69cbea571d5009a043619277',
            visualizationConfig: { label: 'Bob' },
            states: [],
        });

        vi.spyOn(registryIntegration, 'getAgreementVersion').mockResolvedValue(
            selectedAgreementVersion,
        );
        vi.spyOn(grafanaIntegration, 'ensureInfluxDataSource').mockResolvedValue({
            uid: 'datasource',
            name: 'InfluxDB',
        });
        vi.spyOn(grafanaIntegration, 'ensureFolder').mockResolvedValue({
            uid: 'folder',
            title: 'Governify',
        });
        const saveDashboardSpy = vi.spyOn(grafanaIntegration, 'saveDashboard').mockResolvedValue({
            uid: 'dashboard',
            url: '/d/dashboard',
            status: 'success',
            version: 1,
        });

        await dashboardService.createAgreementVersionDashboard(
            'organization',
            'scope-id',
            agreementVersionStates.agColId,
            'auditableVersion',
        );

        const savedDashboard = saveDashboardSpy.mock.calls[0][0] as {
            panels?: Array<{
                type?: string;
                title?: string;
                targets?: Array<{ rawSql?: string }>;
                options?: {
                    orientation?: string;
                    xField?: string;
                    stacking?: string;
                    showValue?: string;
                    legend?: {
                        showLegend?: boolean;
                        displayMode?: string;
                        placement?: string;
                    };
                };
                fieldConfig?: {
                    defaults?: Record<string, unknown>;
                };
            }>;
        };
        const signatureGaugePanels = savedDashboard.panels?.filter(
            (panel) => panel.type === 'gauge' && panel.title?.startsWith('Signature '),
        );
        const signatureComparisonPanel = savedDashboard.panels?.find(
            (panel) => panel.type === 'barchart' && panel.title === 'Signature compliance',
        );

        expect(signatureGaugePanels).toHaveLength(0);
        expect(signatureComparisonPanel).toMatchObject({
            options: {
                orientation: 'horizontal',
                xField: 'Signature',
                stacking: 'none',
                showValue: 'never',
                legend: {
                    showLegend: true,
                    displayMode: 'list',
                    placement: 'bottom',
                },
            },
            fieldConfig: {
                defaults: {
                    min: 0,
                    unit: 'percent',
                    color: { mode: 'palette-classic-by-name' },
                    custom: {
                        axisSoftMin: 0,
                        axisSoftMax: 102,
                    },
                },
            },
        });
        expect(signatureComparisonPanel?.fieldConfig?.defaults).not.toHaveProperty('max');
        const comparisonQuery = signatureComparisonPanel?.targets?.[0]?.rawSql;
        expect(comparisonQuery).toContain('AS "All time"');
        expect(comparisonQuery).toContain('AS "Selected period"');
        expect(comparisonQuery).toContain("THEN 'Alice'");
        expect(comparisonQuery).toContain("THEN 'Bob'");
        expect(comparisonQuery).toContain('$__timeFilter(time)');
        expect(comparisonQuery).toContain('AND "consolidated" = TRUE');
        expect(comparisonQuery).toContain('GROUP BY "signatureId"');
    });

    it('uses early termination as the default dashboard end when it is present', async () => {
        const selectedAgreementVersion = structuredClone(agreementVersionStates.agreementVersion);
        selectedAgreementVersion.contract.validity.earlyTermination = '2026-06-30T12:00:00.000Z';

        vi.spyOn(registryIntegration, 'getAgreementVersion').mockResolvedValue(
            selectedAgreementVersion,
        );
        vi.spyOn(grafanaIntegration, 'ensureInfluxDataSource').mockResolvedValue({
            uid: 'datasource',
            name: 'InfluxDB',
        });
        vi.spyOn(grafanaIntegration, 'ensureFolder').mockResolvedValue({
            uid: 'folder',
            title: 'Governify',
        });
        const saveDashboardSpy = vi.spyOn(grafanaIntegration, 'saveDashboard').mockResolvedValue({
            uid: 'dashboard',
            url: '/d/dashboard',
            status: 'success',
            version: 1,
        });

        await dashboardService.createAgreementVersionDashboard(
            'organization',
            'scope-id',
            agreementVersionStates.agColId,
            'auditableVersion',
        );

        expect(saveDashboardSpy.mock.calls[0][0]).toMatchObject({
            panels: expect.arrayContaining([
                expect.objectContaining({
                    title: '',
                    options: expect.objectContaining({
                        content: expect.stringContaining(
                            '**Early termination:** 30 Jun 2026, 14:00:00',
                        ),
                    }),
                }),
                expect.objectContaining({
                    title: '',
                    options: expect.objectContaining({
                        content: expect.stringContaining(
                            '**Originally scheduled end:** 01 Jan 2027, 00:59:59',
                        ),
                    }),
                }),
            ]),
            links: [],
            timepicker: {
                quick_ranges: expect.arrayContaining([
                    {
                        display: 'Agreement validity',
                        from: '2026-01-01T00:00:00.000Z',
                        to: '2026-06-30T12:00:00.000Z',
                    },
                    {
                        display: 'Last 5 minutes',
                        from: 'now-5m',
                        to: 'now',
                    },
                ]),
            },
            time: {
                from: '2026-01-01T00:00:00.000Z',
                to: '2026-06-30T12:00:00.000Z',
            },
        });
        expect(grafanaIntegration.syncAgreementValidityAnnotations).toHaveBeenCalledWith(
            'dashboard',
            expect.arrayContaining([
                expect.objectContaining({
                    boundary: 'end',
                    time: new Date('2026-06-30T12:00:00.000Z').getTime(),
                }),
            ]),
        );
    });

    it('colors threshold regions and their boundary line according to the comparator', async () => {
        const comparatorColors = [
            ['<=', ['green', 'red'], 'green'],
            ['>=', ['red', 'green'], 'green'],
            ['=', ['red', 'green'], 'green'],
            ['==', ['red', 'green'], 'green'],
            ['<', ['green', 'red'], 'red'],
            ['>', ['red', 'green'], 'red'],
            ['!=', ['red', 'green'], 'red'],
        ] as const;
        const selectedAgreementVersion = structuredClone(agreementVersionStates.agreementVersion);
        const sourceSignature = selectedAgreementVersion.contract.signatures[0];
        selectedAgreementVersion.contract.signatures = comparatorColors.map(
            ([comparator], index) => ({
                ...structuredClone(sourceSignature),
                signatureId: `69cbea571d5009a0436192${String(index).padStart(2, '0')}`,
                guarantee: {
                    ...structuredClone(sourceSignature.guarantee),
                    name: `guarantee-${index}`,
                    info: {
                        ...structuredClone(sourceSignature.guarantee.info),
                        title: `Guarantee ${index}`,
                    },
                    comparator,
                },
            }),
        );

        vi.spyOn(registryIntegration, 'getAgreementVersion').mockResolvedValue(
            selectedAgreementVersion,
        );
        vi.spyOn(grafanaIntegration, 'ensureInfluxDataSource').mockResolvedValue({
            uid: 'datasource',
            name: 'InfluxDB',
        });
        vi.spyOn(grafanaIntegration, 'ensureFolder').mockResolvedValue({
            uid: 'folder',
            title: 'Governify',
        });
        const saveDashboardSpy = vi.spyOn(grafanaIntegration, 'saveDashboard').mockResolvedValue({
            uid: 'dashboard',
            url: '/d/dashboard',
            status: 'success',
            version: 1,
        });

        await dashboardService.createAgreementVersionDashboard(
            'organization',
            'scope-id',
            agreementVersionStates.agColId,
            'auditableVersion',
        );

        const savedDashboard = saveDashboardSpy.mock.calls[0][0] as {
            panels?: Array<{
                title?: string;
                fieldConfig?: {
                    overrides?: Array<{
                        matcher?: { options?: string };
                        properties?: Array<{ id?: string; value?: unknown }>;
                    }>;
                };
            }>;
        };

        for (const [
            index,
            [comparator, expectedColors, expectedLineColor],
        ] of comparatorColors.entries()) {
            const timelinePanel = savedDashboard.panels?.find(
                (panel) => panel.title === `Timeline - Guarantee ${index} ${comparator} 1`,
            );
            const thresholdBackgroundOverride = timelinePanel?.fieldConfig?.overrides?.find(
                (override) => override.matcher?.options === 'Threshold background',
            );
            const thresholdsProperty = thresholdBackgroundOverride?.properties?.find(
                (property) => property.id === 'thresholds',
            );

            const thresholds = thresholdsProperty?.value as {
                mode: string;
                steps: Array<{ value: number | null; color: string }>;
            };
            expect(thresholds.mode).toBe('absolute');
            expect(thresholds.steps).toEqual([
                { value: null, color: expectedColors[0] },
                { value: 1, color: expectedColors[1] },
            ]);

            const thresholdLineOverride = timelinePanel?.fieldConfig?.overrides?.find(
                (override) => override.matcher?.options === 'Threshold',
            );
            const lineColor = thresholdLineOverride?.properties?.find(
                (property) => property.id === 'color',
            )?.value;
            expect(lineColor).toEqual({
                mode: 'fixed',
                fixedColor: expectedLineColor,
            });
        }
    });
});

describe('Grafana integration', () => {
    it('updates an existing dashboard using its current Grafana id and version', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    dashboard: {
                        id: 42,
                        uid: 'dashboard-uid',
                        version: 7,
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    uid: 'dashboard-uid',
                    url: '/d/dashboard-uid',
                    status: 'success',
                    version: 8,
                }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const result = await grafanaIntegration.saveDashboard({
            uid: 'dashboard-uid',
            title: 'Dashboard',
        });

        expect(result.version).toBe(8);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            `${bootEnv.GRAFANA_URL.replace(/\/+$/, '')}/api/dashboards/uid/dashboard-uid`,
            expect.objectContaining({ headers: expect.any(Object) }),
        );

        const saveRequest = fetchMock.mock.calls[1][1] as RequestInit;
        const savePayload = JSON.parse(String(saveRequest.body));
        expect(savePayload).toMatchObject({
            dashboard: {
                id: 42,
                uid: 'dashboard-uid',
                version: 7,
            },
            overwrite: true,
        });
    });

    it('upserts validity annotations and removes stale managed annotations', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [
                    {
                        id: 10,
                        panelId: 6,
                        time: 1,
                        timeEnd: 1,
                        text: 'Agreement validity start',
                        tags: [
                            'governify:agreement-validity',
                            'governify:agreement-validity:start',
                        ],
                    },
                    {
                        id: 11,
                        panelId: 99,
                        time: 2,
                        timeEnd: 2,
                        text: 'Agreement validity end',
                        tags: ['governify:agreement-validity', 'governify:agreement-validity:end'],
                    },
                ],
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ message: 'Annotation patched' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ message: 'Annotation added', id: 12 }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ message: 'Annotation deleted' }),
            });
        vi.stubGlobal('fetch', fetchMock);

        await grafanaIntegration.syncAgreementValidityAnnotations('dashboard-uid', [
            { panelId: 6, boundary: 'start', time: 100 },
            { panelId: 6, boundary: 'end', time: 200 },
        ]);

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            `${bootEnv.GRAFANA_URL.replace(/\/+$/, '')}/api/annotations?dashboardUID=dashboard-uid&type=annotation&limit=1000`,
            expect.objectContaining({ headers: expect.any(Object) }),
        );
        expect(fetchMock.mock.calls[1][0]).toBe(
            `${bootEnv.GRAFANA_URL.replace(/\/+$/, '')}/api/annotations/10`,
        );
        expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH' });
        expect(fetchMock.mock.calls[2][0]).toBe(
            `${bootEnv.GRAFANA_URL.replace(/\/+$/, '')}/api/annotations`,
        );
        expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
            dashboardUID: 'dashboard-uid',
            panelId: 6,
            time: 200,
            text: 'Agreement validity end',
        });
        expect(fetchMock.mock.calls[3][0]).toBe(
            `${bootEnv.GRAFANA_URL.replace(/\/+$/, '')}/api/annotations/11`,
        );
        expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'DELETE' });
    });
});

describe('Reporter routes', () => {
    const syncPath = `/api/v1/influx/organizations/organization/scopes/scope-id/agreementCollections/${agreementVersionStates.agColId}/agreementVersions/auditableVersion/states/sync`;
    const updatedFrom = '2026-09-22T12:00:00+02:00';
    const updatedTo = '2026-09-22T11:00:00.000Z';

    it.each([undefined, {}, { updatedFrom }, { updatedTo }, { updatedFrom, updatedTo }])(
        'forwards optional bounds from the POST body to Registry and writes the returned States: %j',
        async (body) => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true, data: agreementVersionStates }),
            });
            vi.stubGlobal('fetch', fetchMock);
            const writeSpy = vi
                .spyOn(influxDb, 'writeInfluxPoints')
                .mockResolvedValue({ points: 4, batches: 1 });

            const req = request(app).post(syncPath);
            const response = await (body === undefined ? req : req.send(body));

            expect(response.status).toBe(200);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, options] = fetchMock.mock.calls[0];
            expect(new URL(url).pathname).toBe(
                syncPath.replace('/influx', '').replace('/sync', '/search'),
            );
            expect(options.method).toBe('POST');
            expect(JSON.parse(options.body)).toEqual(body ?? {});
            expect(writeSpy).toHaveBeenCalledWith([
                ...influxService.buildInfluxPoints(agreementVersionStates).statePoints,
                ...influxService.buildInfluxPoints(agreementVersionStates).metricPoints,
            ]);
            expect(response.body.data.totalPoints).toBe(4);
        },
    );

    it('accepts equal bounds and handles an empty Registry selection', async () => {
        const emptySelection = structuredClone(agreementVersionStates);
        emptySelection.agreementVersion.contract.signatures[0].states = [];
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true, data: emptySelection }),
            }),
        );
        const writeSpy = vi
            .spyOn(influxDb, 'writeInfluxPoints')
            .mockResolvedValue({ points: 0, batches: 0 });
        const response = await request(app)
            .post(syncPath)
            .send({ updatedFrom, updatedTo: updatedFrom });
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            statePoints: 0,
            metricPoints: 0,
            totalPoints: 0,
            batches: 0,
        });
        expect(writeSpy).toHaveBeenCalledWith([]);
    });

    it.each([
        { updatedFrom: 'invalid' },
        { updatedTo: '' },
        { updatedFrom: null },
        { updatedTo: 123 },
        { updatedFrom: [updatedFrom] },
        { updatedTo: { nested: updatedTo } },
        { updatedFrom: '2026-02-30T00:00:00Z' },
        { updatedFrom: updatedTo, updatedTo: updatedFrom },
    ])('rejects invalid bounds before contacting Registry: %j', async (body) => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const response = await request(app).post(syncPath).send(body);
        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('forwards the current identifiers to the manual synchronization service', async () => {
        const syncResult = {
            organizationName: 'organization',
            scopeId: 'scope-id',
            agColId: agreementVersionStates.agColId,
            agreementVersion: '2',
            statePoints: 2,
            metricPoints: 2,
            totalPoints: 4,
            batches: 1,
        };
        const syncSpy = vi
            .spyOn(influxService, 'syncAgreementVersionStates')
            .mockResolvedValue(syncResult);

        const response = await request(app).post(
            `/api/v1/influx/organizations/organization/scopes/scope-id/agreementCollections/${agreementVersionStates.agColId}/agreementVersions/auditableVersion/states/sync`,
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual(syncResult);
        expect(syncSpy).toHaveBeenCalledWith(
            'organization',
            'scope-id',
            agreementVersionStates.agColId,
            'auditableVersion',
            { updatedFrom: undefined, updatedTo: undefined },
        );
    });

    it('forwards the selected agreement version when creating a dashboard', async () => {
        const dashboardResult = {
            orgName: 'organization',
            scopeId: 'scope-id',
            agColId: agreementVersionStates.agColId,
            agreementVersion: 2,
            agreementTemplateName: 'template',
            grafanaUid: 'uid',
            grafanaUrl: 'http://grafana/d/uid',
            grafanaStatus: 'success',
            grafanaVersion: 1,
            panels: 4,
        };
        const dashboardSpy = vi
            .spyOn(dashboardService, 'createAgreementVersionDashboard')
            .mockResolvedValue(dashboardResult);

        const response = await request(app).post(
            `/api/v1/dashboards/organizations/organization/scopes/scope-id/agreementCollections/${agreementVersionStates.agColId}/agreementVersions/2`,
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual(dashboardResult);
        expect(dashboardSpy).toHaveBeenCalledWith(
            'organization',
            'scope-id',
            agreementVersionStates.agColId,
            '2',
            'label',
        );
    });
});
