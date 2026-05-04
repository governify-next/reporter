import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/standardResponse.js';
import * as influxService from '../services/influx.service.js';

export const syncAuditableAgreementVersionStates = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { orgName, elementName, agColName } = req.params;
        const states = await influxService.syncAuditableAgreementVersionStates(
            orgName,
            elementName,
            agColName,
        );
        return sendSuccess(res, {
            data: states,
            message: 'States synchronized successfully',
        });
    } catch (err) {
        next(err);
    }
};
