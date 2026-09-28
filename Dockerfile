FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATABASE_URL=file:/app/data/fatboy-meseros.db TZ=America/Tijuana
RUN apk add --no-cache openssl tzdata && cp /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=dependencies /app/node_modules/prisma ./node_modules/prisma
COPY --from=dependencies /app/node_modules/@prisma ./node_modules/@prisma
RUN chmod +x /app/docker-entrypoint.sh && mkdir -p /app/data
EXPOSE 3000
VOLUME ["/app/data"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
