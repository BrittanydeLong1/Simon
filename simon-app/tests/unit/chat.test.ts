import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "@/app/api/chat/route";
import { defaultSettings } from "@/personality/config";
import { streamText } from "@/lib/streamText";
import { loadSettings, saveSettings } from "@/lib/storage";
import type { ChatRequest } from "@/types/chat";

const reply = "  leading  spaces\n\n```python\n    print('hello')\n```\n- parent\n  - child\nline  \nnext\t🙂  ";

for (const fullText of [reply, "", "   \n\t", "你好 👩‍💻\r\nnext"] ) {
  test(`streaming preserves exact response: ${JSON.stringify(fullText)}`, async () => {
    const chunks: string[] = [];
    await streamText(fullText, (partial) => chunks.push(partial));
    assert.equal(chunks.at(-1), fullText);
    assert.ok(chunks.every((chunk) => fullText.startsWith(chunk)));
  });
}

function payload(mode: ChatRequest["mode"]): ChatRequest {
  return {
    mode,
    settings: { ...defaultSettings, apiKey: "test-key" },
    messages: [{ id: "1", role: "user", content: "active chat", createdAt: "2026-10-10" }],
    memory: [{ id: "2", label: "Preference", value: "short replies", updatedAt: "2026-10-10" }],
  };
}

function request(data: unknown) {
  return new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(data) });
}

for (const provider of ["offline", "openai", "openrouter"] as const) {
  test(`${provider} routes correctly and preserves provider whitespace`, async (t) => {
    const input = payload(provider === "offline" ? "offline" : "online");
    if (provider !== "offline") input.settings.onlineProvider = provider;
    const calls: { url: string; init: RequestInit }[] = [];
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json(provider === "offline" ? { message: { content: reply } } : { choices: [{ message: { content: reply } }] });
    });
    const result = await POST(request(input));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { reply });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, provider === "offline" ? "http://127.0.0.1:11434/api/chat" : provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, provider === "offline" ? undefined : "Bearer test-key");
    const body = JSON.parse(calls[0].init.body as string);
    assert.match(body.messages[0].content, /Preference: short replies/);
    assert.match(body.messages[0].content, /Humor: moderate/);
    assert.deepEqual(body.messages.slice(1), [{ role: "user", content: "active chat" }]);
  });
}

test("invalid modes and missing online API keys never call a provider", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected provider call"); });
  const online = payload("online");
  online.settings.apiKey = "";
  for (const data of [online, { ...payload("offline"), mode: "invalid" }, { ...payload("offline"), mode: undefined }]) {
    assert.equal((await POST(request(data))).status, 400);
  }
  assert.equal(mock.mock.callCount(), 0);
});

test("provider errors do not fall back to another mode", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("failed", { status: 503 }));
  for (const mode of ["offline", "online"] as const) {
    const response = await POST(request(payload(mode)));
    assert.equal(response.status, 400);
    const error = await response.text();
    assert.match(error, mode === "offline" ? /Ollama\/local model/ : /selected provider/);
    assert.doesNotMatch(error, /base URL/);
  }
  assert.equal(mock.mock.callCount(), 2);
});

test("API keys are never saved or restored from settings storage", (t) => {
  const values = new Map<string, string>();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  t.after(() => {
    for (const [key, descriptor] of [["window", originalWindow], ["localStorage", originalStorage]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  saveSettings({ ...defaultSettings, apiKey: "private-secret" });
  assert.ok([...values.values()].every((value) => !value.includes("private-secret")));
  values.set("simon-settings-v1", JSON.stringify({ ...defaultSettings, apiKey: "old-secret" }));
  assert.equal(loadSettings().apiKey, "");
});
