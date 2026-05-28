# Quickstart — fresh machine, working app in ~10 minutes

Assumes Node 20+, Docker Desktop, and LibreOffice are installed and on PATH. If they aren't, see the bottom of this file for install notes.

---

## 1. Get the code

```bash
git clone <your-remote-url> mbd-clinic-merged
cd mbd-clinic-merged
git checkout feat/merged-build   # working branch; main may be stale
```

## 2. Postgres in Docker

One-time:

```bash
docker run -d --name mbd-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mbd \
  -p 5432:5432 \
  postgres:16
```

Re-starts after that just:

```bash
docker start mbd-postgres
```

Verify it's up:

```bash
docker exec mbd-postgres pg_isready -U postgres
```

Full details: `docker-postgres.md`.

## 3. Env

Copy `env-template` (next to this file) to `.env` in the repo root. Fill in `AUTH_SECRET`:

```bash
npx auth secret
```

That command writes a strong random value. Paste it into `.env`. Adjust `SOFFICE_BIN` to your LibreOffice path:

- **Windows:** `C:\Program Files\LibreOffice\program\soffice.exe`
- **macOS:** `/Applications/LibreOffice.app/Contents/MacOS/soffice`
- **Linux:** `/usr/bin/soffice` or `which soffice`

Leave `NEXT_PUBLIC_SHOW_SEED_HINT` blank in production. Set it to `true` only on your local dev box if you want the `mbd2026` hint on the login screen.

## 4. Install + generate + push + seed

```bash
npm install
npx prisma generate
npm run db:push      # syncs the schema to the database
npm run db:seed      # inserts the canonical roster + demo data
```

If `db:push` fails with "can't reach database", the Postgres container isn't ready — `docker start mbd-postgres` and try again.

## 5. Run

```bash
npm run dev
```

Open `http://localhost:3000`. Log in as `marazban@mbd.in` / `mbd2026`. Find **Demo Patient — Walk-Through** (`COL-MBD-DEMO`) in the patients list.

## 6. Sanity check (optional but recommended)

Before you put real data in:

```bash
node scripts/run-smokes.mjs
```

Expect `[run-smokes] PASS ✅ in ~95s`. If anything fails, see `smoke-guide.md` for what each smoke covers and how to interpret the output.

---

## Reset / re-seed

If you mess up the local data and want a clean start:

```bash
npm run db:reset    # drops + recreates + reseeds
```

The seed is idempotent — re-running on a populated db doesn't dupe.

---

## Production deploy (single-box VPS)

When you're moving off local dev:

1. Install Node 20, Postgres 16, LibreOffice on the box
2. Use a real `AUTH_SECRET`, NOT the dev one
3. `NODE_ENV=production` — this OMITS the `dev@mbd.in` super-account from the seed (gate at `prisma/seed.ts`)
4. Set `UPLOAD_DIR` to `/var/lib/mbd/uploads/` (or similar absolute path)
5. Build + push + seed:
   ```bash
   npm ci
   npm run build
   npm run db:push
   npm run db:seed
   npm start
   ```
6. Nginx or Caddy in front for TLS termination + Let's Encrypt
7. Add the strict CSP (with per-request nonce) at the proxy — the in-app CSP is pragmatic v1; nonce belongs at the proxy

---

## Installing the prerequisites

**Node 20+:** Either via [nodejs.org](https://nodejs.org) or your version manager (`nvm`, `volta`, etc.).

**Docker Desktop:** [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/). On Windows, requires WSL2.

**LibreOffice:** [libreoffice.org/download](https://www.libreoffice.org/download/download-libreoffice/). Just for the headless `soffice` binary that converts DOCX → PDF.
