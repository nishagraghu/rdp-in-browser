FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app


COPY server ./server

WORKDIR /app/server

RUN npm install
RUN npx prisma generate
RUN npm run build

EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
