FROM oven/bun:1.3.8-alpine

RUN apk add --no-cache libc6-compat

WORKDIR /workspace/apps/web

COPY apps/web/package.json apps/web/bun.lock ./
RUN bun install --frozen-lockfile

COPY apps/web ./
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "start"]
