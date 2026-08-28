# Governify Next Reporter

Reporter reads the current agreement-version States from Registry, projects them into InfluxDB 3,
and creates Grafana dashboards over that projection.

## Main endpoints

- `POST /api/v1/influx/organizations/{orgName}/scopes/{scopeId}/agreementCollections/{agColId}/agreementVersions/{agreementVersion}/states/sync`
  manually synchronizes all currently stored States and metrics.
- `POST /api/v1/dashboards/organizations/{orgName}/scopes/{scopeId}/agreementCollections/{agColId}/agreementVersions/{agreementVersion}`
  creates or updates the Grafana dashboard.
- `GET /health` checks service availability.
- `/api-docs` exposes the Swagger UI.

`agreementVersion` accepts a one-based positive integer or `auditableVersion`.

## InfluxDB projection

- `states` contains one point for every Registry State, including `IN_PROGRESS`, `FAILED`, and
  `INDETERMINATE` results.
- `state_metrics` contains every State metric, including unavailable, pending, and failed metrics.
- Nullable numeric values are written with a companion availability field.
- Registry's null `complianceStatus` while processing is projected as `PENDING`.
- Writes are split by configurable point and byte limits.

## Scripts

- `npm run dev` starts Reporter in development mode.
- `npm run build` compiles TypeScript.
- `npm start` starts the compiled service.
- `npm test` runs the test suite.
- `npm run lint` runs ESLint.

Configuration variables and their defaults are documented in `.env.example`.
