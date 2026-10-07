import { defaultSettings } from "@/personality/config";
import { AppSettings, Conversation } from "@/types/chat";

const SETTINGS_KEY = "simon-settings-v1";
const CONVERSATIONS_KEY = "simon-conversations-v1";
const SESSION_API_KEY = "simon-session-api-key";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return defaultSettings;
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;
  try {
    const parsed = JSON.parse(raw) as AppSettings;
    const sessionKey = sessionStorage.getItem(SESSION_API_KEY) || "";
    return {
      ...defaultSettings,
      ...parsed,
      apiKey: parsed.persistApiKey ? parsed.apiKey : sessionKey,
      personality: { ...defaultSettings.personality, ...parsed.personality },
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;
  const toStore: AppSettings = {
    ...settings,
    apiKey: settings.persistApiKey ? settings.apiKey : "",
  };

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(toStore));
  if (settings.persistApiKey) {
    sessionStorage.removeItem(SESSION_API_KEY);
  } else {
    sessionStorage.setItem(SESSION_API_KEY, settings.apiKey);
  }
}

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CONVERSATIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}
