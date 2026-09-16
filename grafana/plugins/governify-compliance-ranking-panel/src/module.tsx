import React, { useMemo, useState } from 'react';
import { PanelPlugin } from '@grafana/data';

type RankingOptions = {
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

type RankingMarker = {
    agreements: number;
    compliance: number;
    current: boolean;
};

type TooltipState = RankingMarker & {
    x: number;
    y: number;
};

const DEFAULT_OPTIONS: Required<RankingOptions> = {
    axisColor: '#4a4a4a',
    currentColor: '#3274d9',
    currentSize: 7,
    decimals: 1,
    hoverSize: 12,
    lineColor: '#c7c7c7',
    lineWidth: 2,
    otherColor: '#4a4a4a',
    otherSize: 5,
};

const getVectorValue = (values: unknown, index: number) => {
    if (values && typeof (values as { get?: unknown }).get === 'function') {
        return (values as { get: (valueIndex: number) => unknown }).get(index);
    }

    return (values as unknown[])?.[index];
};

const readMarkers = (data: any): RankingMarker[] => {
    const markers: RankingMarker[] = [];

    for (const frame of data?.series ?? []) {
        const complianceField = frame.fields?.find((field: any) => field.name === 'Compliance');
        const currentField = frame.fields?.find((field: any) => field.name === 'Current agreement');
        const otherField = frame.fields?.find((field: any) => field.name === 'Other agreements');
        const agreementsField = frame.fields?.find((field: any) => field.name === 'Agreements');
        const markerField = currentField ?? otherField;

        if (!complianceField || !markerField) {
            continue;
        }

        for (let index = 0; index < complianceField.values.length; index += 1) {
            const compliance = Number(getVectorValue(complianceField.values, index));
            if (!Number.isFinite(compliance)) {
                continue;
            }

            const agreementCount = Number(getVectorValue(agreementsField?.values, index));
            markers.push({
                agreements: Number.isFinite(agreementCount) ? agreementCount : 1,
                compliance,
                current: Boolean(currentField),
            });
        }
    }

    return markers.sort((left, right) => {
        if (left.compliance !== right.compliance) {
            return left.compliance - right.compliance;
        }
        return Number(left.current) - Number(right.current);
    });
};

const ComplianceRankingPanel = ({ data, height, options, width }: any) => {
    const panelOptions = { ...DEFAULT_OPTIONS, ...(options as RankingOptions) };
    const markers = useMemo(() => readMarkers(data), [data]);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    const left = 25;
    const right = 25;
    const top = 0;
    const bottom = 58;
    const plotWidth = Math.max(1, width - left - right);
    const plotBottom = Math.max(top + 1, height - bottom);
    const centerY = top + (plotBottom - top) / 2;
    const xForCompliance = (compliance: number) =>
        left + (Math.max(0, Math.min(100, compliance)) / 100) * plotWidth;

    const showTooltip = (event: React.MouseEvent<SVGRectElement>, marker: RankingMarker) => {
        const svg = event.currentTarget.ownerSVGElement;
        if (!svg) {
            return;
        }

        const bounds = svg.getBoundingClientRect();
        setTooltip({
            ...marker,
            x: event.clientX - bounds.left + 12,
            y: event.clientY - bounds.top + 12,
        });
    };

    return (
        <div
            style={{
                color: panelOptions.axisColor,
                height,
                overflow: 'hidden',
                position: 'relative',
                width,
            }}
        >
            <svg aria-label="Compliance ranking" height={height} role="img" width={width}>
                {Array.from({ length: 11 }, (_, index) => index * 10).map((tick) => {
                    const x = xForCompliance(tick);
                    return (
                        <g key={tick}>
                            <line
                                stroke="#e5e7eb"
                                strokeWidth={1}
                                x1={x}
                                x2={x}
                                y1={top}
                                y2={plotBottom}
                            />
                            <text
                                fill={panelOptions.axisColor}
                                fontSize={12}
                                textAnchor="middle"
                                x={x}
                                y={plotBottom + 20}
                            >
                                {tick.toFixed(panelOptions.decimals)}%
                            </text>
                        </g>
                    );
                })}

                <line
                    stroke={panelOptions.lineColor}
                    strokeLinecap="butt"
                    strokeWidth={panelOptions.lineWidth}
                    x1={left}
                    x2={left + plotWidth}
                    y1={centerY}
                    y2={centerY}
                />

                {markers.map((marker, index) => {
                    const size = marker.current ? panelOptions.currentSize : panelOptions.otherSize;
                    const hoverSize = Math.max(size, panelOptions.hoverSize);
                    const color = marker.current
                        ? panelOptions.currentColor
                        : panelOptions.otherColor;
                    const markerX = xForCompliance(marker.compliance);
                    const x = markerX - size / 2;
                    const y = centerY - size / 2;

                    return (
                        <g key={`${marker.compliance}-${marker.current}-${index}`}>
                            <rect
                                fill={color}
                                height={size}
                                pointerEvents="none"
                                shapeRendering="crispEdges"
                                width={size}
                                x={x}
                                y={y}
                            />
                            <rect
                                aria-label={`${marker.compliance.toFixed(panelOptions.decimals)}%, ${marker.agreements} agreements`}
                                fill="transparent"
                                height={hoverSize}
                                onMouseLeave={() => setTooltip(null)}
                                onMouseMove={(event) => showTooltip(event, marker)}
                                width={hoverSize}
                                x={markerX - hoverSize / 2}
                                y={centerY - hoverSize / 2}
                            />
                        </g>
                    );
                })}

                <text
                    fill={panelOptions.axisColor}
                    fontSize={12}
                    textAnchor="middle"
                    x={width / 2}
                    y={height - 23}
                >
                    Compliance
                </text>

                <g
                    aria-label="Legend"
                    transform={`translate(${Math.max(left, width / 2 - 125)} ${height - 5})`}
                >
                    <rect fill={panelOptions.currentColor} height={8} width={8} x={0} y={-8} />
                    <text fill={panelOptions.axisColor} fontSize={12} x={13} y={0}>
                        Current agreement
                    </text>
                    <rect fill={panelOptions.otherColor} height={8} width={8} x={132} y={-8} />
                    <text fill={panelOptions.axisColor} fontSize={12} x={145} y={0}>
                        Other agreements
                    </text>
                </g>
            </svg>

            {tooltip && (
                <div
                    style={{
                        background: '#ffffff',
                        border: '1px solid #d0d5dd',
                        borderRadius: 4,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
                        color: '#1f2937',
                        fontSize: 12,
                        left: Math.min(tooltip.x, Math.max(0, width - 165)),
                        padding: '8px 10px',
                        pointerEvents: 'none',
                        position: 'absolute',
                        top: Math.min(tooltip.y, Math.max(0, height - 62)),
                        whiteSpace: 'nowrap',
                        zIndex: 10,
                    }}
                >
                    <div>
                        <strong>Compliance:</strong>{' '}
                        {tooltip.compliance.toFixed(panelOptions.decimals)}%
                    </div>
                    <div>
                        <strong>Agreements:</strong> {tooltip.agreements}
                    </div>
                </div>
            )}
        </div>
    );
};

export const plugin = new PanelPlugin(ComplianceRankingPanel);
