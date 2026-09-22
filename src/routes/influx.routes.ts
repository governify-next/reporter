import { Router } from 'express';
import * as influxController from '../controllers/influx.controller.js';
import { checkServiceAuthentication } from '../middlewares/authenticator.validator.js';
import { validateSyncStatesBody } from '../middlewares/influx.validator.js';

export const influxRoutes = Router();

influxRoutes.post(
    '/influx/organizations/:orgName/scopes/:scopeId/agreementCollections/:agColId/agreementVersions/:agreementVersion/states/sync',
    checkServiceAuthentication,
    validateSyncStatesBody,
    influxController.syncAgreementVersionStates,
);
