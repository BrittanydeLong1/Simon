import { NextResponse } from "next/server";
import { buildCorePrompt, onboardingPrompt } from "@/prompts/corePersonality";
import { ChatMessage, ChatRequest, MemoryItem } from "@/types/chat";

function memoryToText(memory: MemoryItem[]) {
  return memory.map((item) => `- ${item.label}: ${item.value}`).join("\n");
}

function toProviderMessages(systemPrompt: string, messages: ChatMessage[]) {
  return [{ role: "system", content: systemPrompt }, ...messages.map(({ role, content }) => ({ role, content }))];
}

function providerBaseUrl(provider: ChatRequest["settings"]["onlineProvider"]) {
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  return "https://api.openai.com/v1";
}

async function callOllama(request: ChatRequest, providerMessages: { role: string; content: string }[]) {
  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: request.settings.localModel,
      messages: providerMessages,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error("Offline model request failed. Ensure Ollama/local model server is running.");
  }

  const data = (await response.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() || "No response from local model.";
}

async function callOnline(request: ChatRequest, providerMessages: { role: string; content: string }[]) {
  if (!request.settings.apiKey) {
    throw new Error("Online mode requires an API key.");
  }

  const base = providerBaseUrl(request.settings.onlineProvider);
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + request.settings.apiKey,
    },
    body: JSON.stringify({
      model: request.settings.onlineModel,
      messages: providerMessages,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    throw new Error("Online provider request failed. Check API key, model, and selected provider.");
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content?.trim() || "No response from online model.";
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as ChatRequest;
    const systemPrompt = `${onboardingPrompt}\n\n${buildCorePrompt(payload.settings.personality, memoryToText(payload.memory))}`;

    const providerMessages = toProviderMessages(systemPrompt, payload.messages);

    const reply =
      payload.mode === "offline"
        ? await callOllama(payload, providerMessages)
        : await callOnline(payload, providerMessages);

    return NextResponse.json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return new NextResponse(message, { status: 400 });
  }
}
