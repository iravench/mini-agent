FROM ghcr.io/agent-infra/sandbox:latest

# fd-find: Ubuntu packages it as 'fdfind', symlink to 'fd' for consistency
RUN apt-get update \
    && apt-get install -y --no-install-recommends fd-find \
    && ln -sf "$(which fdfind)" /usr/local/bin/fd \
    && rm -rf /var/lib/apt/lists/*

# tsx: TypeScript execution engine (no build step needed)
RUN npm i -g tsx

# Install mini-agent production dependencies (cached layer)
WORKDIR /opt/mini-agent
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source code
COPY src/ src/
COPY tsconfig.json ./
RUN chmod -R a+rX /opt/mini-agent

# Do NOT create /home/gem or use VOLUME — the sandbox entrypoint
# creates the gem user with --create-home which owns that dir.
# Workspace is mounted at /workspace (outside home) to avoid conflicts.
