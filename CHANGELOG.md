# Changelog

## [1.2.0](https://github.com/governify-next/reporter/compare/v1.1.1...v1.2.0) (2026-09-29)


### Features

* add @oas-tools/oas-telemetry for enhanced telemetry support ([b54d05c](https://github.com/governify-next/reporter/commit/b54d05cd2e8fc42dbf782cd3137ffc59439aaa81))
* add agreement template support for dashboard generation and guarantee ordering ([2ee08ac](https://github.com/governify-next/reporter/commit/2ee08ac985d2c39e7dea0ab9e66d2f48ff184c63))
* add recurring state synchronization tasks management ([6f29e0c](https://github.com/governify-next/reporter/commit/6f29e0c19f6b29f65dad4083da8d2b5a2d61fa3f))
* add service authentication to reporter endpoints ([d67d9bb](https://github.com/governify-next/reporter/commit/d67d9bb6b8f5750d5cded40e70d89b076a6cfdce))
* add support for optional date range filtering in syncAgreementVersionStates ([824f7dc](https://github.com/governify-next/reporter/commit/824f7dcef64237152f06f5af46a6d9ea0e3078b8))
* add user authentication support for state synchronization tasks ([7a81e69](https://github.com/governify-next/reporter/commit/7a81e697b3e20bad135537112f77e9426694835d))
* authenticate registry requests with service token ([800ee4c](https://github.com/governify-next/reporter/commit/800ee4cc30f1b2cbd45b13fbfcebe5ae91291d5e))
* disable service authentication flag for tesing ([d6e5a67](https://github.com/governify-next/reporter/commit/d6e5a67f650067d6f7ce3193ab8713a4a91cbe7a))
* enhance shared account UI restrictions and messaging for profile access ([90edc24](https://github.com/governify-next/reporter/commit/90edc241b00e6f8b766579ff0e843d5c9fe886c6))
* implement service authentication and role-based access control ([5ba507d](https://github.com/governify-next/reporter/commit/5ba507dd766e2c6a128a4fedc487d33739631dc3))
* implement viewer navigation customization for Grafana UI ([480a7d2](https://github.com/governify-next/reporter/commit/480a7d2baa208a61bb3783c8417d3066131ace10))
* new version ([2c27ed9](https://github.com/governify-next/reporter/commit/2c27ed925cdb824627e453deb328ed0abe07e5c6))


### Bug Fixes

* **config:** add JWT issuer and audience ([3ac4530](https://github.com/governify-next/reporter/commit/3ac4530bf6d6e2108584ca647d772bfd49b5bfb8))
* update state synchronization to use POST method ([a18e7ea](https://github.com/governify-next/reporter/commit/a18e7ea8c8ddb1a361e59b668f0a7399dc5ad630))

## [1.1.1](https://github.com/governify-next/reporter/compare/v1.1.0...v1.1.1) (2026-09-19)


### Bug Fixes

* new version ([2148ba7](https://github.com/governify-next/reporter/commit/2148ba7579d311cb2e30e6df208589dd4b541323))

## 1.1.0 (2026-09-16)

### Features

- add Docker workflow for automated builds and pushes on develop branch ([ebab622](https://github.com/governify-next/reporter/commit/ebab622810eff8d56d5d502da79c1285014fddec))
- dashboard refactor with grafana plugin enviroment ([5d268d3](https://github.com/governify-next/reporter/commit/5d268d3a7f7c1cb0035e9265ab14b5f993f05c16))
- grafana ([d715719](https://github.com/governify-next/reporter/commit/d7157192e641d7687971a1adc00774fcb72c4f28))
- initial commit ([578ce01](https://github.com/governify-next/reporter/commit/578ce01be2d4dbddc82cfbc16f5fc3343566f6c0))
- initialize Express API with TypeScript, MongoDB, and Swagger documentation ([98600f7](https://github.com/governify-next/reporter/commit/98600f73d5a36d85ef0407f7b0353495daa8ad8e))
- integrate InfluxDB support with configuration, routes, and services ([c6d6260](https://github.com/governify-next/reporter/commit/c6d6260f44187e5926a3ec6832149ea416d94d26))
- release action workflow ([0ea9a90](https://github.com/governify-next/reporter/commit/0ea9a90eddeb8de3b4bdb232841a0e52d531a68c))

### Bug Fixes

- update Docker compose file path for development environment ([b0ac588](https://github.com/governify-next/reporter/commit/b0ac588abb2fb59ec8b9b8148341852ffa331d8b))
- update Docker image tag ([33a1827](https://github.com/governify-next/reporter/commit/33a1827412dff248f86f6d6e5c1369df0c33765d))
- update MongoDB URI and JWT secret in configuration files ([a9d54d5](https://github.com/governify-next/reporter/commit/a9d54d5ede0e98867599305f1a2a5746422b1f12))

### Miscellaneous Chores

- prepare v1.1.0 release ([5e3c37f](https://github.com/governify-next/reporter/commit/5e3c37fa40dc9cc96b944984bee8898041473c5e))
- release 1.1.0 ([64a916b](https://github.com/governify-next/reporter/commit/64a916b02434aa97cacf112b0fb21e93ce927ac2))
