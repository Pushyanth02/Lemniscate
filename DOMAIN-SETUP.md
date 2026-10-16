# Custom domain setup — Lemniscate

The app is configured for `lemniscate.app` as its canonical origin. This file
records everything that is already wired in the codebase and the DNS/hosting
steps an operator completes once the domain is owned.

## Already configured in the repo

| Artifact | Where | Value |
|---|---|---|
| Canonical origin | `src/app/layout.tsx` → `metadataBase` | `https://lemniscate.app` |
| Canonical tag | `src/app/layout.tsx` → `alternates.canonical` | `/` (resolves to `https://lemniscate.app/`) |
| Sitemap URL | `public/robots.txt` → `Sitemap:` | `https://lemniscate.app/sitemap.xml` |
| Sitemap loc | `public/sitemap.xml` | `https://lemniscate.app/` |
| Structured data | `src/app/layout.tsx` JSON-LD `@id`s | `https://lemniscate.app/#webapp`, `/#organization`, `/#website` |
| OG/Twitter URLs | `src/app/layout.tsx` | absolute under `https://lemniscate.app` |
| llms.txt | `public/llms.txt` | references `https://lemniscate.app` |

To switch to a different domain, change the single `SITE_URL` constant in
`src/app/layout.tsx` and the two absolute URLs in `public/robots.txt`,
`public/sitemap.xml`, and `public/llms.txt`.

## Operator steps (one-time, after domain purchase)

1. **DNS records** (at the registrar):
   - `A` record `@` → the hosting provider's edge IPv4
   - `AAAA` record `@` → edge IPv6 (optional but recommended)
   - `CNAME` record `www` → the apex host (then redirect `www` → apex)
2. **TLS**: terminate HTTPS at the edge (hosting providers issue certificates
   automatically; Caddy does this via ACME when self-hosting).
3. **Hosting**: the app is a Next.js static export (`output: "export"` in
   `next.config.ts`). Deploy the build output to any static CDN (Vercel,
   Netlify, Cloudflare Pages, or Caddy `file_server`).
4. **Caddy example** (self-hosted edge):

   ```caddyfile
   lemniscate.app {
       encode zstd gzip
       root * /srv/lemniscate/out
       try_files {path} /404.html
       file_server
   }
   ```

   Static export serves `404.html` for unknown paths, matching the custom
   404 page in `src/app/not-found.tsx`.
5. **Verify**: `curl -I https://lemniscate.app` returns 200 and
   `link rel="canonical"` points at the apex; submit
   `https://lemniscate.app/sitemap.xml` in Google Search Console
   (domain property) and Bing Webmaster Tools.

## Sandbox note

This development sandbox exposes one gateway port (`:81` → Next.js dev server
on `:3000`) and cannot own a real domain or terminate public TLS. The domain
becomes live when the static export is deployed to a host with the DNS records
above; no application changes are required beyond `SITE_URL` if you rename the
domain.
