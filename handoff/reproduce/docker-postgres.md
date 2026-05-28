# Postgres in Docker

## First-time create

```bash
docker run -d --name mbd-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mbd \
  -p 5432:5432 \
  postgres:16
```

Confirm it's up:

```bash
docker ps --filter "name=mbd-postgres" --format "{{.Names}} | {{.Status}}"
# expect: mbd-postgres | Up X seconds
```

Confirm Postgres accepts connections:

```bash
docker exec mbd-postgres pg_isready -U postgres
# expect: /var/run/postgresql:5432 - accepting connections
```

If `pg_isready` returns "no response", wait 5 seconds and retry. Postgres takes a beat to initialise on first start.

## Subsequent starts

The container persists across reboots. To start it after stopping Docker / restarting the machine:

```bash
docker start mbd-postgres
```

To check whether it's running:

```bash
docker ps -a --filter "name=mbd-postgres" --format "{{.Names}} | {{.Status}}"
```

If status shows `Exited`, run `docker start mbd-postgres`.

## Connect with a SQL client

The credentials match what's in `env-template`:

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `mbd` |
| User | `postgres` |
| Password | `postgres` |

For ad-hoc queries via `psql`:

```bash
docker exec -e PGPASSWORD=postgres -it mbd-postgres psql -U postgres -d mbd
```

## Resetting the data

If you want to wipe everything and start clean:

```bash
docker stop mbd-postgres
docker rm mbd-postgres
# … then re-run the `docker run` command at the top
```

Or, less drastic, just re-run the Prisma reset (this is what the seed expects):

```bash
npm run db:reset    # drops + recreates + reseeds
```

## Production note

The `postgres:postgres` credentials are fine for local dev. In production:

- Use a strong, generated password
- Don't expose port 5432 to the internet — bind to `127.0.0.1` or a private network
- Configure WAL archiving + scheduled `pg_basebackup` snapshots
- The MBD audit log + MIS entries are append-only by design; backups are still essential
