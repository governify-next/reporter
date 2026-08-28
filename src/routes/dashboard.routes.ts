import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';

export const dashboardRoutes = Router();

dashboardRoutes.post(
    '/dashboards/organizations/:orgName/scopes/:scopeId/agreementCollections/:agColId/agreementVersions/:agreementVersion',
    dashboardController.createAgreementVersionDashboard,
);
