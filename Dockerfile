FROM node:22.22.0-alpine

WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile --link-workspace-packages
RUN pnpm --filter backend build
RUN pnpm --filter web build

COPY scripts/railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
RUN chmod +x /usr/local/bin/railway-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["/usr/local/bin/railway-entrypoint.sh"]
