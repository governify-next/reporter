import crypto from 'node:crypto';
import * as registryIntegrations from '../integrations/registry.integration.js';
import * as grafanaIntegration from '../integrations/grafana.integration.js';
import { bootEnv } from '../config/bootConfig.js';
import type { AgreementSignature, AgreementVersion } from '../types/registry.types.js';

type DashboardContext = {
    orgName: string;
    scopeId: string;
    agColId: string;
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
const GUARANTEE_INFO_HEIGHT = 5;
const SIGNATURE_COMPARISON_MIN_HEIGHT = 6;
const THRESHOLD_REF_ID = 'T';
const THRESHOLD_BACKGROUND_FIELD_NAME = 'Threshold background';
const THRESHOLD_LINE_FIELD_NAME = 'Threshold';
const SHOW_EVOLUTIVE_POINTS_VARIABLE = 'showEvolutivePoints';
const SHOW_EVOLUTIVE_POINTS_INTERPOLATION = '${showEvolutivePoints:raw}';
const DEFAULT_GRAFANA_QUICK_RANGES = [
    { from: 'now-5m', to: 'now', display: 'Last 5 minutes' },
    { from: 'now-15m', to: 'now', display: 'Last 15 minutes' },
    { from: 'now-30m', to: 'now', display: 'Last 30 minutes' },
    { from: 'now-1h', to: 'now', display: 'Last 1 hour' },
    { from: 'now-3h', to: 'now', display: 'Last 3 hours' },
    { from: 'now-6h', to: 'now', display: 'Last 6 hours' },
    { from: 'now-12h', to: 'now', display: 'Last 12 hours' },
    { from: 'now-24h', to: 'now', display: 'Last 24 hours' },
    { from: 'now-2d', to: 'now', display: 'Last 2 days' },
    { from: 'now-7d', to: 'now', display: 'Last 7 days' },
    { from: 'now-30d', to: 'now', display: 'Last 30 days' },
    { from: 'now-90d', to: 'now', display: 'Last 90 days' },
    { from: 'now-6M', to: 'now', display: 'Last 6 months' },
    { from: 'now-1y', to: 'now', display: 'Last 1 year' },
    { from: 'now-2y', to: 'now', display: 'Last 2 years' },
    { from: 'now-5y', to: 'now', display: 'Last 5 years' },
    { from: 'now-1d/d', to: 'now-1d/d', display: 'Yesterday' },
    { from: 'now-2d/d', to: 'now-2d/d', display: 'Day before yesterday' },
    { from: 'now-7d/d', to: 'now-7d/d', display: 'This day last week' },
    { from: 'now-1w/w', to: 'now-1w/w', display: 'Previous week' },
    { from: 'now-1M/M', to: 'now-1M/M', display: 'Previous month' },
    { from: 'now-1Q/fQ', to: 'now-1Q/fQ', display: 'Previous fiscal quarter' },
    { from: 'now-1y/y', to: 'now-1y/y', display: 'Previous year' },
    { from: 'now-1y/fy', to: 'now-1y/fy', display: 'Previous fiscal year' },
    { from: 'now/d', to: 'now/d', display: 'Today' },
    { from: 'now/d', to: 'now', display: 'Today so far' },
    { from: 'now/w', to: 'now/w', display: 'This week' },
    { from: 'now/w', to: 'now', display: 'This week so far' },
    { from: 'now/M', to: 'now/M', display: 'This month' },
    { from: 'now/M', to: 'now', display: 'This month so far' },
    { from: 'now/y', to: 'now/y', display: 'This year' },
    { from: 'now/y', to: 'now', display: 'This year so far' },
    { from: 'now/fQ', to: 'now', display: 'This fiscal quarter so far' },
    { from: 'now/fQ', to: 'now/fQ', display: 'This fiscal quarter' },
    { from: 'now/fy', to: 'now', display: 'This fiscal year so far' },
    { from: 'now/fy', to: 'now/fy', display: 'This fiscal year' },
];

const toEpochMilliseconds = (date: string, fieldName: string) => {
    const time = new Date(date).getTime();
    if (!Number.isFinite(time)) {
        throw new Error(`Agreement validity ${fieldName} must be a valid date`);
    }
    return time;
};

const buildValidityQuickRange = (validity: AgreementVersion['contract']['validity']) => {
    const validityEnd = validity.earlyTermination ?? validity.end;
    toEpochMilliseconds(validity.initial, 'initial');
    toEpochMilliseconds(validityEnd, 'end');

    return {
        display: 'Agreement validity',
        from: validity.initial,
        to: validityEnd,
    };
};

const buildDashboardUid = (context: DashboardContext) => {
    const hash = crypto
        .createHash('sha1')
        .update(
            [context.orgName, context.scopeId, context.agColId, context.agreementVersion].join(':'),
        )
        .digest('hex')
        .slice(0, 20);

    return `agv-${hash}-v${context.agreementVersion}`;
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const buildWhereClause = (context: DashboardContext, extra: Record<string, string> = {}) => {
    const filters = {
        organizationName: context.orgName,
        scopeId: context.scopeId,
        agColId: context.agColId,
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

const getThresholdLineColor = (comparator: string) => {
    const normalizedComparator = comparator.trim();
    return normalizedComparator.includes('=') && normalizedComparator !== '!=' ? 'green' : 'red';
};

const buildThresholdSteps = (comparator: string, threshold: number) => {
    const lowerIsBetter = comparator.startsWith('<');

    return [
        { value: null, color: lowerIsBetter ? 'green' : 'red' },
        { value: threshold, color: lowerIsBetter ? 'red' : 'green' },
    ];
};

const buildThresholdGuideQuery = (threshold: number) => {
    if (!Number.isFinite(threshold)) {
        throw new Error('Guarantee threshold must be a finite number');
    }

    return `SELECT
    $__timeFrom() AS time,
    CAST(NULL AS DOUBLE) AS "${THRESHOLD_BACKGROUND_FIELD_NAME}",
    CAST(${threshold} AS DOUBLE) AS "${THRESHOLD_LINE_FIELD_NAME}"
UNION ALL
SELECT
    $__timeTo() AS time,
    CAST(NULL AS DOUBLE) AS "${THRESHOLD_BACKGROUND_FIELD_NAME}",
    CAST(${threshold} AS DOUBLE) AS "${THRESHOLD_LINE_FIELD_NAME}"
ORDER BY time`;
};

const buildThresholdBackgroundOverride = (comparator: string, threshold: number) => {
    if (!Number.isFinite(threshold)) {
        throw new Error('Guarantee threshold must be a finite number');
    }

    return {
        matcher: { id: 'byName', options: THRESHOLD_BACKGROUND_FIELD_NAME },
        properties: [
            {
                id: 'thresholds',
                value: {
                    mode: 'absolute',
                    steps: buildThresholdSteps(comparator, threshold),
                },
            },
            { id: 'custom.thresholdsStyle', value: { mode: 'area' } },
            { id: 'custom.drawStyle', value: 'line' },
            { id: 'custom.lineWidth', value: 0 },
            { id: 'custom.fillOpacity', value: 0 },
            { id: 'custom.showPoints', value: 'never' },
            {
                id: 'custom.hideFrom',
                value: { legend: true, tooltip: true, viz: false },
            },
        ],
    };
};

const buildThresholdLineOverride = (comparator: string) => ({
    matcher: { id: 'byName', options: THRESHOLD_LINE_FIELD_NAME },
    properties: [
        {
            id: 'color',
            value: { mode: 'fixed', fixedColor: getThresholdLineColor(comparator) },
        },
        { id: 'custom.thresholdsStyle', value: { mode: 'off' } },
        { id: 'custom.drawStyle', value: 'line' },
        { id: 'custom.lineInterpolation', value: 'linear' },
        { id: 'custom.lineWidth', value: 1 },
        { id: 'custom.fillOpacity', value: 0 },
        { id: 'custom.gradientMode', value: 'none' },
        { id: 'custom.showPoints', value: 'never' },
        {
            id: 'custom.hideFrom',
            value: { legend: true, tooltip: true, viz: false },
        },
    ],
});

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
        info: groupSignatures[0].guarantee.info,
        definition: groupSignatures[0].guarantee,
        signatures: groupSignatures,
        comparator: getComparator(groupSignatures[0]),
        threshold: getThreshold(groupSignatures[0]),
    }));
};

const getSignatureSeriesName = (signature: AgreementSignature) => signature.signatureId.slice(-6);

const buildTimelinePointSeries = (seriesName: string) =>
    [
        {
            name: `${seriesName} · Consolidated · Compliant`,
            consolidated: true,
            complianceCondition: `"complianceStatus" = 'COMPLIANT'`,
            pointSize: 6,
        },
        {
            name: `${seriesName} · Consolidated · Non-compliant`,
            consolidated: true,
            complianceCondition: `"complianceStatus" = 'NON_COMPLIANT'`,
            pointSize: 6,
        },
        {
            name: `${seriesName} · Consolidated · Indeterminate`,
            consolidated: true,
            complianceCondition: `"complianceStatus" NOT IN ('COMPLIANT', 'NON_COMPLIANT')`,
            pointSize: 6,
        },
        {
            name: `${seriesName} · Evolutive · Compliant`,
            consolidated: false,
            complianceCondition: `"complianceStatus" = 'COMPLIANT'`,
            pointSize: 3,
        },
        {
            name: `${seriesName} · Evolutive · Non-compliant`,
            consolidated: false,
            complianceCondition: `"complianceStatus" = 'NON_COMPLIANT'`,
            pointSize: 3,
        },
        {
            name: `${seriesName} · Evolutive · Indeterminate`,
            consolidated: false,
            complianceCondition: `"complianceStatus" NOT IN ('COMPLIANT', 'NON_COMPLIANT')`,
            pointSize: 3,
        },
    ] as const;

const toHexColor = (hue: number, saturation: number, lightness: number) => {
    const normalizedSaturation = saturation / 100;
    const normalizedLightness = lightness / 100;
    const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
    const hueSegment = hue / 60;
    const intermediate = chroma * (1 - Math.abs((hueSegment % 2) - 1));
    const [red, green, blue] =
        hueSegment < 1
            ? [chroma, intermediate, 0]
            : hueSegment < 2
              ? [intermediate, chroma, 0]
              : hueSegment < 3
                ? [0, chroma, intermediate]
                : hueSegment < 4
                  ? [0, intermediate, chroma]
                  : hueSegment < 5
                    ? [intermediate, 0, chroma]
                    : [chroma, 0, intermediate];
    const match = normalizedLightness - chroma / 2;

    return `#${[red, green, blue]
        .map((channel) =>
            Math.round((channel + match) * 255)
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;
};

const getSignatureColor = (signatureId: string) => {
    const digest = crypto.createHash('sha1').update(signatureId).digest();
    const hue = (digest.readUInt32BE(0) / 0xffffffff) * 360;
    const saturation = 62 + (digest[4] % 17);
    const lightness = 42 + (digest[5] % 15);
    return toHexColor(hue, saturation, lightness);
};

const buildStateQuery = (
    context: DashboardContext,
    guaranteeName: string,
    signatureId: string,
    seriesName: string,
) => {
    const where = buildWhereClause(context, { guaranteeName, signatureId });
    const pointSeries = buildTimelinePointSeries(seriesName);
    const pointColumns = pointSeries
        .map(
            ({ name, consolidated, complianceCondition }) => `    CASE
        WHEN "consolidated" = ${consolidated ? 'TRUE' : 'FALSE'}
         AND ${complianceCondition}
        THEN "numericExpressionValue"
        ELSE CAST(NULL AS DOUBLE)
    END AS ${sqlString(name)}`,
        )
        .join(',\n');
    const nullPointColumns = pointSeries
        .map(({ name }) => `    CAST(NULL AS DOUBLE) AS ${sqlString(name)}`)
        .join(',\n');

    return `SELECT
    time,
    "numericExpressionValue" AS ${sqlString(seriesName)},
${pointColumns}
FROM "states"
WHERE $__timeFilter(time)
  AND "numericExpressionValueAvailable" = TRUE
  AND (
      "consolidated" = TRUE
      OR '${SHOW_EVOLUTIVE_POINTS_INTERPOLATION}' = 'true'
  )
  AND ${where}
UNION ALL
SELECT
    $__timeFrom() AS time,
    CAST(NULL AS DOUBLE) AS ${sqlString(seriesName)},
${nullPointColumns}
UNION ALL
SELECT
    $__timeTo() AS time,
    CAST(NULL AS DOUBLE) AS ${sqlString(seriesName)},
${nullPointColumns}
ORDER BY time`;
};

const buildPointSeriesOverride = (seriesName: string, color: string, pointSize: number) => ({
    matcher: { id: 'byName', options: seriesName },
    properties: [
        { id: 'color', value: { mode: 'fixed', fixedColor: color } },
        { id: 'custom.drawStyle', value: 'points' },
        { id: 'custom.lineWidth', value: 0 },
        { id: 'custom.showPoints', value: 'always' },
        { id: 'custom.pointSize', value: pointSize },
        {
            id: 'custom.hideFrom',
            value: { legend: true, tooltip: true, viz: false },
        },
    ],
});

const buildSignatureTimelineOverrides = (signature: AgreementSignature) => {
    const seriesName = getSignatureSeriesName(signature);
    const color = getSignatureColor(signature.signatureId);

    return [
        {
            matcher: { id: 'byName', options: seriesName },
            properties: [
                { id: 'color', value: { mode: 'fixed', fixedColor: color } },
                { id: 'custom.drawStyle', value: 'line' },
                { id: 'custom.lineWidth', value: 1 },
                { id: 'custom.showPoints', value: 'never' },
            ],
        },
        ...buildTimelinePointSeries(seriesName).map(({ name, pointSize }) =>
            buildPointSeriesOverride(name, color, pointSize),
        ),
    ];
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
        ELSE 100.0 * SUM(CASE WHEN "complianceStatus" = 'COMPLIANT' THEN 1 ELSE 0 END) / COUNT(*)
    END AS "value"
FROM "states"
WHERE ${timeFilter}${where}
  AND "consolidated" = TRUE
  AND "complianceStatus" IN ('COMPLIANT', 'NON_COMPLIANT')`;
};

const buildSignatureLabelExpression = (signatures: AgreementSignature[]) => {
    const cases = signatures.map(
        (signature, index) =>
            `WHEN ${sqlString(signature.signatureId)} THEN ${sqlString(getSignatureLabel(signature, index))}`,
    );

    return `CASE "signatureId"
        ${cases.join('\n        ')}
        ELSE "signatureId"
    END`;
};

const buildSignatureOrderExpression = (signatures: AgreementSignature[]) => {
    const cases = signatures.map(
        (signature, index) => `WHEN ${sqlString(signature.signatureId)} THEN ${index + 1}`,
    );

    return `CASE "signatureId"
        ${cases.join('\n        ')}
        ELSE ${signatures.length + 1}
    END`;
};

const buildSignatureComplianceComparisonQuery = (
    context: DashboardContext,
    guaranteeName: string,
    signatures: AgreementSignature[],
) => {
    const where = buildWhereClause(context, { guaranteeName });
    const labelExpression = buildSignatureLabelExpression(signatures);
    const orderExpression = buildSignatureOrderExpression(signatures);

    return `SELECT
    ${labelExpression} AS "Signature",
    100.0 * SUM(CASE WHEN "complianceStatus" = 'COMPLIANT' THEN 1 ELSE 0 END) / COUNT(*) AS "All time",
    CASE
        WHEN SUM(CASE WHEN $__timeFilter(time) THEN 1 ELSE 0 END) = 0 THEN CAST(NULL AS DOUBLE)
        ELSE 100.0 * SUM(
            CASE
                WHEN $__timeFilter(time) AND "complianceStatus" = 'COMPLIANT' THEN 1
                ELSE 0
            END
        ) / SUM(CASE WHEN $__timeFilter(time) THEN 1 ELSE 0 END)
    END AS "Selected period"
FROM "states"
WHERE ${where}
  AND "consolidated" = TRUE
  AND "complianceStatus" IN ('COMPLIANT', 'NON_COMPLIANT')
GROUP BY "signatureId"
ORDER BY ${orderExpression} ASC`;
};

const buildRankingQuery = (context: DashboardContext, guaranteeName: string) => {
    return `WITH scored AS (
    SELECT
        "scopeId" AS scope,
        "agColId" AS agreement_collection,
        "agreementVersion" AS version,
        COUNT(*) AS samples,
        100.0 * SUM(CASE WHEN "complianceStatus" = 'COMPLIANT' THEN 1 ELSE 0 END) / COUNT(*) AS compliance
    FROM "states"
    WHERE $__timeFilter(time)
      AND "organizationName" = ${sqlString(context.orgName)}
      AND "agreementTemplateName" = ${sqlString(context.agreementTemplateName)}
      AND "guaranteeName" = ${sqlString(guaranteeName)}
      AND "consolidated" = TRUE
      AND "complianceStatus" IN ('COMPLIANT', 'NON_COMPLIANT')
    GROUP BY "scopeId", "agColId", "agreementVersion"
    HAVING COUNT(*) > 0
),
ranked AS (
    SELECT
        CAST(
            ROW_NUMBER() OVER (
                ORDER BY compliance DESC, samples DESC, scope ASC, agreement_collection ASC, version ASC
            ) AS DOUBLE
        ) AS rank_position,
        scope,
        agreement_collection,
        version,
        compliance,
        samples,
        CASE
            WHEN scope = ${sqlString(context.scopeId)}
             AND agreement_collection = ${sqlString(context.agColId)}
             AND version = ${sqlString(String(context.agreementVersion))}
            THEN 'current'
            ELSE ''
        END AS current_agreement
    FROM scored
)
SELECT
    rank_position AS "Rank",
    scope AS "Scope",
    agreement_collection AS "Agreement collection",
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

const buildGuaranteeInfoPanel = (
    id: number,
    y: number,
    guarantee: AgreementSignature['guarantee'],
) => {
    const windowPeriod = guarantee.window.period
        .map(({ value, unit }) => `${value} ${unit}`)
        .join(', ');
    const metricNames = guarantee.metrics.map(({ metricName }) => `\`${metricName}\``).join(', ');
    const condition = `${guarantee.numericExpression} ${guarantee.comparator} ${guarantee.threshold}`;

    return {
        id,
        title: '',
        type: 'text',
        gridPos: { x: 0, y, w: GRID_WIDTH, h: GUARANTEE_INFO_HEIGHT },
        options: {
            mode: 'markdown',
            content: [
                `**Description:** ${guarantee.info.description}`,
                `**Example:** ${guarantee.info.example}`,
                `---`,
                `**Condition:** \`${condition}\``,
                `**Window:** ${windowPeriod} · **Anchor date:** \`${guarantee.window.anchorDate}\``,
                `---`,
                `**Metrics:** ${metricNames}`,
                `**Formula:** \`${guarantee.numericExpression}\``,
                `**Comparator:** \`${guarantee.comparator}\` · **Threshold:** \`${guarantee.threshold}\``,
            ].join('\n\n'),
        },
    };
};

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

const getSignatureComparisonPanelHeight = (signatureCount: number) =>
    Math.max(SIGNATURE_COMPARISON_MIN_HEIGHT, Math.ceil(signatureCount * 0.75) + 2);

const buildSignatureComplianceComparisonPanel = (
    id: number,
    y: number,
    context: DashboardContext,
    guaranteeName: string,
    signatures: AgreementSignature[],
) => ({
    id,
    title: 'Signature compliance',
    type: 'barchart',
    datasource,
    gridPos: {
        x: 0,
        y,
        w: GRID_WIDTH,
        h: getSignatureComparisonPanelHeight(signatures.length),
    },
    targets: [
        buildTarget(
            'A',
            buildSignatureComplianceComparisonQuery(context, guaranteeName, signatures),
            'table',
        ),
    ],
    options: {
        orientation: 'horizontal',
        xField: 'Signature',
        stacking: 'none',
        groupWidth: 0.7,
        barWidth: 0.8,
        barRadius: 0,
        fullHighlight: false,
        showValue: 'never',
        legend: {
            showLegend: true,
            displayMode: 'list',
            placement: 'bottom',
            calcs: [],
        },
        tooltip: {
            mode: 'multi',
            sort: 'none',
        },
    },
    fieldConfig: {
        defaults: {
            unit: 'percent',
            min: 0,
            decimals: 1,
            color: { mode: 'palette-classic-by-name' },
            custom: {
                axisPlacement: 'auto',
                axisSoftMin: 0,
                axisSoftMax: 104,
                fillOpacity: 80,
                gradientMode: 'none',
                lineWidth: 1,
                hideFrom: { legend: false, tooltip: false, viz: false },
                thresholdsStyle: { mode: 'off' },
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
                matcher: { id: 'byName', options: 'Scope' },
                properties: [{ id: 'custom.width', value: 120 }],
            },
            {
                matcher: { id: 'byName', options: 'Agreement collection' },
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
    ...buildPanel(id, title, 'timeseries', x, y, w, h, [
        buildTarget(THRESHOLD_REF_ID, buildThresholdGuideQuery(threshold)),
        ...signatures.map((signature, index) =>
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
    ]),
    fieldConfig: {
        defaults: {
            color: { mode: 'palette-classic-by-name' },
            decimals: 0,
            custom: {
                axisPlacement: 'auto',
                axisSoftMin: 0,
                thresholdsStyle: {
                    mode: 'off',
                },
            },
        },
        overrides: [
            buildThresholdBackgroundOverride(comparator, threshold),
            buildThresholdLineOverride(comparator),
            ...signatures.flatMap((signature) => buildSignatureTimelineOverrides(signature)),
        ],
    },
});

const getSignatureLabel = (signature: AgreementSignature, index: number) => {
    return `Signature ${index + 1}: ${signature.signatureId.slice(-6)}`;
};

const buildDashboard = (
    context: DashboardContext,
    signatures: AgreementSignature[],
    grafanaUid: string,
    validity: AgreementVersion['contract']['validity'],
) => {
    let panelId = 1;
    let y = 0;
    const panels: Array<Record<string, unknown>> = [];
    const guarantees = groupSignaturesByGuarantee(signatures);

    for (const guarantee of guarantees) {
        panels.push(buildRowPanel(panelId++, guarantee.info.title, y));
        y += 1;

        panels.push(buildGuaranteeInfoPanel(panelId++, y, guarantee.definition));
        y += GUARANTEE_INFO_HEIGHT;

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
                'Selected period compliance',
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
                `Timeline - ${guarantee.info.title} ${guarantee.comparator} ${guarantee.threshold}`,
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

        if (guarantee.signatures.length > 1) {
            const signatureComparisonPanel = buildSignatureComplianceComparisonPanel(
                panelId++,
                y,
                context,
                guarantee.guaranteeName,
                guarantee.signatures,
            );
            panels.push(signatureComparisonPanel);
            y += signatureComparisonPanel.gridPos.h;
        }

        y += 1;
    }

    return {
        uid: grafanaUid,
        title: `${context.orgName} / ${context.scopeId} / ${context.agColId} v${context.agreementVersion}`,
        tags: [
            'governify',
            'agreement-version',
            `org:${context.orgName}`,
            `scope:${context.scopeId}`,
            `agreementCollection:${context.agColId}`,
            `template:${context.agreementTemplateName}`,
        ],
        timezone: 'browser',
        schemaVersion: 39,
        refresh: '30s',
        links: [],
        annotations: {
            list: [
                {
                    builtIn: 1,
                    datasource: { type: 'grafana', uid: '-- Grafana --' },
                    enable: true,
                    hide: true,
                    iconColor: 'rgb(0, 0, 0)',
                    name: 'Agreement validity',
                    type: 'dashboard',
                },
            ],
        },
        templating: {
            list: [
                {
                    current: {
                        selected: true,
                        text: 'true',
                        value: 'true',
                    },
                    description:
                        'Show or hide evolutive timeline points. Consolidated points are always visible.',
                    hide: 0,
                    label: 'Evolutive points',
                    name: SHOW_EVOLUTIVE_POINTS_VARIABLE,
                    options: [
                        { selected: true, text: 'true', value: 'true' },
                        { selected: false, text: 'false', value: 'false' },
                    ],
                    query: '',
                    skipUrlSync: false,
                    type: 'switch',
                },
            ],
        },
        time: {
            from: validity.initial,
            to: validity.earlyTermination ?? validity.end,
        },
        timepicker: {
            quick_ranges: [buildValidityQuickRange(validity), ...DEFAULT_GRAFANA_QUICK_RANGES],
        },
        panels,
    };
};

export const createAgreementVersionDashboard = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    agreementVersion: string,
) => {
    const selectedAgreementVersion = await registryIntegrations.getAgreementVersion(
        orgName,
        scopeId,
        agColId,
        agreementVersion,
    );

    const context: DashboardContext = {
        orgName,
        scopeId,
        agColId,
        agreementVersion: selectedAgreementVersion.versionNumber,
        agreementTemplateName: selectedAgreementVersion.contract.agreementTemplateName,
    };

    const signatures = selectedAgreementVersion.contract.signatures;
    const grafanaUid = buildDashboardUid(context);
    const dashboard = buildDashboard(
        context,
        signatures,
        grafanaUid,
        selectedAgreementVersion.contract.validity,
    );

    await grafanaIntegration.ensureInfluxDataSource();
    await grafanaIntegration.ensureFolder();
    const savedDashboard = await grafanaIntegration.saveDashboard(dashboard);
    const effectiveValidityEnd =
        selectedAgreementVersion.contract.validity.earlyTermination ??
        selectedAgreementVersion.contract.validity.end;
    const validityStartTime = toEpochMilliseconds(
        selectedAgreementVersion.contract.validity.initial,
        'initial',
    );
    const validityEndTime = toEpochMilliseconds(effectiveValidityEnd, 'end');
    const timelinePanelIds = dashboard.panels.flatMap((panel) =>
        panel.type === 'timeseries' && typeof panel.id === 'number' ? [panel.id] : [],
    );

    await grafanaIntegration.syncAgreementValidityAnnotations(
        savedDashboard.uid,
        timelinePanelIds.flatMap((panelId) => [
            { panelId, boundary: 'start', time: validityStartTime },
            { panelId, boundary: 'end', time: validityEndTime },
        ]),
    );

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
