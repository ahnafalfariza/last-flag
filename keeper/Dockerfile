# Last Flag keeper and bots. One image, two commands:
#
#   docker run --env-file .env lastflag-keeper                     keeper (default)
#   docker run --env-file .env lastflag-keeper node src/bots.ts    bots
#
# All config comes from env vars (see .env.example). No keys are baked into the image.
FROM node:24-slim

ARG PNPM_VERSION=10.33.0
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY src ./src

USER node
CMD ["node", "src/keeper.ts"]
