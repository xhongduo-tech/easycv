import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    env: {} as Record<string, string>,
    session: null as null | { kind: "user" | "guest"; userId: string },
    ownsResume: true,
    online: true,
  };
  const db = {
    prepare: vi.fn((sql: string) => {
      const query = {
        bind: vi.fn(() => query),
        first: vi.fn(async () => sql.includes("agent_runtime_state")
          ? state.online ? { last_seen_at: new Date().toISOString() } : null
          : state.ownsResume ? { id: "resume" } : null),
        all: vi.fn(async () => ({ results: [] })),
      };
      return query;
    }),
  };
  return {
    state, db, ensureDatabase: vi.fn(async () => {}),
    createAgentJob: vi.fn(async () => ({ id: "created-job", status: "queued" })),
    claimAgentJob: vi.fn(async () => null),
    heartbeatAgentJob: vi.fn(async () => true),
    finishAgentJob: vi.fn(async () => ({ accepted: true })),
  };
});

vi.mock("cloudflare:workers", () => ({ env: mocks.state.env }));
vi.mock("@/../db", () => ({
  ensureDatabase: mocks.ensureDatabase,
  getDatabase: () => mocks.db,
  getExistingSession: async () => mocks.state.session,
  SessionRateLimitError: class SessionRateLimitError extends Error {},
}));
vi.mock("@/lib/agent-jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-jobs")>()),
  createAgentJob: mocks.createAgentJob,
  claimAgentJob: mocks.claimAgentJob,
  heartbeatAgentJob: mocks.heartbeatAgentJob,
  finishAgentJob: mocks.finishAgentJob,
}));

import { agentJobEndpoint, agentJobsEndpoint, internalAgentEndpoint } from "@/lib/agent-api";

const resumeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const leaseToken = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const secret = "runner-secret-never-visible-to-browser-12345";
const createBody = { resumeId, expectedRevision: 1, expectedBriefRevision: 0, requestId: leaseToken, consent: true };
const usage = { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20, costMicros: 300, modelCalls: 1 };

function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://jianji.example${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.state.env)) delete mocks.state.env[key];
  Object.assign(mocks.state.env, {
    CODEX_AGENT_ENABLED: "true", CODEX_MODEL: "provisioned-model", CODEX_RUNNER_SECRET: secret,
    CODEX_JOB_BUDGET_MICROS: "100000", CODEX_DAILY_BUDGET_MICROS: "1000000",
    OPENAI_API_KEY: "never-a-public-runtime-field",
  });
  mocks.state.session = { kind: "user", userId: "user-1" };
  mocks.state.ownsResume = true;
  mocks.state.online = true;
});

describe("public Agent API boundary", () => {
  it("requires a session before reading jobs", async () => {
    mocks.state.session = null;
    const response = await agentJobsEndpoint(request(`/api/agent-jobs?resumeId=${resumeId}`));
    expect(response.status).toBe(401);
    expect(mocks.db.prepare).not.toHaveBeenCalled();
  });

  it("does not list another user's resume jobs", async () => {
    mocks.state.ownsResume = false;
    const response = await agentJobsEndpoint(request(`/api/agent-jobs?resumeId=${resumeId}`));
    expect(response.status).toBe(404);
    expect(mocks.db.prepare.mock.calls.some(([sql]) => sql.includes("agent_jobs"))).toBe(false);
  });

  it("rejects cross-origin writes before database work", async () => {
    const response = await agentJobsEndpoint(request("/api/agent-jobs", createBody, { origin: "https://attacker.invalid" }));
    expect(response.status).toBe(403);
    expect(mocks.ensureDatabase).not.toHaveBeenCalled();
    expect(mocks.createAgentJob).not.toHaveBeenCalled();
  });

  it("requires a full account for paid-provider execution", async () => {
    mocks.state.session = { kind: "guest", userId: "guest-1" };
    const response = await agentJobsEndpoint(request("/api/agent-jobs", createBody));
    expect(response.status).toBe(403);
    expect(mocks.createAgentJob).not.toHaveBeenCalled();
  });

  it.each(["unconfigured", "offline"])("does not create jobs when %s", async (mode) => {
    if (mode === "unconfigured") mocks.state.env.CODEX_AGENT_ENABLED = "false";
    else mocks.state.online = false;
    const response = await agentJobsEndpoint(request("/api/agent-jobs", createBody));
    expect(response.status).toBe(503);
    expect(mocks.createAgentJob).not.toHaveBeenCalled();
  });

  it("requires explicit material processing consent", async () => {
    const response = await agentJobsEndpoint(request("/api/agent-jobs", { ...createBody, consent: false }));
    expect(response.status).toBe(422);
    expect(mocks.createAgentJob).not.toHaveBeenCalled();
  });

  it("returns an asynchronous job after forwarding revision and owner checks", async () => {
    const response = await agentJobsEndpoint(request("/api/agent-jobs", createBody));
    expect(response.status).toBe(202);
    expect(mocks.createAgentJob).toHaveBeenCalledWith(mocks.db, "user-1", expect.objectContaining({ model: "provisioned-model" }), createBody);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns only public availability and never operational credentials", async () => {
    const response = await agentJobsEndpoint(request(`/api/agent-jobs?resumeId=${resumeId}`));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(secret);
    expect(text).not.toContain("never-a-public-runtime-field");
    expect(text).not.toContain("provisioned-model");
    expect(JSON.parse(text).runtime).toMatchObject({ enabled: true, billingMode: "sponsored-preview" });
  });

  it("enforces cross-origin protection on job actions too", async () => {
    const response = await agentJobEndpoint(request(`/api/agent-jobs/${resumeId}/cancel`, { expectedVersion: 1 }, { origin: "https://attacker.invalid" }), resumeId, "cancel");
    expect(response.status).toBe(403);
    expect(mocks.ensureDatabase).not.toHaveBeenCalled();
  });
});

describe("internal Agent API boundary", () => {
  it("requires its dedicated secret before any database work", async () => {
    const response = await internalAgentEndpoint(request("/api/internal/agent-jobs/claim", { workerId: "runner-1", model: "provisioned-model" }, { authorization: "Bearer wrong-secret" }), "claim");
    expect(response.status).toBe(401);
    expect(mocks.ensureDatabase).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(secret);
  });

  it("rejects browser-origin use even with valid credentials", async () => {
    const response = await internalAgentEndpoint(request("/api/internal/agent-jobs/claim", { workerId: "runner-1", model: "provisioned-model" }, { authorization: `Bearer ${secret}`, origin: "https://jianji.example" }), "claim");
    expect(response.status).toBe(403);
    expect(mocks.ensureDatabase).not.toHaveBeenCalled();
  });

  it.each([{}, { model: "different-model" }])("rejects missing or mismatched model handshake (%j)", async (extra) => {
    const response = await internalAgentEndpoint(request("/api/internal/agent-jobs/claim", { workerId: "runner-1", ...extra }, { authorization: `Bearer ${secret}` }), "claim");
    expect(response.status).toBe(422);
    expect(mocks.claimAgentJob).not.toHaveBeenCalled();
  });

  it("claims with a matching model independently of browser sessions", async () => {
    mocks.state.session = null;
    const response = await internalAgentEndpoint(request("/api/internal/agent-jobs/claim", { workerId: "runner-1", model: "provisioned-model" }, { authorization: `Bearer ${secret}` }), "claim");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ job: null });
    expect(mocks.claimAgentJob).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ model: "provisioned-model" }), "runner-1");
  });

  it("does not accept a completion without the lease fence", async () => {
    const response = await internalAgentEndpoint(request(`/api/internal/agent-jobs/${resumeId}/complete`, { attempt: 1, result: {}, usage }, { authorization: `Bearer ${secret}` }), "complete", resumeId);
    expect(response.status).toBe(422);
    expect(mocks.finishAgentJob).not.toHaveBeenCalled();
  });

  it("continues to settle explicit failed-run usage after feature disable", async () => {
    mocks.state.env.CODEX_AGENT_ENABLED = "false";
    const response = await internalAgentEndpoint(request(`/api/internal/agent-jobs/${resumeId}/fail`, { leaseToken, attempt: 1, code: "JOB_STOPPED_RESERVED", usage }, { authorization: `Bearer ${secret}` }), "fail", resumeId);
    expect(response.status).toBe(200);
    expect(mocks.finishAgentJob).toHaveBeenCalledWith(mocks.db, resumeId, leaseToken, 1, usage, null, "JOB_STOPPED_RESERVED");
  });
});
