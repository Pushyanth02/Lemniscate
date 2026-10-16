/**
 * Builds tests/browser/last-export.json — a REAL app-produced backup file
 * (same importParsed + buildBackup code paths the browser runs), used by
 * the E2E journey to exercise the in-app restore flow end to end.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { installLocalStorage } from "../helpers";

installLocalStorage();
Object.defineProperty(globalThis, "indexedDB", {
  value: new IDBFactory(),
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, "IDBKeyRange", {
  value: IDBKeyRange,
  configurable: true,
  writable: true,
});

const { importParsed } = await import("../../src/lib/data");
const { buildBackup } = await import("../../src/lib/backup");
const { ingestFile, verifyParsed } = await import("../../src/lib/engine");

const bookPath = join(import.meta.dir, "The Lamplighters Ledger.txt");
const bytes = await Bun.file(bookPath).bytes();
const file = new File([bytes], "The Lamplighters Ledger.txt", { type: "text/plain" });
const parsed = await ingestFile(file, 25);
const check = verifyParsed(parsed);
if (!check.ok) throw new Error(`fixture book failed validation: ${check.reason}`);
const row = await importParsed(file, parsed);
await new Promise<void>((resolve) => setTimeout(resolve, 100));
const backup = await buildBackup("full");
const json = backup.text;
const out = join(import.meta.dir, "last-export.json");
writeFileSync(out, json);
mkdirSync(join(import.meta.dir), { recursive: true });
console.log(
  `fixture written: ${out} (${json.length} bytes, ${backup.rows} rows, doc ${row.id} “${row.title}”)`,
);

process.exit(0);
