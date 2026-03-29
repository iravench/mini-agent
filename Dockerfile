FROM ghcr.io/agent-infra/sandbox:latest

# fd-find: Ubuntu packages it as 'fdfind', symlink to 'fd' for consistency
RUN apt-get update \
    && apt-get install -y --no-install-recommends fd-find \
    && ln -sf "$(which fdfind)" /usr/local/bin/fd \
    && rm -rf /var/lib/apt/lists/*

# Bun: native TypeScript execution (replaces tsx)
RUN curl -fsSL https://bun.sh/install | bash \
    && cp /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -sf /usr/local/bin/bun /usr/local/bin/bunx

# Install mini-agent production dependencies (cached layer)
WORKDIR /opt/mini-agent
COPY package.json package-lock.json* ./
RUN bun install --production --frozen-lockfile 2>/dev/null || bun install --production

# Copy source code
COPY src/ src/
COPY tsconfig.json ./
RUN chmod -R a+rX /opt/mini-agent

# Do NOT create /home/gem or use VOLUME — the sandbox entrypoint
# creates the gem user with --create-home which owns that dir.
# Workspace is mounted at /workspace (outside home) to avoid conflicts.
