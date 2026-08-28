import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/standardResponse.js';
import * as influxService from '../services/influx.service.js';

export const syncAgreementVersionStates = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { orgName, scopeId, agColId, agreementVersion } = req.params;
        const states = await influxService.syncAgreementVersionStates(
            orgName,
            scopeId,
            agColId,
            agreementVersion,
        );
        return sendSuccess(res, {
            data: states,
            message: 'States synchronized successfully',
        });
    } catch (err) {
        next(err);
    }
};
