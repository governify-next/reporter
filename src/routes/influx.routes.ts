import { Router } from 'express';
import * as influxController from '../controllers/influx.controller.js';

export const influxRoutes = Router();

influxRoutes.post(
    '/influx/organizations/:orgName/scopes/:scopeId/agreementCollections/:agColId/agreementVersions/:agreementVersion/states/sync',
    influxController.syncAgreementVersionStates,
);
