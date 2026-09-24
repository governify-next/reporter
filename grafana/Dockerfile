# Build from the reporter repository root: docker build -f grafana/Dockerfile .
ARG GRAFANA_VERSION=13.0.1

FROM node:24-alpine AS plugin-build
WORKDIR /usr/src/plugin

COPY grafana/plugins/governify-compliance-ranking-panel/package*.json ./
RUN npm ci --ignore-scripts

COPY grafana/plugins/governify-compliance-ranking-panel/ ./
RUN npm run build

FROM grafana/grafana:${GRAFANA_VERSION}

# Keep image-owned plugins outside the persistent Grafana data directory.
ENV GF_PATHS_PLUGINS=/opt/governify/plugins \
    GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=governify-compliance-ranking-panel

COPY --from=plugin-build --chown=472:0 /usr/src/plugin/dist/ /opt/governify/plugins/governify-compliance-ranking-panel/

USER root
COPY grafana/ui/viewer-navigation.* /usr/share/grafana/public/governify/
COPY grafana/ui/install.sh /tmp/governify-install.sh
RUN sed -i 's/\r$//' /tmp/governify-install.sh && sh /tmp/governify-install.sh && rm /tmp/governify-install.sh
USER 472
