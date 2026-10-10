#!/bin/sh
set -e

echo "Running database schema sync..."
npx prisma db push --skip-generate

echo "Preparing shared drive storage..."
mkdir -p /app/drives
chown 1000:1000 /app/drives 2>/dev/null || true
chmod 775 /app/drives 2>/dev/null || true

echo "Starting API server..."
exec node dist/index.js
