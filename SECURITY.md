# Security Policy

## Reporting a Vulnerability

Please do not report security issues through public GitHub issues.

Use one of these private paths instead:
- GitHub Security Advisories for the repository
- Direct contact with the repository owner through the `digaxie` GitHub account

Include:
- a short description of the issue
- affected files or features
- reproduction steps
- impact assessment if known

## Secret Handling Rules

The following must never be committed to the repository:
- service role keys
- Vercel tokens
- database connection strings
- production passwords
- local operator notes
- `.env` or `.env.production` files with real values

Only placeholder values belong in `.env.example`.

## If a Secret Is Exposed

If any credential is exposed:
1. Rotate the credential immediately.
2. Remove the exposed value from tracked files.
3. Check build logs, deployment settings, and Git history.
4. Notify maintainers through a private security channel.
