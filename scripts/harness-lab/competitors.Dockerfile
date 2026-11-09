# Prepared dependencies only: no API credentials, task solutions, or sessions.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv git ripgrep ca-certificates curl bash xz-utils procps sudo build-essential && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code@2.1.302 @earendil-works/pi-coding-agent@1.3.0 opencode-ai@1.19.3
RUN curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/v0.22.2/scripts/install.sh -o /tmp/install-hermes.sh && bash /tmp/install-hermes.sh --skip-setup --branch v0.22.2 && rm /tmp/install-hermes.sh
# Harbor's Pi/OpenCode adapters source this path; use the already-pinned image Node.
RUN mkdir -p /root/.nvm && printf '# Node provided by base image\n' > /root/.nvm/nvm.sh
ENV PATH="/root/.local/bin:${PATH}"
WORKDIR /app
