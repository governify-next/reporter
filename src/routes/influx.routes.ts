import { Router } from 'express';
import * as influxController from '../controllers/influx.controller.js';
import { checkServiceAuthentication } from '../middlewares/authenticator.validator.js';
import { validateSyncStatesBody } from '../middlewares/influx.validator.js';
import * as syncTaskController from '../controllers/syncTask.controller.js';
import {
    validateSyncTaskParams,
    validateCreateSyncTask,
} from '../middlewares/syncTask.validator.js';

export const influxRoutes = Router();

const syncTasksPath =
    '/influx/organizations/:orgName/scopes/:scopeId/agreementCollections/:agColId/agreementVersions/:agreementVersion/tasks/states/sync';

influxRoutes.post(
    syncTasksPath,
    checkServiceAuthentication,
    validateSyncTaskParams,
    validateCreateSyncTask,
    syncTaskController.createSyncTask,
);
influxRoutes.get(
    syncTasksPath,
    checkServiceAuthentication,
    validateSyncTaskParams,
    syncTaskController.getSyncTasks,
);
influxRoutes.delete(
    syncTasksPath,
    checkServiceAuthentication,
    validateSyncTaskParams,
    syncTaskController.deleteSyncTasks,
);

influxRoutes.post(
    '/influx/organizations/:orgName/scopes/:scopeId/agreementCollections/:agColId/agreementVersions/:agreementVersion/states/sync',
    checkServiceAuthentication,
    validateSyncStatesBody,
    influxController.syncAgreementVersionStates,
);
