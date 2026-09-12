FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node scripts/ensure-models.mjs && npm run build

ENV PORT=47321
ENV DATA_DIR=/data
ENV HOSTNAME=0.0.0.0
EXPOSE 47321

# Render inyecta PORT (p. ej. 10000). Local/Compose sigue en 47321.
CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-47321}"]
