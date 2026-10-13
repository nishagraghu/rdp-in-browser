FROM node:20-alpine AS build
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/ ./
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl libc6-compat wget
WORKDIR /app

ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save prisma@5.14.0

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY docker/backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /app/data /app/drives

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
