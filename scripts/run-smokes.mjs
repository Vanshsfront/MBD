#!/usr/bin/env node
// Cross-platform production-handoff gate (Windows-friendly replacement for
// run-all-smokes.sh). Runs every smoke via `node --env-file=.env --import tsx`
// so the FULL .env (incl. SOFFICE_BIN for DOCX->PDF) is loaded, then lint +
// build. Fails fast on first red.
//
// Usage:
//   node scripts/run-smokes.mjs              # all smokes + lint + build
//   node scripts/run-smokes.mjs --no-gate    # smokes only (skip lint + build)
//   node scripts/run-smokes.mjs smoke-prisma.ts smoke-billing.ts   # subset
import { spawnSync } from "node:child_process";

const ALL_SMOKES = [
  "smoke-prisma.ts",
  "smoke-templates.ts",
  "smoke-followups.ts",
  "smoke-consent.ts",
  "smoke-consent-on-behalf.ts",
  "smoke-clinical.ts",
  "smoke-change-requests.ts",
  "smoke-billing.ts",
  "smoke-multiclinic.ts",
  "smoke-admin.ts",
  "smoke-portal.ts",
  "smoke-acceptance.ts",
];

const args = process.argv.slice(2);
const noGate = args.includes("--no-gate");
const explicit = args.filter((a) => a.endsWith(".ts"));
const smokes = explicit.length > 0 ? explicit : ALL_SMOKES;

// node smokes run without a shell (process.execPath may contain spaces, e.g.
// "C:\Program Files\nodejs\node.exe"). npm needs a shell on Windows to resolve
// npm.cmd, so we opt in per-call.
function run(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
}

let pass = 0;
const start = Date.now();
for (const smoke of smokes) {
  console.log(`\n▸ ${smoke}`);
  const r = run(process.execPath, ["--env-file=.env", "--import", "tsx", `scripts/${smoke}`]);
  if (r.status !== 0) {
    console.error(`\n[run-smokes] FAIL: ${smoke} exited ${r.status}; halted.`);
    process.exit(1);
  }
  pass += 1;
}

if (!noGate) {
  console.log("\n▸ npm run lint");
  if (run("npm", ["run", "lint"], { shell: true }).status !== 0) {
    console.error("[run-smokes] FAIL: lint");
    process.exit(1);
  }
  console.log("\n▸ npm run build");
  if (run("npm", ["run", "build"], { shell: true }).status !== 0) {
    console.error("[run-smokes] FAIL: build");
    process.exit(1);
  }
}

const secs = Math.round((Date.now() - start) / 1000);
console.log(`\n[run-smokes] PASS ✅ (${pass} smoke scripts${noGate ? "" : " + lint + build"}) in ${secs}s`);
