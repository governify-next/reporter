import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import {
    checkServiceAuthentication,
    checkUserAuthentication,
} from '../middlewares/authenticator.validator.js';
import { anyOf } from '../middlewares/anyof.validator.js';

export const dashboardRoutes = Router();

const dashboardPath =
    '/dashboards/organizations/:orgName/scopes/:scopeId/agreementCollections/:agColId/agreementVersions/:agreementVersion';

dashboardRoutes.post(
    dashboardPath,
    checkServiceAuthentication,
    dashboardController.createAgreementVersionDashboard,
);

// PoC: data for the ECharts dashboard embedded in the frontend.
dashboardRoutes.get(
    `${dashboardPath}/data`,
    anyOf(checkUserAuthentication, checkServiceAuthentication),
    dashboardController.getAgreementVersionDashboardData,
);
