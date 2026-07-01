# Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

## Format

```
type(scope): description

[optional body]

[optional footer]
```

## Types

| Type | Use |
|---|---|
| `feat` | New functionality |
| `fix` | Bug fix |
| `docs` | Documentation |
| `refactor` | Code change without behavior change |
| `chore` | Maintenance, dependencies, config |
| `test` | Adding or updating tests |
| `style` | Formatting, no logic change |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration |

## Scope

Optional, indicates which part of the codebase is affected.
Examples for OwlyPost: `feeds`, `auth`, `digest`, `docker`, `api`.

## Examples

```
feat(feeds): add OPML import support
fix(auth): resolve token refresh race condition
docs(readme): update Docker setup instructions
refactor(digest): simplify AI summary pipeline
chore(deps): bump next.js to 15.2
```

## Rules

1. Subject line max ~50 characters, imperative mood ("add" not "added" or "adds").
2. Body (after blank line) explains "why", not "what".
3. One logical change per commit. Don't bundle unrelated changes.
4. No punctuation at the end of the subject line.

## Breaking changes

Two options:

```
feat!: remove support for single-user mode

feat(api): change auth endpoint response format

BREAKING CHANGE: token field is now nested under `auth.token`
```

## Why this matters

Conventional Commits enables automatic changelog generation and semantic versioning. Tools like `semantic-release` read the commit types to determine whether a release is a patch, minor, or major bump (`fix` → patch, `feat` → minor, `BREAKING CHANGE` → major).
