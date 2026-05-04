import crypto from 'node:crypto';
import * as registryIntegrations from '../integrations/registry.integration.js';
import * as grafanaIntegration from '../integrations/grafana.integration.js';
import { bootEnv } from '../config/bootConfig.js';

type AgreementSignature = {
    signatureId: string;
    guarantee?: {
        name?: string;
        comparator?: string;
        threshold?: number;
        metrics?: Array<{
            metricName?: string;
        }>;
    };
};

type AuditableAgreementVersion = {
    versionNumber: number;
    contract?: {
        agreementTemplateName?: string;
        signatures?: AgreementSignature[];
    };
};

type DashboardContext = {
    orgName: string;
    elementName: string;
    agreementCollectionName: string;
    agreementVersion: number;
    agreementTemplateName: string;
};

const datasource = {
    type: 'influxdb',
    uid: bootEnv.GRAFANA_DATASOURCE_UID,
};

const GRID_WIDTH = 24;
const SUMMARY_HEIGHT = 5;
const TIMELINE_HEIGHT = 10;
const SIGNATURE_PAIR_HEIGHT = 5;

const buildDashboardUid = (context: DashboardContext) => {
    const hash = crypto
        .createHash('sha1')
        .update(
            [
                context.orgName,
                context.elementName,
                context.agreementCollectionName,
                context.agreementVersion,
            ].join(':'),
        )
        .digest('hex')
        .slice(0, 20);

    return `agv-${hash}-v${context.agreementVersion}`;
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const buildWhereClause = (context: DashboardContext, extra: Record<string, string> = {}) => {
    const filters = {
        organizationName: context.orgName,
        elementName: context.elementName,
        agreementCollectionName: context.agreementCollectionName,
        agreementTemplateName: context.agreementTemplateName,
        agreementVersion: String(context.agreementVersion),
        ...extra,
    };

    return Object.entries(filters)
        .map(([key, value]) => `"${key}" = ${sqlString(value)}`)
        .join('\n  AND ');
};

const buildTarget = (refId: string, query: string, format = 'time_series') => ({
    refId,
    datasource,
    rawSql: query,
    rawQuery: true,
    format,
    resultFormat: format,
});

const getComparator = (signature: AgreementSignature) => signature.guarantee?.comparator ?? '>=';

const getThreshold = (signature: AgreementSignature) => signature.guarantee?.threshold ?? 0;

const buildThresholdSteps = (comparator: string, threshold: number) => {
    const lowerIsBetter = comparator.startsWith('<');

    return [
        { value: null, color: lowerIsBetter ? 'green' : 'red' },
        { value: threshold, color: lowerIsBetter ? 'red' : 'green' },
    ];
};

const groupSignaturesByGuarantee = (signatures: AgreementSignature[]) => {
    const groups = new Map<string, AgreementSignature[]>();

    for (const signature of signatures) {
        const guaranteeName = signature.guarantee?.name ?? String(signature.signatureId);
        const group = groups.get(guaranteeName) ?? [];
        group.push(signature);
        groups.set(guaranteeName, group);
    }

    return Array.from(groups.entries()).map(([guaranteeName, groupSignatures]) => ({
        guaranteeName,
        signatures: groupSignatures,
        comparator: getComparator(groupSignatures[0]),
        threshold: getThreshold(groupSignatures[0]),
    }));
};

const getSignatureSeriesName = (signature: AgreementSignature) => signature.signatureId.slice(-6);

const buildStateQuery = (
    context: DashboardContext,
    guaranteeName: string,
    signatureId: string,
    seriesName: string,
) => {
    const where = buildWhereClause(context, { guaranteeName, signatureId });

    return `SELECT time, "numericExpressionValue" AS ${sqlString(seriesName)}
FROM "states"
WHERE $__timeFilter(time)
  AND ${where}
UNION ALL
SELECT $__timeFrom() AS time, CAST(NULL AS DOUBLE) AS ${sqlString(seriesName)}
UNION ALL
SELECT $__timeTo() AS time, CAST(NULL AS DOUBLE) AS ${sqlString(seriesName)}
ORDER BY time`;
};

const buildCompliancePercentageQuery = (
    context: DashboardContext,
    guaranteeName: string,
    signatureId: string | null,
    useTimeFilter: boolean,
) => {
    const where = buildWhereClause(
        context,
        signatureId ? { guaranteeName, signatureId } : { guaranteeName },
    );
    const timeFilter = useTimeFilter ? '$__timeFilter(time)\n  AND ' : '';

    return `SELECT NOW() AS time,
    CASE
        WHEN COUNT(*) = 0 THEN CAST(NULL AS DOUBLE)
        ELSE 100.0 * SUM(CASE WHEN "compliant" THEN 1 ELSE 0 END) / COUNT(*)
    END AS "value"
FROM "states"
WHERE ${timeFilter}${where}`;
};

const buildRankingQuery = (context: DashboardContext, guaranteeName: string) => {
    return `WITH scored AS (
    SELECT
        "elementName" AS element,
        "agreementCollectionName" AS agreement,
        "agreementVersion" AS version,
        COUNT(*) AS samples,
        100.0 * SUM(CASE WHEN "compliant" THEN 1 ELSE 0 END) / COUNT(*) AS compliance
    FROM "states"
    WHERE $__timeFilter(time)
      AND "organizationName" = ${sqlString(context.orgName)}
      AND "agreementTemplateName" = ${sqlString(context.agreementTemplateName)}
      AND "guaranteeName" = ${sqlString(guaranteeName)}
    GROUP BY "elementName", "agreementCollectionName", "agreementVersion"
    HAVING COUNT(*) > 0
),
ranked AS (
    SELECT
        CAST(
            ROW_NUMBER() OVER (
                ORDER BY compliance DESC, samples DESC, element ASC, agreement ASC, version ASC
            ) AS DOUBLE
        ) AS rank_position,
        element,
        agreement,
        version,
        compliance,
        samples,
        CASE
            WHEN element = ${sqlString(context.elementName)}
             AND agreement = ${sqlString(context.agreementCollectionName)}
             AND version = ${sqlString(String(context.agreementVersion))}
            THEN 'current'
            ELSE ''
        END AS current_agreement
    FROM scored
)
SELECT
    rank_position AS "Rank",
    element AS "Element",
    agreement AS "Agreement",
    version AS "Version",
    compliance AS "Compliance"
FROM ranked
WHERE rank_position <= 10 OR current_agreement = 'current'
ORDER BY rank_position ASC`;
};

const buildRowPanel = (id: number, title: string, y: number) => ({
    id,
    title,
    type: 'row',
    gridPos: { x: 0, y, w: GRID_WIDTH, h: 1 },
    collapsed: false,
    panels: [],
});

const buildGaugePanel = (
    id: number,
    title: string,
    x: number,
    y: number,
    w: number,
    h: number,
    query: string,
) => ({
    id,
    title,
    type: 'gauge',
    datasource,
    gridPos: { x, y, w, h },
    targets: [buildTarget('A', query, 'table')],
    options: {
        orientation: 'auto',
        showThresholdLabels: false,
        showThresholdMarkers: true,
        text: {
            titleSize: 12,
            valueSize: 30,
        },
    },
    fieldConfig: {
        defaults: {
            min: 0,
            max: 100,
            noValue: 'N/A',
            unit: 'percent',
            color: { mode: 'thresholds' },
            thresholds: {
                mode: 'absolute',
                steps: [
                    { value: null, color: 'red' },
                    { value: 50, color: 'yellow' },
                    { value: 80, color: 'green' },
                ],
            },
        },
        overrides: [],
    },
});

const buildRankingPanel = (
    id: number,
    title: string,
    x: number,
    y: number,
    w: number,
    h: number,
    context: DashboardContext,
    guaranteeName: string,
) => ({
    id,
    title,
    type: 'table',
    datasource,
    gridPos: { x, y, w, h },
    targets: [buildTarget('A', buildRankingQuery(context, guaranteeName), 'table')],
    options: {
        showHeader: true,
        cellHeight: 'sm',
        footer: {
            show: false,
            reducer: ['sum'],
            countRows: false,
            fields: '',
        },
    },
    fieldConfig: {
        defaults: {
            custom: {
                align: 'auto',
                cellOptions: {
                    type: 'auto',
                },
                inspect: false,
            },
        },
        overrides: [
            {
                matcher: { id: 'byName', options: 'Rank' },
                properties: [
                    { id: 'custom.width', value: 70 },
                    { id: 'custom.align', value: 'center' },
                    { id: 'decimals', value: 0 },
                ],
            },
            {
                matcher: { id: 'byName', options: 'Element' },
                properties: [{ id: 'custom.width', value: 120 }],
            },
            {
                matcher: { id: 'byName', options: 'Agreement' },
                properties: [{ id: 'custom.cellOptions', value: { type: 'auto' } }],
            },
            {
                matcher: { id: 'byName', options: 'Version' },
                properties: [
                    { id: 'custom.width', value: 80 },
                    { id: 'custom.align', value: 'center' },
                ],
            },
            {
                matcher: { id: 'byName', options: 'Compliance' },
                properties: [
                    { id: 'unit', value: 'percent' },
                    { id: 'decimals', value: 1 },
                    { id: 'min', value: 0 },
                    { id: 'max', value: 100 },
                    {
                        id: 'thresholds',
                        value: {
                            mode: 'absolute',
                            steps: [
                                { value: null, color: 'red' },
                                { value: 50, color: 'yellow' },
                                { value: 80, color: 'green' },
                            ],
                        },
                    },
                    {
                        id: 'custom.cellOptions',
                        value: {
                            type: 'gauge',
                            mode: 'basic',
                        },
                    },
                ],
            },
        ],
    },
});

const buildPanel = (
    id: number,
    title: string,
    type: string,
    x: number,
    y: number,
    w: number,
    h: number,
    targets: Array<Record<string, unknown>>,
) => ({
    id,
    title,
    type,
    datasource,
    gridPos: { x, y, w, h },
    targets,
    options: {
        legend: { displayMode: 'list', placement: 'bottom' },
        tooltip: { mode: 'multi', sort: 'none' },
    },
});

const buildStatePanel = (
    id: number,
    title: string,
    x: number,
    y: number,
    w: number,
    h: number,
    context: DashboardContext,
    guaranteeName: string,
    signatures: AgreementSignature[],
    comparator: string,
    threshold: number,
) => ({
    ...buildPanel(
        id,
        title,
        'timeseries',
        x,
        y,
        w,
        h,
        signatures.map((signature, index) =>
            buildTarget(
                `S${index + 1}`,
                buildStateQuery(
                    context,
                    guaranteeName,
                    signature.signatureId,
                    getSignatureSeriesName(signature),
                ),
            ),
        ),
    ),
    fieldConfig: {
        defaults: {
            thresholds: {
                mode: 'absolute',
                steps: buildThresholdSteps(comparator, threshold),
            },
            custom: {
                axisPlacement: 'auto',
                axisSoftMin: 0,
                axisSoftMax: 100,
                thresholdsStyle: {
                    mode: 'area',
                },
            },
        },
        overrides: [],
    },
});

const getSignatureLabel = (signature: AgreementSignature, index: number) => {
    return `Signature ${index + 1}: ${signature.signatureId.slice(-6)}`;
};

const getSignatureGridPosition = (index: number, y: number) => ({
    x: (index % 2) * 12,
    y: y + Math.floor(index / 2) * SIGNATURE_PAIR_HEIGHT,
});

const buildDashboard = (
    context: DashboardContext,
    signatures: AgreementSignature[],
    grafanaUid: string,
) => {
    let panelId = 1;
    let y = 0;
    const panels: Array<Record<string, unknown>> = [];
    const guarantees = groupSignaturesByGuarantee(signatures);

    for (const guarantee of guarantees) {
        panels.push(buildRowPanel(panelId++, guarantee.guaranteeName, y));
        y += 1;

        panels.push(
            buildGaugePanel(
                panelId++,
                'All time compliance',
                0,
                y,
                6,
                SUMMARY_HEIGHT,
                buildCompliancePercentageQuery(context, guarantee.guaranteeName, null, false),
            ),
            buildGaugePanel(
                panelId++,
                'Period compliance',
                6,
                y,
                6,
                SUMMARY_HEIGHT,
                buildCompliancePercentageQuery(context, guarantee.guaranteeName, null, true),
            ),
            buildRankingPanel(
                panelId++,
                'Compliance ranking',
                12,
                y,
                12,
                SUMMARY_HEIGHT,
                context,
                guarantee.guaranteeName,
            ),
        );

        y += SUMMARY_HEIGHT;

        panels.push(
            buildStatePanel(
                panelId++,
                `${guarantee.guaranteeName} ${guarantee.comparator} ${guarantee.threshold}`,
                0,
                y,
                GRID_WIDTH,
                TIMELINE_HEIGHT,
                context,
                guarantee.guaranteeName,
                guarantee.signatures,
                guarantee.comparator,
                guarantee.threshold,
            ),
        );

        y += TIMELINE_HEIGHT;

        for (const [index, signature] of guarantee.signatures.entries()) {
            const signatureLabel = getSignatureLabel(signature, index);
            const position = getSignatureGridPosition(index, y);

            panels.push(
                buildGaugePanel(
                    panelId++,
                    `${signatureLabel} (All time)`,
                    position.x,
                    position.y,
                    6,
                    SIGNATURE_PAIR_HEIGHT,
                    buildCompliancePercentageQuery(
                        context,
                        guarantee.guaranteeName,
                        signature.signatureId,
                        false,
                    ),
                ),
                buildGaugePanel(
                    panelId++,
                    `${signatureLabel} (Period)`,
                    position.x + 6,
                    position.y,
                    6,
                    SIGNATURE_PAIR_HEIGHT,
                    buildCompliancePercentageQuery(
                        context,
                        guarantee.guaranteeName,
                        signature.signatureId,
                        true,
                    ),
                ),
            );
        }

        y += Math.ceil(guarantee.signatures.length / 2) * SIGNATURE_PAIR_HEIGHT;
        y += 1;
    }

    return {
        uid: grafanaUid,
        title: `${context.orgName} / ${context.elementName} / ${context.agreementCollectionName} v${context.agreementVersion}`,
        tags: [
            'governify',
            'auditable-version',
            `org:${context.orgName}`,
            `template:${context.agreementTemplateName}`,
        ],
        timezone: 'browser',
        schemaVersion: 39,
        version: 0,
        refresh: '30s',
        time: {
            from: 'now-1y',
            to: 'now',
        },
        panels,
    };
};

export const createAuditableAgreementVersionDashboard = async (
    orgName: string,
    elementName: string,
    agColName: string,
) => {
    const auditableVersion = (await registryIntegrations.getAuditableAgreementVersion(
        orgName,
        elementName,
        agColName,
    )) as AuditableAgreementVersion;

    const context: DashboardContext = {
        orgName,
        elementName,
        agreementCollectionName: agColName,
        agreementVersion: auditableVersion.versionNumber,
        agreementTemplateName:
            auditableVersion.contract?.agreementTemplateName ?? 'unknown-template',
    };

    const signatures = auditableVersion.contract?.signatures ?? [];
    const grafanaUid = buildDashboardUid(context);
    const dashboard = buildDashboard(context, signatures, grafanaUid);

    await grafanaIntegration.ensureInfluxDataSource();
    await grafanaIntegration.ensureFolder();
    const savedDashboard = await grafanaIntegration.saveDashboard(dashboard);

    const grafanaUrl = `${bootEnv.GRAFANA_PUBLIC_URL.replace(/\/+$/, '')}/d/${savedDashboard.uid}`;

    return {
        ...context,
        grafanaUid: savedDashboard.uid,
        grafanaUrl,
        grafanaStatus: savedDashboard.status,
        grafanaVersion: savedDashboard.version,
        panels: Array.isArray(dashboard.panels) ? dashboard.panels.length : 0,
    };
};
