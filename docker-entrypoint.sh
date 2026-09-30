#!/bin/sh
set -e
cd /app/server

# Bring the database schema up to date on every start (safe to re-run)
npx prisma migrate deploy

# Demo workspace and login only when explicitly requested
if [ "$SEED_DEMO" = "true" ]; then
  npx tsx prisma/seed.ts
fi

exec node dist/index.js
