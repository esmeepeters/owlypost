# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Owly Post is a self-hosted, single-user RSS/feed reader with a weekly AI digest. Next.js 15 (App Router, React 19, TypeScript) + Postgres, deployed as a Docker Compose stack (app + worker + postgres). No authentication.

## Commands

Package manager is pinned pnpm — invoke it as `npx pnpm@11.6.0` (prefix `CI=true` for install/prune in non-interactive shells).

- `pnpm lint` — ESLint (flat config, `eslint.config.mjs`)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — `node --test "lib/**/*.test.ts"` (native Node runner; pure-function tests)
- `pnpm build` — `next build`
- `pnpm migrate` / `pnpm seed` — apply migrations / seed example sources (both read `.env`)

Keep lint, typecheck, and test green before finishing.

## TypeScript / imports (important)

`lib/` and `scripts/` run directly under Node's native TypeScript execution (the worker and CLI scripts, Node 22+) and are also bundled by Next. Two rules:

- Relative imports use explicit `.ts` extensions, e.g. `import { getStorage } from "./storage/index.ts"`.
- Type-only imports MUST use `import type`. A plain `import { Foo }` of a type-only symbol errors at runtime — Node strips types but keeps the import statement.

`tsc` also reads generated types under `.next/types`; after deleting a route/page, `rm -rf .next` before `pnpm typecheck` to avoid stale errors.

## Architecture

- **Storage abstraction** (`lib/storage/`): all DB access goes through `getStorage()`, which returns the `Storage` interface backed by `PostgresStorage` (node-postgres over `DATABASE_URL`). Add a method to the interface (`lib/storage/types.ts`) and implement it in `postgres.ts` — never use a DB client directly from routes/pages/jobs.
- **Migrations**: idempotent `.sql` files in `db/migrations/NNNN_*.sql`, applied by the runner in `lib/migrate.ts` (tracks a `schema_migrations` table). Add schema changes as new numbered files.
- **Jobs & scheduler**: the fetch → summarize → digest → email logic lives in `lib/jobs.ts` (`runIngestJob` / `runDigestJob`). The worker (`scripts/worker.ts` → `lib/scheduler.ts`, node-cron) and the `/api/ingest` + `/api/digest` routes both call these — keep job logic in `lib/`, not in a trigger.
- **No auth**: single-user; every route/API is open by design. Don't add login, sessions, or per-user scoping (the schema has no user column).
- **LLM**: provider-agnostic via `lib/llm/` — `getLlm()` returns the provider selected by `LLM_PROVIDER` (`anthropic` or `openai`, the latter also covering OpenAI-compatible servers via `OPENAI_BASE_URL`). Providers implement a single `generateText` primitive; the shared JSON/retry loop lives in `lib/llm/call.ts`. Models from `LLM_MODEL_SUMMARY` / `LLM_MODEL_DIGEST` (per-provider defaults in `lib/llm/index.ts`).

Environment variables are documented in `.env.example` (`DATABASE_URL`, `LLM_PROVIDER` + `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, `LLM_MODEL_*`, `DIGEST_*`, `INGEST_CRON`/`DIGEST_CRON`, `EMAIL_PROVIDER` + Resend/`SMTP_*` + `SITE_URL` for email — provider selection in `lib/email/`, mirroring `lib/llm/`).

## Deploy

Docker Compose: `postgres` + one-shot `migrate` + `app` (`next start`) + `worker` (`node scripts/worker.ts`). `docker compose up -d --build`. The worker runs the digest on `DIGEST_CRON` (default Sunday 17:00 in `DIGEST_TIMEZONE`), so it must run on an always-on host.

## Conventions

- Commits: Conventional Commits (`type(scope): description`).
