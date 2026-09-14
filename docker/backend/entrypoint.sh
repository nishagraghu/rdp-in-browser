#!/bin/sh
set -e

echo "Running database schema sync..."
npx prisma db push --skip-generate

echo "Starting API server..."
exec node dist/index.js
