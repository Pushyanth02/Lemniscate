# Security Policy

Lemniscate is a local-first, client-only application: your library lives in
your browser's IndexedDB, and AI requests go directly from your browser to
the provider you configure with your own API key (BYOK). There is no server,
no account system, and no telemetry.

## What this means for security

- **API keys never leave your browser** except in the Authorization header
  of requests to your chosen provider. They are held in memory for the
  session (or persisted only in your browser's local storage if you opt in),
  never sent to any Lemniscate-operated service — none exists.
- **Documents never leave your device** unless you invoke an AI companion on
  them, in which case the relevant context is sent directly to your chosen
  provider under your key.
- **No backend, no database, no cookies.** The production build is a static
  export served over HTTPS.

## Reporting a vulnerability

If you find a security-relevant bug (for example: cross-origin data access,
prompt-injection leading to key exfiltration, or a content-security-policy
bypass), please report it privately:

1. Open a **private security advisory** via GitHub's
   *Report a vulnerability* button on the **Security** tab of this repository,
   or
2. Email the repository owner via the address listed on their GitHub profile.

Please include reproduction steps and, where possible, a minimal example.
Do **not** open a public issue for security reports.

## Scope

- The application code in this repository (`src/`, `public/sw.js`,
  configuration).
- Deployment behavior of the static export (CSP headers, HTTPS).

Out of scope: vulnerabilities in the AI providers themselves, browser
engines, or infrastructure you self-host the static export on.
