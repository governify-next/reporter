import { Router } from 'express';
import * as influxController from '../controllers/influx.controller.js';

export const influxRoutes = Router();

influxRoutes.post(
    '/influx/organizations/:orgName/elements/:elementName/agreementCollections/:agColName/agreementVersions/auditableVersion/states/sync',
    influxController.syncAuditableAgreementVersionStates,
);
