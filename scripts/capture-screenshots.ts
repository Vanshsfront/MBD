// scripts/capture-screenshots.ts
//
// Auto-captures the 16 PNGs that go into handoff/design/screenshots/ so the
// design bundle stays self-contained without you taking screenshots by hand.
//
// Pre-reqs (one-time per machine):
//     npm install
//     npx playwright install chromium
//
// To run:
//     # in one terminal:   npm run dev
//     # in another:        npm run capture-screenshots
//
// What it does:
//   1. Pings localhost:3000 to confirm next dev is up
//   2. Looks up the demo patient (COL-MBD-DEMO) via Prisma so /patients/{id}
//      URLs work
//   3. Mints a temporary IntakeToken so the public /intake/[token] page has
//      something real to render; deleted in the finally block
//   4. Launches headless Chromium, authenticates once as Owner via NextAuth
//      callback, saves storageState for reuse across authed routes
//   5. Iterates ROUTES × VIEWPORTS, writes PNGs to handoff/design/screenshots/
//
// Output PNGs are full-page screenshots. Long pages produce tall images on
// the mobile viewport — that's intentional; Claude Design wants the whole
// content, not the viewport-clipped version.

import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
// Handoff bundle lives in the sibling mbd-docs/ folder (kept outside the
// main repo for cleanliness). The script auto-creates the path if missing.
const OUT_DIR = resolve(REPO_ROOT, "..", "mbd-docs", "handoff", "design", "screenshots");
const AUTH_STATE = join(__dirname, ".auth-state.json");

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const OWNER_EMAIL = "marazban@mbd.in";
const OWNER_PASSWORD = "mbd2026";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
};

// Build the route list dynamically (some entries need the demo patient id +
// a freshly-minted token) inside captureAll().
type RouteSpec = {
  slug: string;
  url: string;
  authenticated: boolean;
  // Optional: explicit selector to wait for before screenshotting. Falls back
  // to networkidle + a 600ms settle.
  waitFor?: string;
};

async function main() {
  // ── 1. Sanity check: dev server up ───────────────────────────────────
  try {
    const r = await fetch(`${BASE_URL}/login`, { method: "HEAD" });
    if (!r.ok) {
      console.error(
        `dev server at ${BASE_URL} responded ${r.status}; expected 200. Is next dev running?`,
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(
      `Couldn't reach ${BASE_URL}. Start the dev server in another terminal: npm run dev`,
    );
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  console.log(`✓ dev server up at ${BASE_URL}`);

  // ── 2. Resolve demo patient via Prisma ───────────────────────────────
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set (use --env-file=.env).");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  const demo = await prisma.client.findFirst({
    where: { clientCode: "COL-MBD-DEMO" },
    select: { id: true },
  });
  if (!demo) {
    console.error(
      "Demo patient COL-MBD-DEMO not found. Run `npm run db:seed` and try again.",
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`✓ demo patient resolved (${demo.id})`);

  // ── 3. Mint a temporary intake token ─────────────────────────────────
  // Owner is the createdBy for visibility; centre comes from any active row.
  const owner = await prisma.staff.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, centreId: true },
  });
  if (!owner) {
    console.error(`Owner ${OWNER_EMAIL} not found; run db:seed.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const token = await prisma.intakeToken.create({
    data: {
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: "PENDING",
      label: "auto-capture",
      createdById: owner.id,
      centreId: owner.centreId,
    },
    select: { id: true, token: true },
  });
  console.log(`✓ minted temp intake token (${token.token.slice(0, 8)}…)`);

  // ── 4. Output dir ────────────────────────────────────────────────────
  await mkdir(OUT_DIR, { recursive: true });

  // ── 5. Launch Chromium + auth ────────────────────────────────────────
  const browser: Browser = await chromium.launch({ headless: true });
  let exitCode = 0;
  try {
    const authContext = await browser.newContext({ baseURL: BASE_URL });
    await login(authContext);
    await authContext.storageState({ path: AUTH_STATE });
    await authContext.close();
    console.log(`✓ authenticated as ${OWNER_EMAIL}`);

    // ── 6. Route × viewport matrix ─────────────────────────────────────
    const routes: RouteSpec[] = [
      { slug: "login", url: "/login", authenticated: false, waitFor: "form" },
      {
        slug: "dashboard-overview",
        url: "/dashboard",
        authenticated: true,
        waitFor: "h1",
      },
      {
        slug: "intake-staff",
        url: "/dashboard/intake",
        authenticated: true,
        waitFor: "h1",
      },
      {
        slug: "assign",
        url: "/dashboard/assign",
        authenticated: true,
        waitFor: "h1",
      },
      {
        slug: "patient-detail",
        url: `/dashboard/patients/${demo.id}`,
        authenticated: true,
        waitFor: "h1",
      },
      {
        slug: "clinical-record",
        url: `/dashboard/patients/${demo.id}/clinical`,
        authenticated: true,
        waitFor: "h1",
      },
      {
        slug: "calendar",
        url: "/dashboard/calendar",
        authenticated: true,
        waitFor: ".fc, h1",
      },
      {
        slug: "invoice-new",
        url: "/dashboard/billing/invoices/new",
        authenticated: true,
        waitFor: "form",
      },
      {
        slug: "mis",
        url: "/dashboard/reports/mis",
        authenticated: true,
        waitFor: "h1",
      },
      {
        slug: "intake-patient",
        url: `/intake/${token.token}`,
        authenticated: false,
        waitFor: "h1",
      },
    ];

    const authedContext = await browser.newContext({
      baseURL: BASE_URL,
      storageState: AUTH_STATE,
    });
    const publicContext = await browser.newContext({ baseURL: BASE_URL });

    let captured = 0;
    for (const route of routes) {
      const context = route.authenticated ? authedContext : publicContext;
      for (const [vp, size] of Object.entries(VIEWPORTS)) {
        const filename = `${route.slug}-${vp}.png`;
        const outPath = join(OUT_DIR, filename);
        const page = await context.newPage();
        try {
          await page.setViewportSize(size);
          await page.goto(route.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          // networkidle is best-effort; some pages keep open websockets.
          try {
            await page.waitForLoadState("networkidle", { timeout: 8_000 });
          } catch {
            // ignore — proceed with the explicit selector wait below
          }
          if (route.waitFor) {
            try {
              await page.waitForSelector(route.waitFor, { timeout: 6_000 });
            } catch {
              console.warn(
                `  ${filename}: selector "${route.waitFor}" not found — capturing anyway`,
              );
            }
          }
          // Final settle for fonts / late paint
          await page.waitForTimeout(400);
          await page.screenshot({ path: outPath, fullPage: true });
          captured++;
          console.log(`  ✓ ${filename}`);
        } catch (err) {
          console.error(
            `  ✗ ${filename}: ${err instanceof Error ? err.message : err}`,
          );
          exitCode = 2;
        } finally {
          await page.close();
        }
      }
    }

    await authedContext.close();
    await publicContext.close();

    console.log(`\nCaptured ${captured} / ${routes.length * 2} screenshots → ${OUT_DIR}`);
  } finally {
    await browser.close();
    // ── 7. Cleanup ─────────────────────────────────────────────────────
    try {
      await prisma.intakeToken.delete({ where: { id: token.id } });
      console.log("✓ cleaned up temp intake token");
    } catch (err) {
      console.warn(
        `Couldn't delete temp intake token ${token.token}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
    // The auth-state file holds a session cookie — clear it.
    try {
      await rm(AUTH_STATE, { force: true });
    } catch {
      // ignore
    }
    await prisma.$disconnect();
  }

  process.exit(exitCode);
}

async function login(context: BrowserContext) {
  // POST credentials via NextAuth's credentials callback. Uses the same
  // pattern I used when debugging the login flow earlier in the session.
  const csrfRes = await context.request.get(`${BASE_URL}/api/auth/csrf`);
  if (!csrfRes.ok()) {
    throw new Error(`csrf endpoint returned ${csrfRes.status()}`);
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const signinRes = await context.request.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    {
      form: {
        csrfToken,
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        callbackUrl: `${BASE_URL}/dashboard`,
        json: "true",
      },
      maxRedirects: 0,
      failOnStatusCode: false,
    },
  );
  // NextAuth returns 200 with a JSON body on success; a real redirect
  // (302) also indicates success. Anything else is auth failure.
  if (signinRes.status() >= 400) {
    const body = await signinRes.text();
    throw new Error(
      `signin returned ${signinRes.status()}: ${body.slice(0, 200)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
