import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/standardResponse.js';
import * as dashboardService from '../services/dashboard.service.js';

export const createAgreementVersionDashboard = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { orgName, scopeId, agColId, agreementVersion } = req.params;
        const dashboard = await dashboardService.createAgreementVersionDashboard(
            orgName,
            scopeId,
            agColId,
            agreementVersion,
        );

        return sendSuccess(res, {
            data: dashboard,
            message: 'Grafana dashboard created successfully',
        });
    } catch (err) {
        next(err);
    }
};
