FROM oven/bun:1.3.8-alpine

RUN apk add --no-cache libc6-compat

WORKDIR /workspace/apps/web
