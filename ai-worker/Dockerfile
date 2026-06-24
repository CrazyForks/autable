FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates bubblewrap \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=3090
ENV CODEX_HOME=/tmp/autable-codex-home
EXPOSE 3090

CMD ["npm", "start"]
