import { queryInfluxRows } from '../db/influx.js';

// PoC: data for the ECharts dashboard embedded in the frontend.

type PointRow = {
    time: string;
    guaranteeName: string;
    signatureId: string;
    stateId: string;
    numericExpressionValue: number;
    complianceStatus: string;
    consolidated: boolean;
};

type CountRow = {
    guaranteeName: string;
    signatureId: string;
    total: number;
    compliant: number;
    totalInRange: number;
    compliantInRange: number;
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const percentage = (compliant: number, total: number) =>
    total === 0 ? null : (100 * compliant) / total;

const sum = (rows: CountRow[], key: keyof Omit<CountRow, 'guaranteeName' | 'signatureId'>) =>
    rows.reduce((acc, row) => acc + Number(row[key]), 0);

export const getAgreementVersionDashboardData = async (
    orgName: string,
    scopeId: string,
    agColId: string,
    agreementVersion: string,
    from: Date,
    to: Date,
) => {
    const where = `"organizationName" = ${sqlString(orgName)}
  AND "scopeId" = ${sqlString(scopeId)}
  AND "agColId" = ${sqlString(agColId)}
  AND "agreementVersion" = ${sqlString(agreementVersion)}`;
    const inRange = `time >= '${from.toISOString()}' AND time < '${to.toISOString()}'`;

    const [points, counts] = await Promise.all([
        queryInfluxRows<PointRow>(`SELECT time, "guaranteeName", "signatureId", "stateId",
    "numericExpressionValue", "complianceStatus", "consolidated"
FROM "states"
WHERE ${where}
  AND ${inRange}
  AND "numericExpressionValueAvailable" = TRUE
ORDER BY time`),
        queryInfluxRows<CountRow>(`SELECT "guaranteeName", "signatureId",
    COUNT(*) AS "total",
    SUM(CASE WHEN "complianceStatus" = 'COMPLIANT' THEN 1 ELSE 0 END) AS "compliant",
    SUM(CASE WHEN ${inRange} THEN 1 ELSE 0 END) AS "totalInRange",
    SUM(CASE WHEN ${inRange} AND "complianceStatus" = 'COMPLIANT' THEN 1 ELSE 0 END) AS "compliantInRange"
FROM "states"
WHERE ${where}
  AND "consolidated" = TRUE
  AND "complianceStatus" IN ('COMPLIANT', 'NON_COMPLIANT')
GROUP BY "guaranteeName", "signatureId"`),
    ]);

    const guaranteeNames = new Set([...points, ...counts].map((row) => row.guaranteeName));

    return Object.fromEntries(
        [...guaranteeNames].map((guaranteeName) => {
            const guaranteeCounts = counts.filter((row) => row.guaranteeName === guaranteeName);
            return [
                guaranteeName,
                {
                    allTime: percentage(
                        sum(guaranteeCounts, 'compliant'),
                        sum(guaranteeCounts, 'total'),
                    ),
                    selectedPeriod: percentage(
                        sum(guaranteeCounts, 'compliantInRange'),
                        sum(guaranteeCounts, 'totalInRange'),
                    ),
                    bySignature: guaranteeCounts.map((row) => ({
                        signatureId: row.signatureId,
                        allTime: percentage(Number(row.compliant), Number(row.total)),
                        selectedPeriod: percentage(
                            Number(row.compliantInRange),
                            Number(row.totalInRange),
                        ),
                    })),
                    points: points
                        .filter((row) => row.guaranteeName === guaranteeName)
                        .map((row) => ({
                            // Influx returns UTC times without the zone suffix.
                            time: `${row.time}Z`,
                            signatureId: row.signatureId,
                            stateId: row.stateId,
                            value: row.numericExpressionValue,
                            complianceStatus: row.complianceStatus,
                            consolidated: row.consolidated,
                        })),
                },
            ];
        }),
    );
};
