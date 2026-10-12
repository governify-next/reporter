import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/customErrors.js';
import { sendSuccess } from '../utils/standardResponse.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as dashboardDataService from '../services/dashboardData.service.js';

export const createAgreementVersionDashboard = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { orgName, scopeId, agColId, agreementVersion } = req.params;
        const signatureLabelMode = req.body?.signatureLabelMode;
        if (
            signatureLabelMode !== undefined &&
            signatureLabelMode !== 'label' &&
            signatureLabelMode !== 'signatureId'
        ) {
            throw new ValidationError('signatureLabelMode must be "label" or "signatureId"');
        }
        const dashboard = await dashboardService.createAgreementVersionDashboard(
            orgName,
            scopeId,
            agColId,
            agreementVersion,
            signatureLabelMode ?? 'label',
        );

        return sendSuccess(res, {
            data: dashboard,
            message: 'Grafana dashboard created successfully',
        });
    } catch (err) {
        next(err);
    }
};

// PoC: data for the ECharts dashboard embedded in the frontend.
export const getAgreementVersionDashboardData = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { orgName, scopeId, agColId, agreementVersion } = req.params;
        const from = new Date(String(req.query.from));
        const to = new Date(String(req.query.to));
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new ValidationError('from and to must be valid dates');
        }
        const data = await dashboardDataService.getAgreementVersionDashboardData(
            orgName,
            scopeId,
            agColId,
            agreementVersion,
            from,
            to,
        );

        return sendSuccess(res, { data });
    } catch (err) {
        next(err);
    }
};
