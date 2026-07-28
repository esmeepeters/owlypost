# Security Policy

## Security model (no built-in auth)

Owly Post has **no login and no user accounts** — it is single-user and assumes
one trusted operator. It does not authenticate requests, so **do not expose it
directly to the internet**. Secure it at the deployment level:

- put it behind a reverse proxy (nginx/Caddy/Traefik) with HTTP basic auth or
  your SSO of choice, or
- keep it on a private network / VPN (e.g. Tailscale), and
- do not publish the container ports to a public interface.

Reports that boil down to "the app has no authentication" are by design and
not considered vulnerabilities.

## Supported versions

Only the latest release receives security fixes. Owly Post is maintained by a
single person; there are no long-term support branches.

## Reporting a vulnerability

Please **do not report security vulnerabilities through public GitHub
issues** — a public report tells attackers about the problem before a fix
exists.

Instead, use one of these private channels:

- **GitHub private vulnerability reporting** (preferred): go to the
  [Security tab](https://github.com/esmeepeters/owlypost/security) and click
  **Report a vulnerability**. Only the maintainer can see your report.
- **Email**: [mail@owlypost.com](mailto:mail@owlypost.com)

Include what you found, how to reproduce it, and what impact you think it
has. This is a spare-time project, so please allow up to a week for a first
response — you will get one.
