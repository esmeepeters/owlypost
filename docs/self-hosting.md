# Self-hosting Owly Post

Owly Post is single-user and self-hosted: one deployment serves one person —
you. It runs as a Docker Compose stack with three services:

- **app** — the Next.js UI and API,
- **worker** — a scheduler that runs ingestion and the weekly digest on a cron,
- **postgres** — the bundled database (a named volume keeps your data).

There is **no built-in authentication** — see [Security](#security) below.

You need: [Docker](https://docs.docker.com/get-docker/) with Compose, and an
LLM API key — [Anthropic](https://platform.claude.com) (default) or
[OpenAI](https://platform.openai.com) (also covers OpenAI-compatible servers
such as Ollama or OpenRouter). Optionally a [Resend](https://resend.com)
account or any SMTP server (your mail provider, or a local relay) for email
delivery.

## 1. Quick start

```bash
git clone https://github.com/esmeepeters/owlypost.git
cd owlypost
cp .env.example .env    # fill in your LLM API key; defaults cover the rest
docker compose up -d --build
```

This starts Postgres, applies migrations (a one-shot `migrate` service), then
brings up the app and worker. The app is on `http://localhost:3000`.

Optionally seed a few example categories and feeds:

```bash
docker compose exec app node scripts/seed.ts
```

Add your first sources on `/sources`, press **Fetch now**, and check the inbox.
The first digest arrives on the next scheduled run, or press **Generate digest
now** on `/digests` to try it immediately.

## 2. Environment variables

Copy `.env.example` for the full annotated list.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Defaults to the bundled container. Point at any external Postgres to use that instead (add `?sslmode=require` for managed providers). |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | yes* | Credentials for the bundled Postgres container (*only when using it). |
| `LLM_PROVIDER` | no | `anthropic` (default) or `openai`. |
| `ANTHROPIC_API_KEY` | yes* | Claude API key (*when `LLM_PROVIDER=anthropic`; needs API credits — a Claude subscription does not count). |
| `OPENAI_API_KEY` | yes* | OpenAI API key (*when `LLM_PROVIDER=openai`; Ollama accepts any non-empty value, e.g. `ollama`). |
| `OPENAI_BASE_URL` | no | Base URL for OpenAI-compatible servers, e.g. `http://localhost:11434/v1` (Ollama) or `https://openrouter.ai/api/v1`. Best effort — servers vary in JSON-mode support, and small local models may struggle with the digest's structured output. |
| `LLM_MODEL_DIGEST` | no | Digest model. Defaults per provider: `claude-sonnet-4-6` / `gpt-5`. |
| `LLM_MODEL_SUMMARY` | no | Summary/profile model. Defaults per provider: `claude-haiku-4-5` / `gpt-5-mini`. |
| `DIGEST_LANGUAGE` | no | Digest language, defaults to `en` (English). |
| `DIGEST_TIMEZONE` | no | Timezone for the digest week window and the worker's schedules. Defaults to `UTC`. |
| `INGEST_CRON` | no | Ingestion schedule (cron, in `DIGEST_TIMEZONE`). Defaults to `0 */6 * * *` (every 6 hours). |
| `DIGEST_CRON` | no | Digest schedule (cron, in `DIGEST_TIMEZONE`). Defaults to `0 17 * * 0` (Sundays 17:00). |
| `EMAIL_PROVIDER` | no | `resend` (default) or `smtp`. Email is disabled while the selected provider is not fully configured. |
| `RESEND_API_KEY` | no | Resend API key (`EMAIL_PROVIDER=resend`). Leave empty to disable email. |
| `SMTP_HOST` | no | SMTP server hostname (`EMAIL_PROVIDER=smtp`). Leave empty to disable email. |
| `SMTP_PORT` | no | SMTP port, defaults to `587`. |
| `SMTP_USER` / `SMTP_PASS` | no | SMTP credentials; leave empty for relays without authentication. |
| `SMTP_SECURE` | no | `true` = implicit TLS from the first byte (the port 465 model), `false` = STARTTLS upgrade when the server offers it. Defaults to `true` on port 465, `false` otherwise. |
| `DIGEST_EMAIL_FROM` | no | From address for digest emails (for Resend: must be on a Resend-verified domain). |
| `DIGEST_EMAIL_TO` | no | Recipient for digest emails. |
| `SITE_URL` | no | Public URL of your deployment; only used to build the app links in the digest email. |

> **Breaking change:** the model variables were renamed from
> `ANTHROPIC_MODEL_DIGEST` / `ANTHROPIC_MODEL_SUMMARY` to `LLM_MODEL_DIGEST` /
> `LLM_MODEL_SUMMARY`. The old names are no longer read; installs that set them
> fall back to the default models until the `.env` is updated.

Inside the compose network, `docker-compose.yml` overrides `DATABASE_URL` to
reach the `postgres` service by name, so the `DATABASE_URL` in `.env` is used
for host-run commands (e.g. `pnpm migrate` / `pnpm seed`).

### SMTP notes

- The default (`SMTP_PORT=587`, `SMTP_SECURE=false`) starts plain and upgrades
  to TLS via STARTTLS when the server supports it. That is right for
  submission ports and local relays, but an active attacker on the path can
  strip the upgrade — over untrusted networks, prefer `SMTP_PORT=465` with
  `SMTP_SECURE=true` (TLS from the first byte).
- The digest email is sent by the **worker** container. An SMTP relay running
  on the Docker host is reachable from it as `host.docker.internal`, not
  `localhost` (on Linux, add
  `extra_hosts: ["host.docker.internal:host-gateway"]` to the worker service).

## 3. Using an external Postgres

Point `DATABASE_URL` at your database (including a Supabase project's Postgres
connection string, with `sslmode=require`) and remove the `postgres` service and
the `DATABASE_URL` overrides from `docker-compose.yml`. Migrations are
idempotent and safe to run against an existing database.

## Security

Owly Post has **no login and no user accounts**. It does not authenticate
requests, so **do not expose it directly to the internet**. You are responsible
for access control at the deployment level:

- put it behind a reverse proxy (nginx/Caddy/Traefik) with HTTP basic auth or
  your SSO of choice, or
- keep it on a private network / VPN (e.g. Tailscale), and
- do not publish the app or Postgres ports to a public interface (the compose
  file maps them to `localhost` for convenience; adjust for your setup).

## Schedules

The worker runs ingestion and the digest on the `INGEST_CRON` / `DIGEST_CRON`
schedules, evaluated in `DIGEST_TIMEZONE`. Change them in `.env` and restart the
worker: `docker compose up -d worker`.

## Migrations

Schema changes live in `db/migrations/*.sql` and are applied by a small runner
that tracks applied versions in a `schema_migrations` table. The `migrate`
service runs them on `docker compose up`; you can also run them by hand:

```bash
docker compose exec app node scripts/migrate.ts   # or: pnpm migrate (host, reads .env)
```

## Local development

Run just Postgres in Docker and the app on the host:

```bash
pnpm install
cp .env.example .env          # fill it in
docker compose up -d postgres
pnpm migrate                  # apply the schema
pnpm seed                     # optional example sources
pnpm dev                      # Next.js on http://localhost:3000
```

Run the worker/scheduler on the host too, if you want scheduled runs locally:

```bash
node --env-file=.env scripts/worker.ts
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

> **Node version:** running the worker and scripts directly needs Node 22+
> (they use native TypeScript execution). The Docker image uses Node 24.
