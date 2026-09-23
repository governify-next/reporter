import { Request, Response, NextFunction } from 'express';
import * as syncTaskService from '../services/syncTask.service.js';
import { sendSuccess } from '../utils/standardResponse.js';

export const createSyncTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { orgName, scopeId, agColId, agreementVersion } = req.params;
        const result = await syncTaskService.createSyncTask(
            orgName,
            scopeId,
            agColId,
            agreementVersion,
            req.body,
            req.query.enabled === undefined || req.query.enabled === 'true',
        );
        return sendSuccess(res, {
            data: result.data,
            httpStatus: result.status === 201 ? 201 : 200,
            message:
                result.status === 201
                    ? 'State synchronization task created'
                    : 'State synchronization task already exists',
        });
    } catch (error) {
        next(error);
    }
};

export const getSyncTasks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { orgName, scopeId, agColId, agreementVersion } = req.params;
        const data = await syncTaskService.getSyncTasks(
            orgName,
            scopeId,
            agColId,
            agreementVersion,
        );
        return sendSuccess(res, { data, message: 'State synchronization tasks retrieved' });
    } catch (error) {
        next(error);
    }
};

export const deleteSyncTasks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { orgName, scopeId, agColId, agreementVersion } = req.params;
        const data = await syncTaskService.deleteSyncTasks(
            orgName,
            scopeId,
            agColId,
            agreementVersion,
        );
        return sendSuccess(res, { data, message: 'State synchronization tasks deleted' });
    } catch (error) {
        next(error);
    }
};
