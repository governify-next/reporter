import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/customErrors.js';
import { sendSuccess } from '../utils/standardResponse.js';
import * as dashboardService from '../services/dashboard.service.js';

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
