# Express TypeScript Boilerplate

A layered Express API boilerplate with TypeScript (Requires Node.js 24+ and MongoDB)

## Scripts

- `npm install` — Install dependencies
- `npm run dev` — Start in development mode
- `npm run build` — Compile TypeScript to JavaScript
- `npm run start` — Start compiled app

## Features

- Swagger API documentation
- Centralized error handling
- Standardized API responses
- Environment variable management with dotenv
- MongoDB integration with Mongoose
- Structured logging with tags
- Layered architecture (routes, controllers, services, models)
- TypeScript for type safety
- ESLint and Prettier for code quality and formatting
- Unit tests with Vitest
- GitHub Actions CI/CD pipeline
- Health check endpoint
- Husky pre-commit hooks
- Dockerfile for containerization
- Request validation with Express Validator
- Graceful shutdown handling XXXXXXXXXXXXXX
- Rate limiting middleware XXXXXXXXXXXXXXXXXXXXXX
- Helmet for security headers

## Influx docker

To run InfluxDB in a Docker container, you can use the following command:

```bash
docker network create influxdb3-net
docker run -d --name influxdb3 --network influxdb3-net -p 8181:8181 -v influxdb3-data:/var/lib/influxdb3 influxdb:3-core serve --node-id=reporter-node --object-store=file --data-dir=/var/lib/influxdb3
docker run -d --name influxdb3-explorer --network influxdb3-net -p 8080:8080 -p 8443:8443 influxdata/influxdb3-ui --mode=admin
docker exec -it influxdb3 influxdb3 create token --admin
```
