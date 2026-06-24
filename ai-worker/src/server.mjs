import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

const port = Number(process.env.PORT || process.env.AUTABLE_AI_WORKER_PORT || 3090);
const codexBin = process.env.CODEX_BIN || "codex";
const codexModel = process.env.CODEX_MODEL || "";
const turnTimeoutMs = Number(process.env.AUTABLE_AI_TURN_TIMEOUT_MS || 120000);
const configuredCodexHome = process.env.CODEX_HOME?.trim();
const workerTempRoot = await mkdtemp(path.join(os.tmpdir(), "autable-ai-worker-"));
const codexHome = configuredCodexHome || path.join(workerTempRoot, "codex-home");

await mkdir(codexHome, { recursive: true });
await writeFile(
  path.join(codexHome, "config.toml"),
  [
    'cli_auth_credentials_store = "file"',
    'approval_policy = "never"',
    'sandbox_mode = "danger-full-access"',
    ""
  ].join("\n")
).catch(() => undefined);

let appServer;

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      return sendJSON(response, 200, { ok: true });
    }
    if (request.method === "GET" && request.url === "/auth/status") {
      return sendJSON(response, 200, await authStatus());
    }
    if (request.method === "POST" && request.url === "/auth/start") {
      return sendJSON(response, 200, await startAuth());
    }
    if (request.method === "GET" && request.url === "/options") {
      return sendJSON(response, 200, await aiOptions());
    }
    if (request.method === "POST" && request.url === "/suggest-script") {
      const body = await readJSON(request);
      return sendJSON(response, 200, await suggestScript(body));
    }
    sendJSON(response, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    sendJSON(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    appServer?.stop();
    await rm(workerTempRoot, { recursive: true, force: true }).catch(() => undefined);
    process.exit(0);
  });
}

async function authStatus() {
  const result = await appServer.call("account/read", { refreshToken: true });
  const account = result?.account;
  const requiresOpenaiAuth = Boolean(result?.requiresOpenaiAuth);
  return {
    authenticated: Boolean(account),
    account: account ? account.type || "chatgpt" : "",
    message: account
      ? ""
      : requiresOpenaiAuth
        ? "OpenAI authentication is required."
        : ""
  };
}

async function startAuth() {
  const result = await appServer.call("account/login/start", { type: "chatgptDeviceCode" });
  return {
    type: result?.type || "chatgptDeviceCode",
    login_id: result?.loginId || "",
    verification_url: result?.verificationUrl || "",
    user_code: result?.userCode || "",
    auth_url: result?.authUrl || "",
    message: result?.message || ""
  };
}

async function aiOptions() {
  const result = await appServer.call("model/list");
  const models = Array.isArray(result?.data) ? result.data : [];
  return {
    models: models
      .filter((model) => !model.hidden)
      .map((model) => ({
        id: model.id || model.model || "",
        model: model.model || model.id || "",
        display_name: model.displayName || model.id || model.model || "",
        description: model.description || "",
        supported_reasoning_efforts: (model.supportedReasoningEfforts || []).map((effort) => ({
          reasoning_effort: effort.reasoningEffort || "",
          description: effort.description || ""
        })).filter((effort) => effort.reasoning_effort),
        default_reasoning_effort: model.defaultReasoningEffort || "",
        is_default: Boolean(model.isDefault)
      }))
      .filter((model) => model.id)
  };
}

async function suggestScript(request) {
  validateSuggestRequest(request);
  console.log(`ai suggest start kind=${request.kind} resource=${request.resource_id} name=${request.name || ""}`);
  const status = await authStatus();
  if (!status.authenticated) {
    throw new Error("ChatGPT/Codex is not authenticated. Click ChatGPT login first, finish device login, then try again.");
  }
  const workspace = await createContextWorkspace(request);
  const targetPath = request.kind === "workflow" ? "workflows/current.js" : "forms/current.js";
  const prompt = buildPrompt(request, targetPath);
  const finalResponse = await runCodexTurn(workspace, prompt, {
    model: request.model || codexModel,
    reasoningEffort: request.reasoning_effort || ""
  });
  const fromJSON = parseSuggestedContent(finalResponse);
  if (fromJSON) {
    console.log(`ai suggest completed kind=${request.kind} resource=${request.resource_id}`);
    return fromJSON;
  }
  const generated = await readFile(path.join(workspace, targetPath), "utf8").catch(() => "");
  console.log(`ai suggest completed without structured response kind=${request.kind} resource=${request.resource_id}`);
  return {
    content: generated || request.script,
    summary: "Codex did not return a structured JSON response; using the temporary workspace file content.",
    diagnostics: finalResponse ? [finalResponse.slice(0, 2000)] : []
  };
}

async function runCodexTurn(cwd, prompt, options = {}) {
  const threadParams = options.model ? { model: options.model } : {};
  const thread = await appServer.call("thread/start", threadParams);
  const threadId = thread?.thread?.id;
  if (!threadId) {
    throw new Error("Codex app-server did not return a thread id");
  }
  if (options.reasoningEffort) {
    await appServer.call("thread/settings/update", {
      threadId,
      effort: options.reasoningEffort
    });
  }
  return appServer.startTurnAndCollect({
    threadId,
    cwd,
    input: [{ type: "text", text: prompt }]
  });
}

async function createContextWorkspace(request) {
  const root = await mkdtemp(path.join(workerTempRoot, "request-"));
  await mkdir(path.join(root, "metadata"), { recursive: true });
  await mkdir(path.join(root, "workflows"), { recursive: true });
  await mkdir(path.join(root, "forms"), { recursive: true });
  await mkdir(path.join(root, "docs", "workflow-nodes"), { recursive: true });
  await mkdir(path.join(root, "docs", "autable"), { recursive: true });
  await writeFile(path.join(root, "metadata", "main.yml"), request.metadata_yaml || "");
  await writeFile(path.join(root, request.kind === "workflow" ? "workflows/current.js" : "forms/current.js"), request.script || "");

  for (const file of request.related_files || []) {
    const normalized = safeRelativePath(file.path || "related.js");
    const target = path.join(root, "related", normalized);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content || "");
  }
  for (const doc of request.autable_docs || []) {
    const target = path.join(root, "docs", "autable", safeFilename(doc.path || "doc.md"));
    await writeFile(target, doc.content || "");
  }
  for (const doc of request.workflow_docs || []) {
    const body = [
      `# ${doc.type}`,
      "",
      doc.display_name || "",
      "",
      doc.description || "",
      "",
      doc.documentation?.[request.language] || doc.documentation?.["zh-CN"] || doc.documentation?.["en-US"] || ""
    ].join("\n");
    await writeFile(path.join(root, "docs", "workflow-nodes", `${safeFilename(doc.type)}.md`), body);
  }
  return root;
}

function buildPrompt(request, targetPath) {
  return [
    "You are editing an Autable JavaScript script inside a temporary context workspace.",
    "Do not modify files in the real repository. Use the files in this temporary workspace only for context.",
    `Target kind: ${request.kind}`,
    `Target database: ${request.database_name}`,
    `Target resource name: ${request.name}`,
    `Target file in this workspace: ${targetPath}`,
    request.repository_path ? `Original repository path for context only: ${request.repository_path}` : "",
    "",
    "Repository context available in this workspace:",
    "- metadata/main.yml: table, view, and field definitions",
    "- docs/autable/*.md: Autable workflow/form reference",
    "- docs/workflow-nodes/*.md: node documentation and JS type comments",
    "- related/**: other workflow/form scripts from the same database",
    "",
    "Rules:",
    "- Return only JSON, with no Markdown fence.",
    "- JSON shape: {\"content\":\"full new JavaScript file content\",\"summary\":\"short summary\",\"diagnostics\":[\"optional notes\"]}",
    "- content must be the full replacement for the current target file, not a patch.",
    "- Preserve useful existing function type comments and JSDoc comments.",
    "- Do not create, rename, delete, or reference changes to other workflow/form files.",
    "- Do not hard-code secrets.",
    "",
    "User request:",
    request.instruction
  ].filter(Boolean).join("\n");
}

function parseSuggestedContent(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (typeof parsed.content !== "string" || parsed.content.trim() === "") {
      return null;
    }
    return {
      content: parsed.content,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics.map(String) : []
    };
  } catch {
    return null;
  }
}

function validateSuggestRequest(request) {
  if (!["workflow", "form"].includes(request?.kind)) {
    throw new Error("kind must be workflow or form");
  }
  if (!request.resource_id) {
    throw new Error("resource_id is required");
  }
  if (typeof request.instruction !== "string" || request.instruction.trim() === "") {
    throw new Error("instruction is required");
  }
  if (typeof request.script !== "string") {
    throw new Error("script is required");
  }
  if (request.model !== undefined && typeof request.model !== "string") {
    throw new Error("model must be a string");
  }
  if (request.reasoning_effort !== undefined && typeof request.reasoning_effort !== "string") {
    throw new Error("reasoning_effort must be a string");
  }
}

async function readJSON(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function sendJSON(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function safeFilename(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "doc";
}

function safeRelativePath(value) {
  return String(value)
    .split(/[\\/]+/)
    .filter((part) => part && part !== "." && part !== "..")
    .map(safeFilename)
    .join("/");
}

class CodexAppServer {
  constructor({ command, env }) {
    this.command = command;
    this.env = env;
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.agentMessage = "";
    this.waitingTurns = [];
    this.ready = null;
  }

  async call(method, params = {}) {
    await this.ensureStarted();
    const id = this.nextId++;
    const payload = { method, id, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  async startTurnAndCollect(params) {
    this.agentMessage = "";
    const timeoutMs = turnTimeoutMs > 0 ? turnTimeoutMs : 120000;
    const completion = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rejectWaitingTurn(resolve, new Error(`Codex turn timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.waitingTurns.push({ resolve, reject, timeout });
    });
    await this.call("turn/start", params);
    return completion;
  }

  async ensureStarted() {
    if (this.ready) {
      return this.ready;
    }
    this.ready = this.start();
    return this.ready;
  }

  async start() {
    this.proc = spawn(this.command, ["app-server"], {
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      process.stderr.write(text);
      if (text.includes("401 Unauthorized")) {
        this.rejectAllTurns(new Error("ChatGPT/Codex is not authenticated. Click ChatGPT login first, finish device login, then try again."));
      }
    });
    this.proc.on("exit", (code, signal) => {
      const error = new Error(`codex app-server exited: ${code ?? signal}`);
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      for (const waiter of this.waitingTurns) {
        clearTimeout(waiter.timeout);
        waiter.reject(error);
      }
      this.waitingTurns = [];
      this.ready = null;
    });
    const rl = createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => this.handleLine(line));
    await this.initialize();
  }

  async initialize() {
    await this.rawCall("initialize", {
      clientInfo: {
        name: "autable_ai_worker",
        title: "Autable AI Worker",
        version: "0.1.0"
      },
      capabilities: {
        experimentalApi: true
      }
    });
    this.proc.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
  }

  async rawCall(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "Codex app-server request failed"));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method === "item/agentMessage/delta" && typeof message.params?.delta === "string") {
      this.agentMessage += message.params.delta;
    }
    if (message.method === "turn/completed") {
      const waiter = this.waitingTurns.shift();
      if (waiter) {
        clearTimeout(waiter.timeout);
        waiter.resolve(this.agentMessage);
      }
    }
  }

  rejectWaitingTurn(resolve, error) {
    const index = this.waitingTurns.findIndex((waiter) => waiter.resolve === resolve);
    if (index < 0) {
      return;
    }
    const [waiter] = this.waitingTurns.splice(index, 1);
    clearTimeout(waiter.timeout);
    waiter.reject(error);
  }

  rejectAllTurns(error) {
    for (const waiter of this.waitingTurns.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }

  stop() {
    this.proc?.kill();
  }
}

appServer = new CodexAppServer({
  command: codexBin,
  env: { ...process.env, CODEX_HOME: codexHome }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`autable ai worker listening on :${port}`);
  console.log(`CODEX_HOME=${codexHome}`);
});
