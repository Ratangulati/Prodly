# Prodly: one container serving the API and the built React app.
# An alternative to Vercel for hosts that run containers. Needs a Postgres database:
# pass POSTGRES_PRISMA_URL and DATABASE_URL_UNPOOLED (plus GEMINI_API_KEY) at runtime.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY server/prisma server/prisma
RUN npm ci --ignore-scripts && npx --workspace server prisma generate

COPY . .
RUN npm run build --workspace client && npm run build --workspace server


FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8080

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh
EXPOSE 8080
CMD ["./docker-entrypoint.sh"]
