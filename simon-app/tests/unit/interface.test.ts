import assert from "node:assert/strict";
import { before, afterEach, test } from "node:test";
import { createElement, act } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ChatShell } from "@/components/ChatShell";
import { defaultSettings } from "@/personality/config";
import type { ChatRequest } from "@/types/chat";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

let ui: typeof import("@testing-library/react");
before(async () => { ui = await import("@testing-library/react"); });
afterEach(() => { ui.cleanup(); localStorage.clear(); });

function archive() {
  return JSON.parse(localStorage.getItem("simon-conversations-v1")!);
}

async function mount() {
  const view = ui.render(createElement(ChatShell));
  await ui.waitFor(() => assert.ok(localStorage.getItem("simon-settings-v1")));
  return view;
}

test("cross-mode sends are blocked and each mode retains its own history", async (t) => {
  const sent: ChatRequest[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string));
    return Response.json({ reply: "Reply" });
  });
  const view = await mount();
  const composer = view.getByLabelText("Message Simon", { exact: true });
  const send = () => ui.fireEvent.click(view.getByRole("button", { name: /^Send$/ }));
  ui.fireEvent.change(composer, { target: { value: "PRIVATE OFFLINE TRANSCRIPT" } });
  send();
  await ui.waitFor(() => assert.equal(archive()[0].messages.at(-1).content, "Reply"));
  assert.equal(sent[0].mode, "offline");
  ui.fireEvent.change(view.getByLabelText("Mode", { exact: true }), { target: { value: "online" } });
  ui.fireEvent.change(composer, { target: { value: "Do not send across modes" } });
  assert.equal((view.getByRole("button", { name: /^Send$/ }) as HTMLButtonElement).disabled, true);
  send();
  assert.equal(sent.length, 1);
  assert.equal(archive()[0].mode, "offline");
  ui.fireEvent.click(view.getAllByRole("button", { name: /^\+ New chat$/ })[0]);
  ui.fireEvent.change(composer, { target: { value: "ONLINE ONLY" } });
  send();
  await ui.waitFor(() => assert.equal(archive()[0].messages.at(-1).content, "Reply"));
  assert.equal(sent.length, 2);
  assert.equal(sent[1].mode, "online");
  assert.ok(!JSON.stringify(sent[1]).includes("PRIVATE OFFLINE TRANSCRIPT"));
  ui.fireEvent.click(view.getByRole("button", { name: /PRIVATE OFFLINE TRANSCRIPT/ }));
  ui.fireEvent.change(composer, { target: { value: "Still offline" } });
  send();
  assert.equal(sent.length, 2);
  ui.fireEvent.change(view.getByLabelText("Mode", { exact: true }), { target: { value: "offline" } });
  send();
  await ui.waitFor(() => assert.equal(sent.length, 3));
  assert.equal(sent[2].mode, "offline");
  assert.ok(!JSON.stringify(sent[2]).includes("ONLINE ONLY"));
  await ui.waitFor(() => assert.equal(archive().find((chat: { mode: string }) => chat.mode === "offline").messages.at(-1).content, "Reply"));
});

test("streaming persists once, keeps manual titles, and renders Markdown", async (t) => {
  const reply = "  # Heading\n\n- parent\n  - child\n\n```python\n    print('hello')\n```\n\nline  \nnext  ";
  t.mock.method(globalThis, "fetch", async () => Response.json({ reply }));
  const view = await mount();
  ui.fireEvent.change(view.getByLabelText("Conversation title"), { target: { value: "Custom title" } });
  const original = dom.window.Storage.prototype.setItem;
  let writes = 0;
  t.mock.method(dom.window.Storage.prototype, "setItem", function (this: Storage, key: string, value: string) {
    if (key === "simon-conversations-v1") writes++;
    original.call(this, key, value);
  });
  ui.fireEvent.change(view.getByLabelText("Message Simon", { exact: true }), { target: { value: "Hello" } });
  ui.fireEvent.click(view.getByRole("button", { name: /^Send$/ }));
  await ui.waitFor(() => assert.equal(archive()[0].messages.at(-1).content, reply), { timeout: 5000 });
  assert.equal(writes, 1);
  assert.equal(archive()[0].title, "Custom title");
  assert.ok(view.getByRole("heading", { name: "Heading" }));
  assert.equal(view.container.querySelector("pre code")?.textContent, "    print('hello')\n");
  assert.equal(view.container.querySelectorAll("ul ul").length, 1);
});

test("accessible memory labels, editing, deletion, and theme controls remain functional", async () => {
  const view = await mount();
  ui.fireEvent.click(view.getByRole("button", { name: /^Memory$/ }));
  ui.fireEvent.click(view.getByRole("button", { name: "+ Add memory item" }));
  ui.fireEvent.change(view.getByLabelText("Memory label", { exact: true }), { target: { value: "Pet" } });
  ui.fireEvent.change(view.getByLabelText("Remembered detail", { exact: true }), { target: { value: "Cockatoo" } });
  assert.equal((view.getByLabelText("Memory label", { exact: true }) as HTMLInputElement).value, "Pet");
  assert.equal(JSON.parse(localStorage.getItem("simon-memory-v1")!)[0].value, "Cockatoo");
  ui.fireEvent.click(view.getByRole("button", { name: /^Delete$/ }));
  assert.deepEqual(JSON.parse(localStorage.getItem("simon-memory-v1")!), []);
  ui.fireEvent.click(view.getByRole("button", { name: "Theme: dark" }));
  assert.equal(document.documentElement.classList.contains("dark"), false);
  ui.fireEvent.click(view.getByRole("button", { name: "Theme: light" }));
  assert.equal(document.documentElement.classList.contains("dark"), true);
});

test("mobile Chats menu creates and reopens conversations", async () => {
  const view = await mount();
  ui.fireEvent.change(view.getByLabelText("Conversation title"), { target: { value: "Original chat" } });
  ui.fireEvent.click(view.getByRole("button", { name: /^Chats$/ }));
  let menu = view.getByRole("navigation", { name: "Conversations" });
  ui.fireEvent.click(ui.within(menu).getByRole("button", { name: /^\+ New chat$/ }));
  assert.equal((view.getByLabelText("Conversation title") as HTMLInputElement).value, "New conversation");
  ui.fireEvent.click(view.getByRole("button", { name: /^Chats$/ }));
  menu = view.getByRole("navigation", { name: "Conversations" });
  ui.fireEvent.click(ui.within(menu).getByRole("button", { name: /Original chat/ }));
  assert.equal((view.getByLabelText("Conversation title") as HTMLInputElement).value, "Original chat");
});

test("hydration restores saved data without overwriting it or reporting a mismatch", async () => {
  const saved = [{ id: "saved", title: "Saved title", mode: "offline", messages: [], createdAt: "2026-10-10", updatedAt: "2026-10-10" }];
  localStorage.setItem("simon-conversations-v1", JSON.stringify(saved));
  localStorage.setItem("simon-settings-v1", JSON.stringify({ ...defaultSettings, theme: "light" }));
  const container = document.createElement("div");
  container.innerHTML = renderToString(createElement(ChatShell));
  document.body.appendChild(container);
  const errors: unknown[] = [];
  const { hydrateRoot } = await import("react-dom/client");
  let root: ReturnType<typeof hydrateRoot>;
  await act(async () => { root = hydrateRoot(container, createElement(ChatShell), { onRecoverableError: (error) => errors.push(error) }); });
  await ui.waitFor(() => assert.equal((container.querySelector('[aria-label="Conversation title"]') as HTMLInputElement).value, "Saved title"));
  assert.deepEqual(archive(), saved);
  assert.deepEqual(errors, []);
  assert.equal(document.documentElement.classList.contains("dark"), false);
  await act(async () => root.unmount());
  container.remove();
});
