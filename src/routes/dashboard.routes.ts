import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import {
    checkServiceAuthentication,
    checkUserAuthentication,
} from '../middlewares/authenticator.validator.js';

export const dashboardRoutes = Router();

const dashboardPath =
    '/dashboards/organizations/:orgName/scopes/:scopeId/agreementCollections/:agColId/agreementVersions/:agreementVersion';

dashboardRoutes.post(
    dashboardPath,
    checkServiceAuthentication,
    dashboardController.createAgreementVersionDashboard,
);

dashboardRoutes.get(
    dashboardPath,
    checkUserAuthentication,
    dashboardController.getAgreementVersionDashboard,
);
