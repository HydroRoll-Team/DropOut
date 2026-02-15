import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { GenerationStats, StreamChunk } from "@/types/bindings/assistant";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  stats?: GenerationStats;
}

interface AssistantState {
  // State
  messages: Message[];
  isProcessing: boolean;
  isProviderHealthy: boolean | undefined;
  streamingContent: string;
  initialized: boolean;
  streamUnlisten: UnlistenFn | null;

  // Actions
  init: () => Promise<void>;
  checkHealth: () => Promise<void>;
  sendMessage: (
    content: string,
    isEnabled: boolean,
    provider: string,
    endpoint: string,
  ) => Promise<void>;
  finishStreaming: () => void;
  clearHistory: () => void;
  setMessages: (messages: Message[]) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  setIsProviderHealthy: (isProviderHealthy: boolean | undefined) => void;
  setStreamingContent: (streamingContent: string) => void;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  // Initial state
  messages: [],
  isProcessing: false,
  isProviderHealthy: false,
  streamingContent: "",
  initialized: false,
  streamUnlisten: null,

  // Actions
  init: async () => {
    const { initialized } = get();
    if (initialized) return;
    set({ initialized: true });
    await get().checkHealth();
  },

  checkHealth: async () => {
    try {
      const isHealthy = await invoke<boolean>("assistant_check_health");
      set({ isProviderHealthy: isHealthy });
    } catch (e) {
      console.error("Failed to check provider health:", e);
      set({ isProviderHealthy: false });
    }
  },

  finishStreaming: () => {
    const { streamUnlisten } = get();
    set({ isProcessing: false, streamingContent: "" });

    if (streamUnlisten) {
      streamUnlisten();
      set({ streamUnlisten: null });
    }
  },

  sendMessage: async (content, isEnabled, provider, endpoint) => {
    if (!content.trim()) return;

    const { messages } = get();

    if (!isEnabled) {
      const newMessage: Message = {
        role: "assistant",
        content: "Assistant is disabled. Enable it in Settings > AI Assistant.",
      };
      set({ messages: [...messages, { role: "user", content }, newMessage] });
      return;
    }

    // Add user message
    const userMessage: Message = { role: "user", content };
    const updatedMessages = [...messages, userMessage];
    set({
      messages: updatedMessages,
      isProcessing: true,
      streamingContent: "",
    });

    // Add empty assistant message for streaming
    const assistantMessage: Message = { role: "assistant", content: "" };
    const withAssistantMessage = [...updatedMessages, assistantMessage];
    set({ messages: withAssistantMessage });

    try {
      // Set up stream listener
      const unlisten = await listen<StreamChunk>(
        "assistant-stream",
        (event) => {
          const chunk = event.payload;
          const currentState = get();

          if (chunk.content) {
            const newStreamingContent =
              currentState.streamingContent + chunk.content;
            const currentMessages = [...currentState.messages];
            const lastIdx = currentMessages.length - 1;

            if (lastIdx >= 0 && currentMessages[lastIdx].role === "assistant") {
              currentMessages[lastIdx] = {
                ...currentMessages[lastIdx],
                content: newStreamingContent,
              };
              set({
                streamingContent: newStreamingContent,
                messages: currentMessages,
              });
            }
          }

          if (chunk.done) {
            const finalMessages = [...currentState.messages];
            const lastIdx = finalMessages.length - 1;

            if (
              chunk.stats &&
              lastIdx >= 0 &&
              finalMessages[lastIdx].role === "assistant"
            ) {
              finalMessages[lastIdx] = {
                ...finalMessages[lastIdx],
                stats: chunk.stats,
              };
              set({ messages: finalMessages });
            }

            get().finishStreaming();
          }
        },
      );

      set({ streamUnlisten: unlisten });

      // Start streaming chat
      await invoke<string>("assistant_chat_stream", {
        messages: withAssistantMessage.slice(0, -1), // Exclude the empty assistant message
      });
    } catch (e) {
      console.error("Failed to send message:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);

      let helpText = "";
      if (provider === "ollama") {
        helpText = `\n\nPlease ensure Ollama is running at ${endpoint}.`;
      } else if (provider === "openai") {
        helpText = "\n\nPlease check your OpenAI API key in Settings.";
      }

      // Update the last message with error
      const currentMessages = [...get().messages];
      const lastIdx = currentMessages.length - 1;
      if (lastIdx >= 0 && currentMessages[lastIdx].role === "assistant") {
        currentMessages[lastIdx] = {
          role: "assistant",
          content: `Error: ${errorMessage}${helpText}`,
        };
        set({ messages: currentMessages });
      }

      get().finishStreaming();
    }
  },

  clearHistory: () => {
    set({ messages: [], streamingContent: "" });
  },

  setMessages: (messages) => {
    set({ messages });
  },

  setIsProcessing: (isProcessing) => {
    set({ isProcessing });
  },

  setIsProviderHealthy: (isProviderHealthy) => {
    set({ isProviderHealthy });
  },

  setStreamingContent: (streamingContent) => {
    set({ streamingContent });
  },
}));
