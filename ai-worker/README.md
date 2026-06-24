# Autable AI Worker

This worker keeps Codex auth and execution outside the Go server. The Go API sends the current script plus Autable context; the worker creates a temporary context workspace and asks Codex to return a full replacement for the current existing `workflow.js` or `form.js`.

Auth is intentionally process-local. When `CODEX_HOME` is not set, the worker creates a temporary Codex home under the OS temp directory and removes it on shutdown, so restarting loses ChatGPT/Codex login state.

If you set `CODEX_HOME` for local debugging, use a dedicated directory for this worker. The worker writes a minimal Codex config there so device-code auth uses file storage and turns run without interactive approval prompts.

## Local Development

```bash
cd ai-worker
npm install
npm run dev
```

Start Autable with:

```bash
AUTABLE_AI_WORKER_URL=http://127.0.0.1:3090 go run ./cmd/autable -config config.yml
```

The `config.yml` must also enable AI:

```yaml
ai:
  enabled: true
  worker_url: "http://127.0.0.1:3090"
```

The frontend AI button starts ChatGPT device-code login through `/api/ai/auth/start`. After signing in, generate a suggestion, review the full JavaScript content, click `Allow changes`, then use the existing Save button.

## Docker

```bash
docker build -t autable-ai-worker ./ai-worker
docker run --rm -p 3090:3090 autable-ai-worker
```

Point the Go server at `http://host.docker.internal:3090` for local Docker on macOS, or at the service name when running in a compose/network setup.
