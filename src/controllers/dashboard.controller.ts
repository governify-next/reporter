import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/standardResponse.js';
import * as dashboardService from '../services/dashboard.service.js';

export const createAuditableAgreementVersionDashboard = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { orgName, elementName, agColName } = req.params;
        const dashboard = await dashboardService.createAuditableAgreementVersionDashboard(
            orgName,
            elementName,
            agColName,
        );

        return sendSuccess(res, {
            data: dashboard,
            message: 'Grafana dashboard created successfully',
        });
    } catch (err) {
        next(err);
    }
};
