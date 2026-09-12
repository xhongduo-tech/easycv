FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY src ./src
COPY test ./test
RUN chmod 0555 /app/src/launcher.mjs \
    && touch /app/.jianji-runner-image \
    && groupadd --gid 10001 agent \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin agent \
    && mkdir -p /var/lib/jianji-jobs \
    && chmod 0711 /var/lib/jianji-jobs \
    && node --test test/*.test.mjs \
    && node src/verify-cli.mjs
ENV NODE_ENV=production CODEX_RUNNER_ISOLATION=container-v1
# Root is the trusted credential supervisor. launcher.mjs drops the CLI to UID/GID 10001.
# Runtime must set the capabilities, no-new-privileges, read-only root and tmpfs described in README.
USER root
CMD ["node", "src/index.mjs"]
