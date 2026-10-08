"use client";

import { useEffect, useMemo, useState } from "react";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { loadMemory, saveMemory } from "@/memory/storage";
import { loadConversations, loadSettings, saveConversations, saveSettings } from "@/lib/storage";
import { defaultSettings } from "@/personality/config";
import { getChatReply } from "@/services/clientChat";
import { AppSettings, ChatMessage, Conversation, MemoryItem } from "@/types/chat";

const starterMessage =
  "Before we build your setup, tell me your hardware first: CPU, RAM, GPU, storage, and Windows version. Then tell me what you want this assistant to do daily. I'll map out practical architecture + tradeoffs and costs, then we build step by step.";

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function createConversation(mode: AppSettings["mode"]): Conversation {
  const timestamp = now();
  return {
    id: id(),
    title: "New conversation",
    mode,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [
      {
        id: id(),
        role: "assistant",
        content: starterMessage,
        createdAt: timestamp,
      },
    ],
  };
}

function createBootstrapConversation(mode: AppSettings["mode"]): Conversation {
  return {
    id: `bootstrap-${mode}`,
    title: "New conversation",
    mode,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    messages: [
      {
        id: `bootstrap-message-${mode}`,
        role: "assistant",
        content: starterMessage,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
    ],
  };
}

function loadInitialData() {
  const loadedSettings = loadSettings();
  const loadedConversations = loadConversations();
  const conversations =
    loadedConversations.length > 0
      ? loadedConversations
      : [createBootstrapConversation(loadedSettings.mode)];

  return {
    settings: loadedSettings,
    conversations,
    activeId: conversations[0]?.id ?? "",
    memory: loadMemory(),
  };
}

function summarizeTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((m) => m.role === "user")?.content?.trim();
  if (!firstUser) return "New conversation";
  return firstUser.slice(0, 42);
}

function streamText(fullText: string, onChunk: (text: string) => void) {
  return new Promise<void>((resolve) => {
    const words = fullText.split(" ");
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      onChunk(words.slice(0, index).join(" "));
      if (index >= words.length) {
        clearInterval(timer);
        resolve();
      }
    }, 22);
  });
}

export function ChatShell() {
  const initialData = useMemo(() => loadInitialData(), []);
  const [settings, setSettings] = useState<AppSettings>(initialData.settings ?? defaultSettings);
  const [conversations, setConversations] = useState<Conversation[]>(initialData.conversations);
  const [activeId, setActiveId] = useState<string>(initialData.activeId);
  const [memory, setMemory] = useState<MemoryItem[]>(initialData.memory);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showSettings, setShowSettings] = useState(true);

  useEffect(() => {
    if (!conversations.length) return;
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveMemory(memory);
  }, [memory]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId],
  );

  const activeModeLabel = settings.mode === "offline" ? "Offline (Local Model)" : "Online (API)";
  const modeMismatch = Boolean(activeConversation && activeConversation.mode !== settings.mode);

  const updateConversation = (next: Conversation) => {
    setConversations((prev) => prev.map((conversation) => (conversation.id === next.id ? next : conversation)));
  };

  const onSend = async () => {
    if (!input.trim() || !activeConversation || sending || activeConversation.mode !== settings.mode) return;

    const userMessage: ChatMessage = {
      id: id(),
      role: "user",
      content: input.trim(),
      createdAt: now(),
    };

    const assistantPlaceholder: ChatMessage = {
      id: id(),
      role: "assistant",
      content: "",
      createdAt: now(),
    };

    const withUser: Conversation = {
      ...activeConversation,
      updatedAt: now(),
      title: summarizeTitle([...activeConversation.messages, userMessage]),
      messages: [...activeConversation.messages, userMessage, assistantPlaceholder],
    };

    updateConversation(withUser);
    setInput("");
    setSending(true);

    try {
      const reply = await getChatReply({
        mode: settings.mode,
        messages: [...activeConversation.messages, userMessage],
        settings: {
          localModel: settings.localModel,
          onlineProvider: settings.onlineProvider,
          onlineModel: settings.onlineModel,
          apiKey: settings.apiKey,
          personality: settings.personality,
        },
        memory,
      });

      await streamText(reply, (partial) => {
        setConversations((prev) =>
          prev.map((conversation) => {
            if (conversation.id !== withUser.id) return conversation;
            const nextMessages = conversation.messages.map((message) =>
              message.id === assistantPlaceholder.id ? { ...message, content: partial } : message,
            );
            return { ...conversation, messages: nextMessages, updatedAt: now() };
          }),
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== withUser.id) return conversation;
          return {
            ...conversation,
            messages: conversation.messages.map((chatMessage) =>
              chatMessage.id === assistantPlaceholder.id
                ? { ...chatMessage, content: `Error: ${message}` }
                : chatMessage,
            ),
          };
        }),
      );
    } finally {
      setSending(false);
    }
  };

  const createNewConversation = () => {
    const next = createConversation(settings.mode);
    setConversations((prev) => [next, ...prev]);
    setActiveId(next.id);
  };

  const activeMemory = memory;

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="w-72 shrink-0 border-r border-zinc-800 bg-zinc-900/80 p-4 hidden md:block">
        <button
          className="mb-4 w-full rounded bg-indigo-500 px-3 py-2 text-sm font-semibold hover:bg-indigo-400"
          onClick={createNewConversation}
        >
          + New chat
        </button>

        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-180px)]">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setActiveId(conversation.id)}
              className={`w-full rounded px-3 py-2 text-left text-sm ${
                conversation.id === activeId ? "bg-zinc-700" : "bg-zinc-800 hover:bg-zinc-700/80"
              }`}
            >
              <div className="line-clamp-1">{conversation.title}</div>
              <div className="text-xs text-zinc-400">{conversation.mode}</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-zinc-800 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-zinc-800 px-2 py-1 font-semibold">Active mode: {activeModeLabel}</span>
            <span className="rounded bg-zinc-800 px-2 py-1">No automatic offline-to-online sync</span>
            <button className="rounded bg-zinc-800 px-2 py-1" onClick={() => setShowSettings((s) => !s)}>
              Settings
            </button>
            <button className="rounded bg-zinc-800 px-2 py-1" onClick={() => setShowMemory((s) => !s)}>
              Memory
            </button>
            <button
              className="rounded bg-zinc-800 px-2 py-1"
              onClick={() => setSettings((prev) => ({ ...prev, theme: prev.theme === "dark" ? "light" : "dark" }))}
            >
              Theme: {settings.theme}
            </button>
          </div>
        </header>

        {showSettings && (
          <section className="grid gap-3 border-b border-zinc-800 bg-zinc-900/60 p-3 text-sm md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1">
              Mode
              <select
                className="rounded bg-zinc-800 p-2"
                value={settings.mode}
                onChange={(e) => setSettings((prev) => ({ ...prev, mode: e.target.value as AppSettings["mode"] }))}
              >
                <option value="offline">Offline (local)</option>
                <option value="online">Online (API)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              Local model
              <input
                className="rounded bg-zinc-800 p-2"
                value={settings.localModel}
                onChange={(e) => setSettings((prev) => ({ ...prev, localModel: e.target.value }))}
              />
            </label>

            <label className="flex flex-col gap-1">
              Online provider
              <select
                className="rounded bg-zinc-800 p-2"
                value={settings.onlineProvider}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    onlineProvider: e.target.value as AppSettings["onlineProvider"],
                  }))
                }
              >
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              Online model
              <input
                className="rounded bg-zinc-800 p-2"
                value={settings.onlineModel}
                onChange={(e) => setSettings((prev) => ({ ...prev, onlineModel: e.target.value }))}
              />
            </label>

            <label className="flex flex-col gap-1">
              API key
              <input
                type="password"
                className="rounded bg-zinc-800 p-2"
                value={settings.apiKey}
                onChange={(e) => setSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
              />
              <span className="text-xs text-zinc-400">Stored in-memory only for this tab.</span>
            </label>

            <label className="flex flex-col gap-1">
              Humor
              <select
                className="rounded bg-zinc-800 p-2"
                value={settings.personality.humor}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    personality: { ...prev.personality, humor: e.target.value as AppSettings["personality"]["humor"] },
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              Sarcasm
              <select
                className="rounded bg-zinc-800 p-2"
                value={settings.personality.sarcasm}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    personality: {
                      ...prev.personality,
                      sarcasm: e.target.value as AppSettings["personality"]["sarcasm"],
                    },
                  }))
                }
              >
                <option value="off">Off</option>
                <option value="light">Light</option>
                <option value="strong">Strong</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              Bluntness
              <select
                className="rounded bg-zinc-800 p-2"
                value={settings.personality.bluntness}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    personality: {
                      ...prev.personality,
                      bluntness: e.target.value as AppSettings["personality"]["bluntness"],
                    },
                  }))
                }
              >
                <option value="gentle">Gentle</option>
                <option value="direct">Direct</option>
                <option value="very_direct">Very direct</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              Response length
              <select
                className="rounded bg-zinc-800 p-2"
                value={settings.personality.responseLength}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    personality: {
                      ...prev.personality,
                      responseLength: e.target.value as AppSettings["personality"]["responseLength"],
                    },
                  }))
                }
              >
                <option value="short">Short</option>
                <option value="normal">Normal</option>
                <option value="detailed">Detailed</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              Emotional support
              <select
                className="rounded bg-zinc-800 p-2"
                value={settings.personality.emotionalSupport}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    personality: {
                      ...prev.personality,
                      emotionalSupport: e.target.value as AppSettings["personality"]["emotionalSupport"],
                    },
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="balanced">Balanced</option>
                <option value="high">High</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              Swearing
              <select
                className="rounded bg-zinc-800 p-2"
                value={settings.personality.swearing}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    personality: {
                      ...prev.personality,
                      swearing: e.target.value as AppSettings["personality"]["swearing"],
                    },
                  }))
                }
              >
                <option value="never">Never</option>
                <option value="match_me">Match me</option>
                <option value="casual">Casual</option>
              </select>
            </label>
          </section>
        )}

        {showMemory && (
          <section className="border-b border-zinc-800 bg-zinc-900/50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Memory & preferences</h2>
              <button
                className="rounded bg-zinc-800 px-2 py-1 text-sm"
                onClick={() =>
                  setMemory((prev) => [...prev, { id: id(), label: "", value: "", updatedAt: now() }])
                }
              >
                + Add memory item
              </button>
            </div>
            <div className="space-y-2">
              {activeMemory.map((item) => (
                <div key={item.id} className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
                  <input
                    className="rounded bg-zinc-800 p-2 text-sm"
                    placeholder="Label"
                    value={item.label}
                    onChange={(e) =>
                      setMemory((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id ? { ...entry, label: e.target.value, updatedAt: now() } : entry,
                        ),
                      )
                    }
                  />
                  <input
                    className="rounded bg-zinc-800 p-2 text-sm"
                    placeholder="Remembered detail"
                    value={item.value}
                    onChange={(e) =>
                      setMemory((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id ? { ...entry, value: e.target.value, updatedAt: now() } : entry,
                        ),
                      )
                    }
                  />
                  <button
                    className="rounded bg-rose-700 px-2 py-1 text-sm hover:bg-rose-600"
                    onClick={() => setMemory((prev) => prev.filter((entry) => entry.id !== item.id))}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex-1 overflow-y-auto p-3 md:p-5">
          {!activeConversation ? null : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              <input
                value={activeConversation.title}
                onChange={(e) =>
                  updateConversation({
                    ...activeConversation,
                    title: e.target.value,
                  })
                }
                className="rounded border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm font-semibold"
                aria-label="Conversation title"
              />

              {activeConversation.messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-xl p-3 ${
                    message.role === "user" ? "self-end bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-100"
                  }`}
                >
                  <p className="mb-1 text-xs uppercase tracking-wide opacity-75">{message.role}</p>
                  <MarkdownMessage text={message.content || "..."} />
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="border-t border-zinc-800 p-3">
          {modeMismatch && (
            <p className="mx-auto mb-2 w-full max-w-3xl text-sm text-amber-400">
              This {activeConversation?.mode} conversation can’t be sent in {settings.mode} mode. Switch modes or start a
              new chat; conversation history stays in its original mode.
            </p>
          )}
          <div className="mx-auto flex w-full max-w-3xl gap-2">
            <textarea
              className="h-24 flex-1 rounded bg-zinc-800 p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Message Simon..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              className="rounded bg-indigo-500 px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:bg-zinc-700"
              onClick={onSend}
              disabled={sending || !input.trim() || modeMismatch}
            >
              {sending ? "Thinking..." : "Send"}
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
