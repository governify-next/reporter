# Governify Compliance Ranking panel

Custom Grafana panel used by Reporter dashboards to render a fixed `0–100%`
compliance distribution. It intentionally provides hover tooltips without any
drag, pan, or zoom interaction.

This package belongs to Reporter. Its compiled `dist` directory is mounted into
Grafana by the infrastructure development Compose file. The production Grafana image
builds and includes the plugin directly, without a host mount.

From this package directory:

```powershell
npm ci
npm run build
```

Use `npm run watch` for continuous compilation of panel source changes, then reload
the dashboard in the browser. For metadata or image asset changes, run `npm run build`
again and restart Grafana when changing metadata.

From the reporter root, the equivalent commands are `npm run plugin:install`,
`npm run plugin:build`, and `npm run dev:plugin`. See the reporter README for the
local Compose workflow and the two container image builds.
