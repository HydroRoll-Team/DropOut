import {
  AlertTriangle,
  Bot,
  Brain,
  ChevronDown,
  Loader2,
  RefreshCw,
  Send,
  Settings,
  Trash2,
} from "lucide-react";
import { marked } from "marked";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toNumber } from "@/lib/tsrs-utils";
import { type Message, useAssistantStore } from "../stores/assistant-store";
import { useSettingsStore } from "../stores/settings-store";
import { useUiStore } from "../stores/ui-store";

interface ParsedMessage {
  thinking: string | null;
  content: string;
  isThinking: boolean;
}

function parseMessageContent(content: string): ParsedMessage {
  if (!content) return { thinking: null, content: "", isThinking: false };

  // Support both <thinking> and <think> (DeepSeek uses <think>)
  let startTag = "<thinking>";
  let endTag = "</thinking>";
  let startIndex = content.indexOf(startTag);

  if (startIndex === -1) {
    startTag = "<think>";
    endTag = "</think>";
    startIndex = content.indexOf(startTag);
  }

  // Also check for encoded tags if they weren't decoded properly
  if (startIndex === -1) {
    startTag = "\u003cthink\u003e";
    endTag = "\u003c/think\u003e";
    startIndex = content.indexOf(startTag);
  }

  if (startIndex !== -1) {
    const endIndex = content.indexOf(endTag, startIndex);

    if (endIndex !== -1) {
      // Completed thinking block
      const before = content.substring(0, startIndex);
      const thinking = content
        .substring(startIndex + startTag.length, endIndex)
        .trim();
      const after = content.substring(endIndex + endTag.length);

      return {
        thinking,
        content: (before + after).trim(),
        isThinking: false,
      };
    } else {
      // Incomplete thinking block (still streaming)
      const before = content.substring(0, startIndex);
      const thinking = content.substring(startIndex + startTag.length).trim();

      return {
        thinking,
        content: before.trim(),
        isThinking: true,
      };
    }
  }

  return { thinking: null, content, isThinking: false };
}

function renderMarkdown(content: string): string {
  if (!content) return "";
  try {
    return marked(content, { breaks: true, gfm: true }) as string;
  } catch {
    return content;
  }
}

export function AssistantView() {
  const {
    messages,
    isProcessing,
    isProviderHealthy,
    streamingContent,
    init,
    checkHealth,
    sendMessage,
    clearHistory,
  } = useAssistantStore();
  const { settings } = useSettingsStore();
  const { setView } = useUiStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const provider = settings.assistant.llmProvider;
  const endpoint =
    provider === "ollama"
      ? settings.assistant.ollamaEndpoint
      : settings.assistant.openaiEndpoint;
  const model =
    provider === "ollama"
      ? settings.assistant.ollamaModel
      : settings.assistant.openaiModel;

  const getProviderName = (): string => {
    if (provider === "ollama") {
      return `Ollama (${model})`;
    } else if (provider === "openai") {
      return `OpenAI (${model})`;
    }
    return provider;
  };

  const getProviderHelpText = (): string => {
    if (provider === "ollama") {
      return `Please ensure Ollama is installed and running at ${endpoint}.`;
    } else if (provider === "openai") {
      return "Please check your OpenAI API key in Settings > AI Assistant.";
    }
    return "";
  };

  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight;
        }
      }, 0);
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (messages.length > 0 || isProcessing) {
      scrollToBottom();
    }
  }, [messages.length, isProcessing, scrollToBottom]);

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return;
    const text = input;
    setInput("");
    await sendMessage(text, settings.assistant.enabled, provider, endpoint);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const renderMessage = (message: Message, index: number) => {
    const isUser = message.role === "user";
    const parsed = parseMessageContent(message.content);

    return (
      <div
        key={index}
        className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}
      >
        <div
          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-indigo-500 text-white rounded-br-none"
              : "bg-zinc-800 text-zinc-100 rounded-bl-none"
          }`}
        >
          {!isUser && parsed.thinking && (
            <div className="mb-3 max-w-full overflow-hidden">
              <details className="group" open={parsed.isThinking}>
                <summary className="list-none cursor-pointer flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors text-xs font-medium select-none bg-black/20 p-2 rounded-lg border border-white/5 w-fit mb-2 outline-none">
                  <Brain className="h-3 w-3" />
                  <span>Thinking Process</span>
                  <ChevronDown className="h-3 w-3 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="pl-3 border-l-2 border-zinc-700 text-zinc-500 text-xs italic leading-relaxed whitespace-pre-wrap font-mono max-h-96 overflow-y-auto custom-scrollbar bg-black/10 p-2 rounded-r-md">
                  {parsed.thinking}
                  {parsed.isThinking && (
                    <span className="inline-block w-1.5 h-3 bg-zinc-500 ml-1 animate-pulse align-middle" />
                  )}
                </div>
              </details>
            </div>
          )}
          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(parsed.content),
            }}
          />
          {!isUser && message.stats && (
            <div className="mt-2 pt-2 border-t border-zinc-700/50">
              <div className="text-xs text-zinc-400">
                {message.stats.evalCount} tokens ·{" "}
                {Math.round(toNumber(message.stats.totalDuration) / 1000000)}
                ms
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full flex flex-col gap-4 p-4 lg:p-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
            <Bot size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Game Assistant</h2>
            <p className="text-zinc-400 text-sm">
              Powered by {getProviderName()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!settings.assistant.enabled ? (
            <Badge
              variant="outline"
              className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Disabled
            </Badge>
          ) : !isProviderHealthy ? (
            <Badge
              variant="outline"
              className="bg-red-500/10 text-red-400 border-red-500/20"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Offline
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1" />
              Online
            </Badge>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={checkHealth}
            title="Check Connection"
            disabled={isProcessing}
          >
            <RefreshCw
              className={`h-4 w-4 ${isProcessing ? "animate-spin" : ""}`}
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={clearHistory}
            title="Clear History"
            disabled={isProcessing}
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView("settings")}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-black/20 border border-white/5 rounded-xl overflow-hidden flex flex-col relative">
        {/* Warning when assistant is disabled */}
        {!settings.assistant.enabled && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
            <Card className="bg-yellow-500/10 border-yellow-500/20">
              <CardContent className="p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-yellow-500 text-sm font-medium">
                  Assistant is disabled. Enable it in Settings &gt; AI
                  Assistant.
                </span>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Provider offline warning */}
        {settings.assistant.enabled && !isProviderHealthy && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
            <Card className="bg-red-500/10 border-red-500/20">
              <CardContent className="p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <div className="flex flex-col">
                  <span className="text-red-500 text-sm font-medium">
                    Assistant is offline
                  </span>
                  <span className="text-red-400 text-xs">
                    {getProviderHelpText()}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Messages Container */}
        <ScrollArea className="flex-1 p-4 lg:p-6" ref={messagesContainerRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-4 mt-8">
              <div className="p-4 bg-zinc-800/50 rounded-full">
                <Bot className="h-12 w-12" />
              </div>
              <h3 className="text-xl font-medium">How can I help you today?</h3>
              <p className="text-center max-w-md text-sm">
                I can analyze your game logs, diagnose crashes, or explain mod
                features.
                {!settings.assistant.enabled && (
                  <span className="block mt-2 text-yellow-500">
                    Assistant is disabled. Enable it in{" "}
                    <button
                      type="button"
                      onClick={() => setView("settings")}
                      className="text-indigo-400 hover:underline"
                    >
                      Settings &gt; AI Assistant
                    </button>
                    .
                  </span>
                )}
              </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 max-w-lg">
                <Button
                  variant="outline"
                  className="text-left h-auto py-3"
                  onClick={() =>
                    setInput("How do I fix Minecraft crashing on launch?")
                  }
                  disabled={isProcessing}
                >
                  <div className="text-sm">
                    How do I fix Minecraft crashing on launch?
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="text-left h-auto py-3"
                  onClick={() =>
                    setInput("What's the best way to improve FPS?")
                  }
                  disabled={isProcessing}
                >
                  <div className="text-sm">
                    What's the best way to improve FPS?
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="text-left h-auto py-3"
                  onClick={() =>
                    setInput(
                      "Can you help me install Fabric for Minecraft 1.20.4?",
                    )
                  }
                  disabled={isProcessing}
                >
                  <div className="text-sm">
                    Can you help me install Fabric for 1.20.4?
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="text-left h-auto py-3"
                  onClick={() =>
                    setInput("What mods do you recommend for performance?")
                  }
                  disabled={isProcessing}
                >
                  <div className="text-sm">
                    What mods do you recommend for performance?
                  </div>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => renderMessage(message, index))}
              {isProcessing && streamingContent && (
                <div className="flex justify-start mb-4">
                  <div className="max-w-[80%] bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-none px-4 py-3">
                    <div
                      className="prose prose-invert max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(streamingContent),
                      }}
                    />
                    <div className="flex items-center gap-1 mt-2 text-xs text-zinc-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Assistant is typing...</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </ScrollArea>

        <Separator />

        {/* Input Area */}
        <div className="p-3 lg:p-4">
          <div className="flex gap-2">
            <Textarea
              placeholder={
                settings.assistant.enabled
                  ? "Ask about your game..."
                  : "Assistant is disabled. Enable it in Settings to use."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-11 max-h-50 resize-none border-zinc-700 bg-zinc-900/50 focus:bg-zinc-900/80"
              disabled={!settings.assistant.enabled || isProcessing}
            />
            <Button
              onClick={handleSubmit}
              disabled={
                !settings.assistant.enabled || !input.trim() || isProcessing
              }
              className="px-6 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-zinc-500">
              {settings.assistant.enabled
                ? "Press Enter to send, Shift+Enter for new line"
                : "Enable the assistant in Settings to use"}
            </div>
            <div className="text-xs text-zinc-500">
              Model: {model} • Provider: {provider}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
