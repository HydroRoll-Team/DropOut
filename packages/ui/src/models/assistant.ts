import { create } from "zustand";
import {
  assistantBeginStreamRequest,
  assistantCancelStreamRequest,
  assistantChatStream,
  assistantCheckHealth,
  getAssistantLogContext,
} from "@/client";
import { listen, type UnlistenFn } from "@/lib/launcher-runtime";
import type {
  AssistantLogContext,
  GenerationStats,
  Message,
  StreamChunk,
} from "@/types";

export interface AssistantMessage extends Message {
  id: number;
  role: "user" | "assistant";
  stats?: GenerationStats;
  failed?: boolean;
}

type ProviderHealth = "idle" | "checking" | "online" | "offline";
type ContextStatus = "idle" | "loading" | "ready" | "error";

interface AssistantState {
  messages: AssistantMessage[];
  isProcessing: boolean;
  providerHealth: ProviderHealth;
  context: AssistantLogContext;
  contextStatus: ContextStatus;
  contextError: string | null;
  lastError: string | null;
  streamUnlisten: UnlistenFn | null;
  activeBackendRequestId: string | null;

  checkHealth: () => Promise<void>;
  refreshContext: (lines: string[]) => Promise<void>;
  sendMessage: (content: string, logContext: string | null) => Promise<void>;
  clearHistory: () => void;
}

let nextMessageId = 1;
let activeRequestId = 0;
let activeHealthProbeId = 0;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function stopListening(unlisten: UnlistenFn | null) {
  if (unlisten) unlisten();
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  isProcessing: false,
  providerHealth: "idle",
  context: { content: "", lineCount: 0 },
  contextStatus: "idle",
  contextError: null,
  lastError: null,
  streamUnlisten: null,
  activeBackendRequestId: null,

  checkHealth: async () => {
    const probeId = ++activeHealthProbeId;
    set({ providerHealth: "checking" });
    try {
      const online = await assistantCheckHealth();
      if (probeId !== activeHealthProbeId) return;
      set({ providerHealth: online ? "online" : "offline" });
    } catch (error) {
      if (probeId !== activeHealthProbeId) return;
      console.error("Failed to check assistant provider:", error);
      set({ providerHealth: "offline" });
    }
  },

  refreshContext: async (lines) => {
    set({ contextStatus: "loading", contextError: null });
    try {
      const context = await getAssistantLogContext(lines);
      set({ context, contextStatus: "ready" });
    } catch (error) {
      const message = errorMessage(error);
      console.error("Failed to load assistant context:", error);
      set({ contextStatus: "error", contextError: message });
    }
  },

  sendMessage: async (content, logContext) => {
    const prompt = content.trim();
    if (!prompt || get().isProcessing) return;

    const requestId = ++activeRequestId;
    stopListening(get().streamUnlisten);
    const previousBackendRequestId = get().activeBackendRequestId;
    if (previousBackendRequestId) {
      void assistantCancelStreamRequest(previousBackendRequestId);
    }

    const userMessage: AssistantMessage = {
      id: nextMessageId++,
      role: "user",
      content: prompt,
    };
    const assistantMessage: AssistantMessage = {
      id: nextMessageId++,
      role: "assistant",
      content: "",
    };
    const requestMessages = [...get().messages, userMessage];

    set({
      messages: [...requestMessages, assistantMessage],
      isProcessing: true,
      lastError: null,
      streamUnlisten: null,
      activeBackendRequestId: null,
    });

    try {
      const backendRequestId = await assistantBeginStreamRequest();
      if (requestId !== activeRequestId) {
        void assistantCancelStreamRequest(backendRequestId);
        return;
      }
      set({ activeBackendRequestId: backendRequestId });

      const unlisten = await listen<StreamChunk>(
        "assistant-stream",
        (event) => {
          if (requestId !== activeRequestId) return;
          const chunk = event.payload;
          if (chunk.requestId !== backendRequestId) return;

          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    content: `${message.content}${chunk.content}`,
                    stats: chunk.stats ?? message.stats,
                  }
                : message,
            ),
          }));

          if (chunk.done) {
            const listener = get().streamUnlisten;
            stopListening(listener);
            set({
              isProcessing: false,
              streamUnlisten: null,
              activeBackendRequestId: null,
            });
          }
        },
      );

      if (requestId !== activeRequestId) {
        unlisten();
        return;
      }
      set({ streamUnlisten: unlisten });

      const response = await assistantChatStream(
        requestMessages.map(({ role, content: messageContent }) => ({
          role,
          content: messageContent,
        })),
        logContext,
        backendRequestId,
      );

      if (requestId !== activeRequestId) return;
      const current = get().messages.find(
        (message) => message.id === assistantMessage.id,
      );
      if (!current?.content && response) {
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: response }
              : message,
          ),
        }));
      }

      const listener = get().streamUnlisten;
      stopListening(listener);
      set({
        isProcessing: false,
        streamUnlisten: null,
        activeBackendRequestId: null,
      });
    } catch (error) {
      if (requestId !== activeRequestId) return;
      const message = errorMessage(error);
      const listener = get().streamUnlisten;
      stopListening(listener);
      set((state) => ({
        messages: state.messages.map((entry) =>
          entry.id === assistantMessage.id
            ? { ...entry, content: message, failed: true }
            : entry,
        ),
        isProcessing: false,
        providerHealth: "offline",
        lastError: message,
        streamUnlisten: null,
        activeBackendRequestId: null,
      }));
    }
  },

  clearHistory: () => {
    activeRequestId += 1;
    activeHealthProbeId += 1;
    stopListening(get().streamUnlisten);
    const backendRequestId = get().activeBackendRequestId;
    if (backendRequestId) {
      void assistantCancelStreamRequest(backendRequestId);
    }
    set({
      messages: [],
      isProcessing: false,
      lastError: null,
      streamUnlisten: null,
      activeBackendRequestId: null,
    });
  },
}));
