import { describe, expect, it, vi } from "vitest";
import {
  createOpenAIAdvice,
  getOpenAIAdvisorConfig,
  shouldTripOpenAICircuit,
} from "@/lib/openai-advisor";
import { createStarterContent } from "@/lib/sample-data";

describe("OpenAI resume advisor adapter", () => {
  it("stays disabled until both server-side settings exist", () => {
    expect(getOpenAIAdvisorConfig({ OPENAI_API_KEY: "", OPENAI_MODEL: "gpt-test" })).toBeNull();
    expect(getOpenAIAdvisorConfig({ OPENAI_API_KEY: "secret", OPENAI_MODEL: "" })).toBeNull();
    expect(getOpenAIAdvisorConfig({ OPENAI_API_KEY: "secret", OPENAI_MODEL: "gpt-test" })).toEqual({
      apiKey: "secret",
      model: "gpt-test",
    });
  });

  it("uses structured outputs, disables response storage, and sends only the requested section", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        store: boolean;
        text: { format: { type: string; strict: boolean } };
        input: Array<{ content: Array<{ text: string }> }>;
      };
      const submitted = JSON.parse(body.input[0].content[0].text) as { resume: Record<string, unknown> };
      expect(body.store).toBe(false);
      expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
      expect(submitted.resume).toHaveProperty("experience");
      expect(submitted.resume).not.toHaveProperty("projects");
      return new Response(JSON.stringify({
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              score: 78,
              headline: "经历表达可以更具体",
              suggestions: [{ id: "scope", severity: "medium", title: "明确职责", detail: "说明个人负责的范围。" }],
              keywords: ["协作"],
              rewrite: "通过【真实方法】完成【真实任务】，结果待核实。",
            }),
          }],
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await createOpenAIAdvice({
      content: createStarterContent("career"),
      track: "career",
      targetName: "目标企业",
      section: "experience",
    }, { apiKey: "secret", model: "gpt-test" }, fetcher as typeof fetch);

    expect(result.score).toBe(78);
    expect(result.suggestions[0].title).toBe("明确职责");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("removes direct contact fields from whole-resume analysis", async () => {
    const content = createStarterContent("career");
    content.education[0].location = "PRIVATE_EDUCATION_LOCATION_SENTINEL";
    content.experience[0].location = "PRIVATE_EXPERIENCE_LOCATION_SENTINEL";
    content.projects[0].link = "https://private-project-link.invalid/sentinel";
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        input: Array<{ content: Array<{ text: string }> }>;
      };
      const submitted = JSON.parse(body.input[0].content[0].text) as {
        resume: { basics: Record<string, unknown> };
      };
      expect(submitted.resume.basics).toEqual({ headline: content.basics.headline });
      const serialized = JSON.stringify(submitted.resume);
      expect(serialized).not.toContain(content.basics.email);
      expect(serialized).not.toContain(content.basics.phone);
      expect(serialized).not.toContain(content.basics.website);
      expect(serialized).not.toContain("PRIVATE_EDUCATION_LOCATION_SENTINEL");
      expect(serialized).not.toContain("PRIVATE_EXPERIENCE_LOCATION_SENTINEL");
      expect(serialized).not.toContain("private-project-link.invalid");
      return new Response(JSON.stringify({
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              score: 80,
              headline: "结构清晰",
              suggestions: [{ id: "focus", severity: "low", title: "保持聚焦", detail: "继续围绕目标岗位组织事实。" }],
              keywords: ["目标"],
              rewrite: "基于已提供事实继续精炼。",
            }),
          }],
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    await createOpenAIAdvice({
      content,
      track: "career",
      targetName: "目标企业",
      section: "overview",
    }, { apiKey: "secret", model: "gpt-test" }, fetcher as typeof fetch);
  });

  it("propagates caller cancellation to the provider request", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const pending = createOpenAIAdvice({
      content: createStarterContent("career"),
      track: "career",
      targetName: "目标企业",
      section: "experience",
      signal: controller.signal,
    }, { apiKey: "secret", model: "gpt-test" }, fetcher as typeof fetch);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "OpenAIAdvisorError", kind: "cancelled" });
  });

  it("treats a content refusal as request-scoped rather than a provider outage", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{ type: "refusal", refusal: "Cannot assist with this request." }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const request = createOpenAIAdvice({
      content: createStarterContent("career"),
      track: "career",
      targetName: "目标企业",
      section: "experience",
    }, { apiKey: "secret", model: "gpt-test" }, fetcher as typeof fetch);
    const error = await request.catch((reason: unknown) => reason);
    expect(error).toMatchObject({ name: "OpenAIAdvisorError", kind: "refusal" });
    expect(shouldTripOpenAICircuit(error)).toBe(false);
  });

  it("treats a response-body network failure as a provider outage", async () => {
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.error(new TypeError("body network failure"));
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const request = createOpenAIAdvice({
      content: createStarterContent("career"),
      track: "career",
      targetName: "目标企业",
      section: "experience",
    }, { apiKey: "secret", model: "gpt-test" }, fetcher as typeof fetch);
    const error = await request.catch((reason: unknown) => reason);
    expect(error).toMatchObject({ name: "OpenAIAdvisorError", kind: "network" });
    expect(shouldTripOpenAICircuit(error)).toBe(true);
  });
});
