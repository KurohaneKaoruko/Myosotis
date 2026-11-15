// ============================================================
// Myosotis core types
// ============================================================

export type Protocol = "openai" | "anthropic" | "gemini";
export type ModelRole = "chat" | "vision" | "embedding" | "tts" | "stt";

/** A model provider (endpoint + key), protocol decides how we talk to it. */
export interface Provider {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  /** extra keys rotated together with `apiKey` (a key pool) */
  keys?: string[];
  createdAt: number;
}

/** A concrete model offered by a provider, with the roles it can play. */
export interface ModelConfig {
  id: string; // internal uid
  name: string; // model api name, e.g. "gpt-4o-mini"
  providerId: string;
  label: string; // display label
  roles: ModelRole[];
}

export type ThemeId = "mono" | "azure" | "violet" | "rose" | "forest" | "amber" | "ink";
export type ThemeMode = "light" | "dark" | "auto";

export interface Settings {
  themeId: ThemeId;
  themeMode: ThemeMode;
  wallpaper: string;
  userName: string;
  userProfile: string;
  defaults: {
    chat: string | null; // ModelConfig id
    vision: string | null;
    embedding: string | null;
    tts: string | null;
    stt: string | null;
  };
  genParams: {
    temperature: number; // 0 ~ 2
    maxTokens: number; // response cap
    contextTurns: number; // recent turns sent verbatim
  };
  fontSize: number; // message bubble font size
  language: "zh-CN" | "en"; // UI language
  bubbleStyle: "modern" | "classic"; // chat bubble appearance
  webdav: {
    url: string;
    username: string;
    appPassword: string;
    directory: string;
    encrypt: boolean;
    backupPassword: string;
    autoBackup: "off" | "daily" | "weekly";
  };
  browserTts: boolean;
  browserStt: boolean;
  sendOnEnter: boolean;
  /** message sound effects (reply arrives / message sent) */
  soundEnabled: boolean;
  /** desktop notifications when a reply lands in a background conversation */
  desktopNotify: boolean;
  onboardingDone: boolean;
}

/** Per-slot generation parameter overrides. `undefined`/`null` = follow the global default. */
export interface SlotParams {
  temperature?: number | null;
  maxTokens?: number | null;
  topP?: number | null;
  frequencyPenalty?: number | null;
}

/** Which model slots an agent may tune independently. */
export interface AgentSlotParams {
  reply?: SlotParams;
  vision?: SlotParams;
  asr?: SlotParams;
  tts?: SlotParams;
}

export type SlotId = keyof AgentSlotParams;

/** Accepted ranges for every slot-level parameter (ported validation rules). */
export const SLOT_PARAM_RANGES = {
  temperature: { min: 0, max: 2 },
  maxTokens: { min: 1, max: 1_000_000 },
  topP: { min: 0, max: 1 },
  frequencyPenalty: { min: -2, max: 2 },
} as const;

export type SlotParamKey = keyof typeof SLOT_PARAM_RANGES;

/** Clamp an override into its valid range; returns null for empty/invalid input. */
export function clampSlotParam(key: SlotParamKey, v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const { min, max } = SLOT_PARAM_RANGES[key];
  return Math.min(max, Math.max(min, v));
}

/** A persona-driven chat companion. */
export interface Agent {
  id: string;
  name: string;
  emoji: string;
  hue: number; // avatar hue
  persona: string; // system prompt: who it is
  /** how it talks — tone, habits, taboos (appended after the persona) */
  speechRules?: string;
  greeting: string; // first message of a new conversation
  suggestions: string[]; // starter suggestions
  memoryEnabled: boolean;
  models: Partial<Record<"chat" | "vision" | "embedding", string>>; // override global defaults
  /** slot-level generation parameter overrides (reply/vision/asr/tts) */
  slotParams?: AgentSlotParams;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  agentId: string;
  title: string;
  lastMessage: string;
  pinned?: boolean;
  /** archived conversations are hidden from the default list filter */
  archived?: boolean;
  /** free-form labels used for filtering */
  tags?: string[];
  /** cached message count shown in the conversation list */
  messageCount?: number;
  /** role of the newest message, for the list preview */
  lastMessageRole?: "user" | "assistant";
  /** "direct" (a single agent) or "group" (multi-agent round table); default "direct" */
  kind?: "direct" | "group";
  /** group-chat participants in speaking order (only when kind === "group") */
  participants?: GroupParticipant[];
  summary: string; // rolling summary of older messages
  summarizedUntil: number; // messages older than this are covered by summary
  /** "story" when the conversation runs on a scenario; default "chat" */
  mode?: "chat" | "story";
  /** scenario in use while mode === "story" */
  scenarioId?: string;
  /** per-conversation story progress: openedAt marks the narrative as inserted */
  storyState?: { openedAt?: number; triggeredEventIds: string[] };
  /** last time the owner opened this conversation (unread badge base) */
  lastReadAt?: number;
  /** server-computed unread assistant messages (not persisted) */
  unread?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data urls
  replyTo?: { role: "user" | "assistant"; content: string }; // quoted message
  /** "narrative" messages are story-mode narration (opening story), rendered without actions */
  kind?: "narrative";
  /** group chat: which agent produced this assistant message */
  agentId?: string;
  /** group chat: participant agent ids that can see this message (empty/undefined = everyone) */
  visibleTo?: string[];
  createdAt: number;
  /** "sending" = in flight, "error" = failed (retryable), "aborted" = stopped */
  status?: "sending" | "ok" | "error" | "aborted";
}

/** How a group participant reacts to messages: every message, or only @mentions. */
export type ParticipantMode = "all" | "mention";

/** One member of a multi-agent group chat. */
export interface GroupParticipant {
  agentId: string;
  /** which messages this agent receives as context */
  receiveMode: ParticipantMode;
  /** when this agent produces a reply */
  replyMode: ParticipantMode;
  sortOrder: number;
}

export type MemoryKind = "fact" | "preference" | "event" | "relationship" | "goal";

export interface MemoryItem {
  id: string;
  agentId: string;
  content: string;
  kind: MemoryKind;
  importance: number; // 1..5
  embedding: number[] | null;
  pinned: boolean;
  hitCount: number;
  /** "global" memories are visible to every agent; default "agent" = private */
  scope?: "agent" | "global";
  /** last time retrieval injected this memory; drives decay scoring */
  lastHitAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PromptTemplate {
  id: string;
  trigger: string; // matched after "/" in the composer
  content: string; // prompt template filled into the input
  createdAt: number;
}

/** A story-mode script: world setting + opening + keyword-triggered events. */
export interface ScenarioEvent {
  id: string;
  name: string;
  /** comma-separated keywords matched against the user message */
  trigger: string;
  /** narrative content injected as "just happened" when triggered */
  content: string;
}

export interface Scenario {
  id: string;
  agentId: string;
  name: string;
  worldSetting: string;
  openingStory: string;
  events: ScenarioEvent[];
  /** quick-send prompt bubbles shown in story mode */
  plotPrompts: string[];
  createdAt: number;
  updatedAt: number;
}

/** Resolved model+provider pair, ready for an API call. */
export interface ResolvedModel {
  model: ModelConfig;
  provider: Provider;
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: "azure",
  themeMode: "auto",
  wallpaper: "none",
  userName: "",
  userProfile: "",
  defaults: { chat: null, vision: null, embedding: null, tts: null, stt: null },
  genParams: { temperature: 0.8, maxTokens: 4096, contextTurns: 12 },
  fontSize: 15,
  language: "zh-CN",
  bubbleStyle: "modern",
  webdav: {
    url: "",
    username: "",
    appPassword: "",
    directory: "/Myosotis",
    encrypt: false,
    backupPassword: "",
    autoBackup: "off",
  },
  browserTts: true,
  browserStt: true,
  sendOnEnter: true,
  soundEnabled: true,
  desktopNotify: false,
  onboardingDone: false,
};

// Kind labels are UI text — resolved via i18n keys in MemoryView (kindFact…kindGoal).
export const MEMORY_KINDS: { id: MemoryKind; icon: string }[] = [
  { id: "fact", icon: "📌" },
  { id: "preference", icon: "💗" },
  { id: "event", icon: "🗓️" },
  { id: "relationship", icon: "🤝" },
  { id: "goal", icon: "🎯" },
];

