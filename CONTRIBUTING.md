# Contributing to Owly Post

Thanks for your interest in contributing! Bug reports, fixes, and improvements
are welcome. For larger changes, please open an issue first to discuss the
direction before investing time in a pull request.

## Contributor License Agreement (CLA)

Owly Post is AGPL-3.0, and a commercial edition is built on top of the same
codebase. To keep that possible, every contributor signs the
[Individual Contributor License Agreement](./CLA.md) once, granting the
project maintainer the right to also use your contribution outside the AGPL —
you keep the copyright and all rights to use your own work elsewhere.

Signing is a one-time, one-click step: when you open your first pull request,
a bot comments with instructions; reply with the requested sentence and the
check turns green. Pull requests cannot be merged before the CLA is signed.

## Developer Certificate of Origin (DCO)

Every commit must be signed off, certifying that you have the right to submit
the code under this project's license ([AGPL-3.0](./LICENSE)). This is the
[Developer Certificate of Origin](https://developercertificate.org/) — no
paperwork, just add the sign-off to each commit:

```bash
git commit -s
```

This appends a line to the commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Pull requests with unsigned commits are blocked by an automated DCO check.
Forgot to sign off? Amend the last commit with `git commit --amend -s`, or fix
a whole branch with `git rebase --signoff main`, then force-push.

## Development setup

See [docs/self-hosting.md](./docs/self-hosting.md) for the full walkthrough.
In short: Node 22+, pinned pnpm (`npx pnpm@11.6.0`), Postgres via
`docker compose up -d postgres`, then `pnpm migrate` and `pnpm dev`.

Before opening a PR, keep these green:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description`, e.g. `fix(digest): handle feeds without pubDate`.
