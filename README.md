# Governify Next Reporter

Reporter reads the current agreement-version States from Registry, projects them into InfluxDB 3,
and creates Grafana dashboards over that projection.

## Main endpoints

- `POST /api/v1/influx/organizations/{orgName}/scopes/{scopeId}/agreementCollections/{agColId}/agreementVersions/{agreementVersion}/states/sync`
  manually synchronizes all currently stored States and metrics.
- `POST`, `GET`, `DELETE /api/v1/influx/organizations/{orgName}/scopes/{scopeId}/agreementCollections/{agColId}/agreementVersions/{agreementVersion}/tasks/states/sync`
  create, list, and delete recurring State synchronization tasks managed by Director.
- `POST /api/v1/dashboards/organizations/{orgName}/scopes/{scopeId}/agreementCollections/{agColId}/agreementVersions/{agreementVersion}`
  creates or updates the Grafana dashboard.
- `GET /health` checks service availability.
- `/api-docs` exposes the Swagger UI.

`agreementVersion` accepts a one-based positive integer or `auditableVersion`.

## Recurring State synchronization

The task creation endpoint accepts `?enabled=true` (default) or `?enabled=false` and this JSON body:

```json
{
    "interval": 300000,
    "lookbackMs": 3600000
}
```

Both fields are required positive integers in milliseconds. This example runs every five minutes
and synchronizes States with `updatedAt` in `[scheduledAt - 3600000, scheduledAt)`.
Reporter creates one `RECURRING` task using Director's `syncAgreementVersionStates` script for
the whole selected agreement version. Scope Manager supplies the organization ID; Registry
supplies the collection and version metadata. The collection must belong to the requested scope.

Optional ISO 8601 body fields control scheduling:

| Field        | Default                          | Meaning                                                                     |
| ------------ | -------------------------------- | --------------------------------------------------------------------------- |
| `startDate`  | Agreement version validity start | Earliest permitted execution date.                                          |
| `anchorDate` | Agreement version validity start | Reference date for the recurrence interval.                                 |
| `endDate`    | Agreement version validity end   | Last permitted execution date; must be in the future and after `startDate`. |

When omitted, `endDate` uses the selected version's `contract.validity.end`; an explicit value
overrides this default. The resolved end date must be in the future and after `startDate`.
Director schedules the
next future occurrence when `startDate` is in the past; creating a task does not replay past runs.

`auditableVersion` is resolved to its one-based numeric position when managing tasks, matching
Registry's selector semantics. This position may differ from the stored `versionNumber`.
After the current auditable version changes, use the numeric selector to manage tasks for an
earlier version.

POST returns the Director task with HTTP 201 when created or 200 when the same task already
exists. Identical arguments and scheduling dates reuse Director's existing deduplication;
changing the schedule or `lookbackMs` defines a different task. Repeating a request can update
its `enabled` state. GET returns all matching recurring synchronization tasks, including disabled
ones. DELETE removes matching tasks and their execution records and returns
`deletedTasksCount` and `deletedExecutionsCount`. Other scripts are excluded from these operations.

These endpoints require service authentication when enabled. Configure `DIRECTOR_SERVICE_URL`
and `SCOPE_MANAGER_SERVICE_URL` in addition to `REGISTRY_SERVICE_URL`.

## Agreement overview

Dashboards start with the agreement title and description, organization, selected version,
template, and validity dates in the agreement time zone. The description is prefixed with `Decription:`.
Early termination is shown together with the originally scheduled end when present.
The title uses the collection display name, falling back to its name and then the template name.
Regenerate an existing dashboard to include the overview or refresh its agreement information.
Dashboard titles follow organization, agreement name, and version order.
Guarantee chart blocks follow the order of `guarantees` in the associated `agreementTemplate`.
Only guarantees with signatures are shown; guarantees absent from the current template appear last.
Reporter keeps the dashboard URL as `/d/<uid>` under the configured public URL.

## Signature labels

Dashboard creation accepts an optional JSON body with `signatureLabelMode`:

- `{"signatureLabelMode":"label"}` (default) uses each signature's
  `visualizationConfig.label` in the timeline legend and signature comparison chart.
- `{"signatureLabelMode":"signatureId"}` keeps the previous presentation: the last six
  characters of the ID in timelines, and `Signature N: <last six characters>` in comparisons.

Other values return HTTP 400. Older signatures without a configured label retain the
previous presentation. Labels only affect display; queries still identify signatures by ID.
Timeline colors are derived from the displayed label, so the same team or member keeps the same
color across guarantees (lines and points). Without a label, or in `signatureId` mode, colors
are derived from the full signature ID. Signature comparison bars retain their period colors
(`All time` and `Selected period`), matching the chart legend.

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

## Grafana plugin and local development

Reporter owns `grafana/plugins/governify-compliance-ranking-panel`. Its source and
lockfile are versioned here; `dist` and `node_modules` are generated locally.
The plugin has its own npm package and does not depend on sibling repositories.
Use Node.js 24 for the service and plugin.

With `reporter` and `infrastructure` checked out next to each other, run from this repository:

```sh
npm ci
npm run plugin:install
npm run plugin:build
docker compose -f ../infrastructure/docker-compose.dev.yaml up -d mongo redis influxdb3 grafana
npm run dev
```

Configure Reporter's `.env` using `.env.example` and run the other Governify services
needed for your workflow. Grafana is available at `http://localhost:3000`.
The development Compose file uses Grafana 13.0.1 and mounts the plugin's local
`dist` directory read-only at `/opt/governify/plugins/governify-compliance-ranking-panel`.
Build the plugin before starting Grafana; Compose will not create a missing mount directory.

Run `npm run dev:plugin` in another terminal to recompile changes to the panel source.
Reload the dashboard in your browser after compilation (use a hard refresh if needed).
After editing `plugin.json` or image assets, run `npm run plugin:build` again;
restart Grafana for plugin metadata changes. Changes to generated dashboard definitions
also require calling Reporter's dashboard creation/update endpoint again.

When migrating from the old plugin location under `infrastructure`, rebuild the plugin
and recreate only Grafana to apply the new mount:

```sh
docker compose -f ../infrastructure/docker-compose.dev.yaml up -d --no-deps --force-recreate grafana
```

The existing `grafana-data` volume is retained.

## Container images

Build both images from the reporter repository root:

```sh
npm run images:build
```

This produces `governifynext/reporter:local` and `governifynext/reporter-grafana:local`.
Docker builds the service and plugin from their respective lockfiles; no local npm
installation or precompiled plugin is required for image builds.
The individual commands are `npm run image:reporter` and `npm run image:grafana`.

For a release, build both images from the same commit and use the same tag:

```sh
docker build -t governifynext/reporter:<release-tag> .
docker build -f grafana/Dockerfile -t governifynext/reporter-grafana:<release-tag> .
```

The Grafana image uses version 13.0.1 by default. To deliberately change it, pass
`--build-arg GRAFANA_VERSION=<version>` and validate compatibility with the plugin.
Its compiled plugin is included at `/opt/governify/plugins`, outside the persistent
data directory `/var/lib/grafana`, and requires no startup download or host bind mount.
The image permits loading only the unsigned plugin ID `governify-compliance-ranking-panel`.

The custom image also simplifies navigation for login `user` with the `Viewer` role
(excluding Grafana administrators). It hides the main menu, global dashboard search,
folder breadcrumbs and favorites, including search keyboard shortcuts. Home and
dashboard discovery pages show a message asking for the group's direct dashboard link.
Dashboard time controls and variables remain available. Other accounts keep Grafana's UI.
This is cosmetic: the shared account still has access through direct URLs and APIs.
It does not isolate groups or change permissions.

The customization lives in `grafana/ui`, loads before Grafana's application bundle,
and supports a configured URL subpath. Recheck its selectors when upgrading Grafana.
Development and local Compose use the custom image too; apply UI changes with
`docker compose -f docker-compose.dev.yaml up -d --build --no-deps grafana` from
the infrastructure directory. Existing dashboards do not need to be regenerated.

Plugin versions in `package.json`, `plugin.json` and Reporter's dashboard generator must
stay aligned when updating the panel contract.

`infrastructure/docker-compose.prod.yaml` uses these two images with the shared
`REPORTING_IMAGE_TAG` variable (default: `develop`) and can build them from the sibling
reporter checkout. Set that variable in infrastructure's `.env` to `local` when using
the locally built images, or to a published release tag when deploying a release.
Use the production Compose file on its own, rather than layering it over the development
file, so the development plugin mount is not inherited.

CI builds the plugin and both images. The develop workflow publishes both images with
the `develop` tag; releases publish both with the release tag.
Publishing requires the existing Docker Hub credentials to have access to both image repositories.
Image publication is sequential: deploy a new tag only after both image builds and pushes succeed.
