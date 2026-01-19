import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface GenerationStats {
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  stats?: GenerationStats;
}

interface StreamChunk {
  content: string;
  done: boolean;
  stats?: GenerationStats;
}

// Module-level state using $state
let messages = $state<Message[]>([]);
let isProcessing = $state(false);
let isProviderHealthy = $state(false);
let streamingContent = "";
let initialized = false;
let streamUnlisten: UnlistenFn | null = null;

async function init() {
  if (initialized) return;
  initialized = true;
  await checkHealth();
}

async function checkHealth() {
  try {
    isProviderHealthy = await invoke("assistant_check_health");
  } catch (e) {
    console.error("Failed to check provider health:", e);
    isProviderHealthy = false;
  }
}

function finishStreaming() {
  isProcessing = false;
  streamingContent = "";
  if (streamUnlisten) {
    streamUnlisten();
    streamUnlisten = null;
  }
}

async function sendMessage(
  content: string,
  isEnabled: boolean,
  provider: string,
  endpoint: string,
) {
  if (!content.trim()) return;
  if (!isEnabled) {
    messages = [
      ...messages,
      {
        role: "assistant",
        content: "Assistant is disabled. Enable it in Settings > AI Assistant.",
      },
    ];
    return;
  }

  // Add user message
  messages = [...messages, { role: "user", content }];
  isProcessing = true;
  streamingContent = "";

  // Add empty assistant message for streaming
  messages = [...messages, { role: "assistant", content: "" }];

  try {
    // Set up stream listener
    streamUnlisten = await listen<StreamChunk>("assistant-stream", (event) => {
      const chunk = event.payload;

      if (chunk.content) {
        streamingContent += chunk.content;
        // Update the last message (assistant's response)
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
          messages[lastIdx] = {
            ...messages[lastIdx],
            content: streamingContent,
          };
          // Trigger reactivity
          messages = [...messages];
        }
      }

      if (chunk.done) {
        if (chunk.stats) {
          const lastIdx = messages.length - 1;
          if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
            messages[lastIdx] = {
              ...messages[lastIdx],
              stats: chunk.stats,
            };
            messages = [...messages];
          }
        }
        finishStreaming();
      }
    });

    // Start streaming chat
    await invoke<string>("assistant_chat_stream", {
      messages: messages.slice(0, -1), // Exclude the empty assistant message
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
    const lastIdx = messages.length - 1;
    if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
      messages[lastIdx] = {
        role: "assistant",
        content: `Error: ${errorMessage}${helpText}`,
      };
      messages = [...messages];
    }

    finishStreaming();
  }
}

function clearHistory() {
  messages = [];
  streamingContent = "";
}

// Export as an object with getters for reactive access
export const assistantState = {
  get messages() {
    return messages;
  },
  get isProcessing() {
    return isProcessing;
  },
  get isProviderHealthy() {
    return isProviderHealthy;
  },
  init,
  checkHealth,
  sendMessage,
  clearHistory,
};
