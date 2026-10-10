import { ChatRequest } from "@/types/chat";

export async function getChatReply(request: ChatRequest): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Chat request failed.");
  }

  const payload = (await response.json()) as { reply: string };
  return payload.reply;
}
