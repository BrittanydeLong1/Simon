import { AppSettings, PersonalitySettings } from "@/types/chat";

export const defaultPersonality: PersonalitySettings = {
  humor: "moderate",
  sarcasm: "light",
  bluntness: "direct",
  responseLength: "normal",
  emotionalSupport: "balanced",
  swearing: "match_me",
};

export const defaultSettings: AppSettings = {
  mode: "offline",
  theme: "dark",
  localModel: "llama3.1",
  onlineModel: "gpt-4o-mini",
  onlineBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  persistApiKey: false,
  personality: defaultPersonality,
};
