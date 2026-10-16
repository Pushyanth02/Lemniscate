/**
 * PDF worker version-alignment check (remediation finding 10).
 *
 * The app serves pdfjs-dist's worker as a committed static asset at
 * /pdf.worker.min.mjs (src/lib/engine-adapters.ts points
 * `GlobalWorkerOptions.workerSrc` at it). A committed copy silently rots the
 * moment pdfjs-dist is upgraded or reinstalled, and pdf.js fails at runtime
 * with no build-time error. This script fails loudly instead.
 *
 * It is deliberately NOT a *.test.* file, so `bun test` ignores it; it is a
 * gate (exit code 1 on mismatch) intended for `bun run check:pdf-worker`,
 * after `bun install`, and in CI.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** tests/check-pdf-worker.ts → repo root. */
const ROOT = join(import.meta.dir, "..");

const INSTALLED_PKG = join(ROOT, "node_modules", "pdfjs-dist", "package.json");
const LOCKFILE = join(ROOT, "bun.lock");
const COMMITTED_WORKER = join(ROOT, "public", "pdf.worker.min.mjs");
const CANONICAL_WORKER = join(
  ROOT,
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.worker.min.mjs",
);
/** The exact command that re-aligns the committed worker. */
const FIX = "cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs";

function fail(message: string): never {
  console.error(`pdf worker MISMATCH — ${message}`);
  console.error(`Fix: ${FIX}`);
  process.exit(1);
}

/* ---- 1. The version pdfjs-dist actually resolves to. ----------------
 * Prefer node_modules (the real installed tree); fall back to the version
 * bun.lock pins (the tree a fresh `bun install` will produce). */
let installed: string | undefined;
if (existsSync(INSTALLED_PKG)) {
  const pkg = JSON.parse(readFileSync(INSTALLED_PKG, "utf8")) as {
    version?: string;
  };
  installed = pkg.version;
} else if (existsSync(LOCKFILE)) {
  const match = readFileSync(LOCKFILE, "utf8").match(
    /"pdfjs-dist":\s*\[\s*"pdfjs-dist@(\d+(?:\.\d+)*)"/,
  );
  installed = match?.[1];
}
if (!installed) {
  fail(
    "cannot determine the installed pdfjs-dist version " +
      "(no node_modules/pdfjs-dist/package.json and no bun.lock resolution) — run bun install first",
  );
}

/* ---- 2. The version embedded in the committed worker. ----------------
 * pdfjs-dist stamps its build artifacts with a header comment:
 *   pdfjsVersion = 6.3.289
 *   pdfjsBuild = 1c8020a7d
 * The version regex also tolerates a quoted literal (`pdfjsVersion="…"`)
 * in case the stamp format shifts between releases. */
if (!existsSync(COMMITTED_WORKER)) {
  fail(`public/pdf.worker.min.mjs does not exist (installed pdfjs-dist is ${installed})`);
}
const workerHead = readFileSync(COMMITTED_WORKER, "utf8").slice(0, 131_072);
const match = workerHead.match(/pdfjsVersion\s*=\s*["']?(\d+(?:\.\d+)*)["']?/);
if (!match?.[1]) {
  fail(
    `could not extract an embedded version from public/pdf.worker.min.mjs ` +
      `(installed pdfjs-dist is ${installed}); the stamp format may have changed — ` +
      `re-copying the worker is the safe fix`,
  );
}
const workerVersion = match[1];

/* ---- 3. Compare. ----------------------------------------------------- */
if (workerVersion === installed) {
  console.log(`pdf worker OK: ${workerVersion} == ${installed}`);
  process.exit(0);
}
fail(
  `public/pdf.worker.min.mjs embeds pdf.js ${workerVersion} but pdfjs-dist resolved to ${installed}`,
);
