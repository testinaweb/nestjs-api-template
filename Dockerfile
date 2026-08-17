FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-alpine AS runtime
WORKDIR /app
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

ARG ENVIRONMENT=unknown
ENV NODE_ENV=$ENVIRONMENT

# Disable color output in logs, because it looks ugly in the CloudWatch console.
ENV NO_COLOR=true

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY database ./database
# Run pending migrations, then start the API. Config comes entirely from the
# container's real environment variables (injected by the orchestrator) — there is
# no .env file in the image, .env is a local-dev-only convenience.
CMD ["sh", "-c", "node dist/tasks/db-migration/main && node dist/services/api/src/main"]
