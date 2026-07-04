<div align="center">

# 🦉 Owly Post

**Your own personal content radar that mails you one good newsletter a week — instead of a thousand headlines.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Postgres](https://img.shields.io/badge/Postgres-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![LLM](https://img.shields.io/badge/LLM-Claude%20%7C%20OpenAI-D97757)](./docs/self-hosting.md#2-environment-variables)

[Features](#features) · [Getting started](#getting-started) · [Self-hosting](./docs/self-hosting.md) · [Architecture](#architecture) · [Contributing](#contributing) · [License](#license)

</div>

---

Owly Post is a self-hosted, open source **personal content radar and weekly
digest**. Add your sources — Substacks, news sites, blogs, YouTube channels,
anything with a feed — and Owly quietly collects every new item. Once a week
it writes you **one opinionated editorial newsletter** that summarizes the
week and gives every item a verdict: _must read_, _worth it_, or _skip_.

You rate those verdicts with a 👍 or 👎, and that feedback shapes future
digests through a persistent, hand-editable preference profile. One
deployment serves one user — it replaces Feedly for people who would rather
read one good newsletter than scroll endlessly.

## Table of Contents

- [Features](#features)
- [Getting started](#getting-started)
- [Architecture](#architecture)
- [Security](#security-no-built-in-auth)
- [Costs](#costs)
- [Contributing](#contributing)
- [License](#license)
- [Made with love by Esmee](#made-with-love-by-esmee)

## Features

- **📥 Paste any URL** — automatic feed detection covers direct RSS/Atom
  feeds, `<link rel="alternate">` discovery, well-known feed paths (which
  covers every Substack), YouTube channels and handles, and subreddits.
- **🗂️ Sources by category** — with pause, resume, delete, and clear error
  states.
- **⏱️ Ingestion every 6 hours** — conditional GETs, deduplication,
  best-effort full-text extraction, and a two-sentence AI summary per item.
- **📰 A weekly editorial digest** — written by an LLM of your choice, with
  per-category narratives and a _must-read / worth-it / skip_ verdict per
  item.
- **🔁 A feedback loop** — 👍/👎 (with a reason on thumbs down) feeds a
  persistent, hand-editable preference profile used in every next digest.
- **✉️ Optional email delivery** — via Resend; the app works fully without it.
- **🐳 Self-hosted with Docker Compose** — app, worker/scheduler, and a bundled
  Postgres, one `docker compose up` away. Bring your own LLM key — Anthropic
  (default), OpenAI, or any OpenAI-compatible server (Ollama, OpenRouter).
- **🔒 Single user, no accounts** — AGPL-3.0.

## Getting started

Owly Post runs as a Docker Compose stack: the Next.js **app**, a **worker** that
runs ingestion and the digest on a schedule, and a bundled **Postgres**.

```bash
git clone https://github.com/esmeepeters/owlypost.git
cd owlypost
cp .env.example .env    # add your LLM API key; the rest has sane defaults
docker compose up -d --build
```

The app is then on `http://localhost:3000`. Add sources on `/sources`, press
**Fetch now**, and the first digest arrives on the next schedule (or press
**Generate digest now**).

> **No built-in authentication.** Owly Post is single-user and ships without a
> login. Do not expose it directly to the internet — put it behind a reverse
> proxy with auth, a VPN, or private networking. See
> [Security](#security-no-built-in-auth).

**→ Full walkthrough: [docs/self-hosting.md](./docs/self-hosting.md)** (external
Postgres, the environment-variable table, schedules, and local development).

## Architecture

```
                ┌─────────────────────── docker compose ─────────────────────────┐
                │                                                                │
   you ────────▶│  app (Next.js)                    worker                       │
                │  /inbox /sources                  node-cron scheduler          │
                │  /digests /settings               ingest (INGEST_CRON)         │
                │        │        ▲                  digest (DIGEST_CRON)         │
                │        │        │ "Fetch now" /        │                       │
                │        │        │ "Generate now"       │  both call the same   │
                │        └────────┴──────────────────────┤  jobs in lib/jobs.ts  │
                │                          │             │                       │
                │                          ▼             ▼                       │
                │                   postgres (bundled, named volume)             │
                │   categories · sources · items · digests · digest_items       │
                │   feedback · preference_profile                                │
                └────────────────────────────────────────────────────────────────┘
                                           │
                     LLM API (Anthropic or OpenAI-compatible)
                    summary model: summaries + profile synthesis
                          digest model: the weekly digest
                                           │
                               Resend (optional email)
```

The app talks to Postgres through a swappable storage abstraction
(`lib/storage`) over a `DATABASE_URL` connection string — the bundled container,
or any external Postgres. Ingestion, summarizing and the digest live in
`lib/jobs.ts`, called both by the worker's scheduler and the app's manual
trigger buttons, so nothing is implemented twice.

## Security (no built-in auth)

Owly Post has **no login and no user accounts** — it is single-user and assumes
one trusted operator. It does not authenticate requests, so **do not expose it
directly to the internet**. Secure it at the deployment level:

- put it behind a reverse proxy (nginx/Caddy/Traefik) with HTTP basic auth or
  your SSO of choice, or
- keep it on a private network / VPN (e.g. Tailscale), and
- do not publish the container ports to a public interface.

## Costs

Self-hosted, the stack runs on any small box or VPS you already have. The only
thing that costs actual money is the LLM API — a few cents a week for the
summaries and the digest (or nothing, if you point it at a local
OpenAI-compatible server like Ollama). Email via Resend is optional and fits
its free plan.

So: run it, fork it, tinker with it. Go for it. 🦉

## Contributing

Owly Post is a personal, single-user project — built for one reader, me. I
can't promise to act on contributions, but I'd genuinely love to hear from
you: spotted a bug or have an idea? Open an issue and tell me about it. 🦉

## License

[AGPL-3.0](./LICENSE)

## Made with love by Esmee

Hey! If you're reading this far, you've proven yourself a genuinely dedicated
README reader. 🦉

Hi, I'm **Esmee Peters** 👋 — I help startup founders with a small team build
an ambitious product, by showing how, doing it myself. I built Owly Post
because I wanted one calm weekly read instead of a feed I'd never finish.

Find more of me at [esmeepeters.com](https://esmeepeters.com) · subscribe to
my newsletter at [dispatch.esmeepeters.com](https://dispatch.esmeepeters.com).
