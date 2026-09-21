import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import { checkServiceAuthentication } from '../middlewares/authenticator.validator.js';

export const dashboardRoutes = Router();

dashboardRoutes.post(
    '/dashboards/organizations/:orgName/scopes/:scopeId/agreementCollections/:agColId/agreementVersions/:agreementVersion',
    checkServiceAuthentication,
    dashboardController.createAgreementVersionDashboard,
);
