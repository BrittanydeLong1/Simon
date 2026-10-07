export type Mode = "offline" | "online";

export type Role = "user" | "assistant" | "system";

export type PersonalitySettings = {
  humor: "low" | "moderate" | "high";
  sarcasm: "off" | "light" | "strong";
  bluntness: "gentle" | "direct" | "very_direct";
  responseLength: "short" | "normal" | "detailed";
  emotionalSupport: "low" | "balanced" | "high";
  swearing: "never" | "match_me" | "casual";
};

export type AppSettings = {
  mode: Mode;
  theme: "light" | "dark";
  localModel: string;
  onlineProvider: "openai" | "openrouter";
  onlineModel: string;
  apiKey: string;
  personality: PersonalitySettings;
};

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  mode: Mode;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type MemoryItem = {
  id: string;
  label: string;
  value: string;
  updatedAt: string;
};

export type ChatRequest = {
  mode: Mode;
  messages: ChatMessage[];
  settings: Pick<AppSettings, "localModel" | "onlineProvider" | "onlineModel" | "apiKey" | "personality">;
  memory: MemoryItem[];
};
