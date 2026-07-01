# Single image shared by the app, worker and migrate services. node:24 runs the
# worker's TypeScript entrypoint directly (native type stripping); the app runs
# the compiled Next.js build.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Build the Next.js app, then drop dev dependencies.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

# Runtime image.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Default command runs the app; the worker and migrate services override it.
CMD ["pnpm", "start"]
