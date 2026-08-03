import {
  BotIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  ClipboardIcon,
  EraserIcon,
  FileLock2Icon,
  RefreshCwIcon,
  SendIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAssistantStore } from "@/models/assistant";
import { useGameStore } from "@/models/game";
import { useInstanceStore } from "@/models/instance";
import { useSettingsStore } from "@/models/settings";
import type { AssistantConfig } from "@/types";

const promptKeys = [
  "assistant.prompts.failure",
  "assistant.prompts.mods",
  "assistant.prompts.memory",
] as const;

function configured(config: AssistantConfig) {
  if (!config.enabled) return false;
  if (config.llmProvider === "ollama") {
    return Boolean(config.ollamaEndpoint.trim() && config.ollamaModel.trim());
  }
  if (config.llmProvider === "openai") {
    return Boolean(
      config.openaiEndpoint.trim() &&
        config.openaiModel.trim() &&
        config.openaiApiKey?.trim(),
    );
  }
  return false;
}

function ProviderStatus() {
  const { t } = useTranslation();
  const status = useAssistantStore((state) => state.providerHealth);

  const copy = {
    idle: t("assistant.status.idle"),
    checking: t("assistant.status.checking"),
    online: t("assistant.status.online"),
    offline: t("assistant.status.offline"),
  }[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase",
        status === "online" && "text-emerald-600 dark:text-emerald-300",
        status === "offline" && "text-red-600 dark:text-red-300",
        (status === "idle" || status === "checking") && "text-muted-foreground",
      )}
      role="status"
    >
      {status === "online" ? (
        <CheckCircle2Icon className="size-3" aria-hidden="true" />
      ) : status === "offline" ? (
        <CircleAlertIcon className="size-3" aria-hidden="true" />
      ) : (
        <CircleDashedIcon
          className={cn("size-3", status === "checking" && "animate-spin")}
          aria-hidden="true"
        />
      )}
      {copy}
    </span>
  );
}

function AssistantSetup() {
  const { t } = useTranslation();
  const config = useSettingsStore((state) => state.config);
  const updateSettings = useSettingsStore((state) => state.update);
  const checkHealth = useAssistantStore((state) => state.checkHealth);
  const [draft, setDraft] = useState<AssistantConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) setDraft(config.assistant);
  }, [config]);

  const dirty = Boolean(
    config &&
      draft &&
      JSON.stringify(config.assistant) !== JSON.stringify(draft),
  );

  const save = async () => {
    if (!config || !draft || saving) return;
    setSaving(true);
    try {
      await updateSettings({ ...config, assistant: draft });
      await checkHealth();
      toast.success(t("assistant.setup.saved"));
    } catch (error) {
      toast.error(
        t("assistant.setup.saveFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!draft) {
    return (
      <div className="flex min-h-32 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const remote = draft.llmProvider === "openai";

  return (
    <section
      aria-labelledby="assistant-setup-title"
      className="border-border/80 bg-card/88 border p-3 shadow-sm backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.12em] uppercase">
            {t("assistant.setup.eyebrow")}
          </p>
          <h2 id="assistant-setup-title" className="mt-0.5 text-sm font-bold">
            {t("assistant.setup.title")}
          </h2>
        </div>
        <Settings2Icon
          className="text-muted-foreground size-4"
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs font-medium">
          <span>{t("assistant.setup.enabled")}</span>
          <Switch
            aria-label={t("assistant.setup.enabled")}
            checked={draft.enabled}
            onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
          />
        </div>

        <div className="block space-y-1.5 text-[10px] font-semibold tracking-wide uppercase">
          <span className="text-muted-foreground">
            {t("assistant.setup.provider")}
          </span>
          <Select
            value={draft.llmProvider}
            items={[
              { label: t("assistant.setup.ollama"), value: "ollama" },
              { label: t("assistant.setup.openai"), value: "openai" },
            ]}
            onValueChange={(llmProvider) => {
              if (llmProvider) setDraft({ ...draft, llmProvider });
            }}
          >
            <SelectTrigger
              aria-label={t("assistant.setup.provider")}
              className="w-full normal-case"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="ollama">
                {t("assistant.setup.ollama")}
              </SelectItem>
              <SelectItem value="openai">
                {t("assistant.setup.openai")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <label
          htmlFor="assistant-endpoint"
          className="block space-y-1.5 text-[10px] font-semibold tracking-wide uppercase"
        >
          <span className="text-muted-foreground">
            {t("assistant.setup.endpoint")}
          </span>
          <Input
            id="assistant-endpoint"
            aria-label={t("assistant.setup.endpoint")}
            value={remote ? draft.openaiEndpoint : draft.ollamaEndpoint}
            onChange={(event) =>
              setDraft(
                remote
                  ? { ...draft, openaiEndpoint: event.target.value }
                  : { ...draft, ollamaEndpoint: event.target.value },
              )
            }
            spellCheck={false}
          />
        </label>

        <label
          htmlFor="assistant-model"
          className="block space-y-1.5 text-[10px] font-semibold tracking-wide uppercase"
        >
          <span className="text-muted-foreground">
            {t("assistant.setup.model")}
          </span>
          <Input
            id="assistant-model"
            aria-label={t("assistant.setup.model")}
            value={remote ? draft.openaiModel : draft.ollamaModel}
            onChange={(event) =>
              setDraft(
                remote
                  ? { ...draft, openaiModel: event.target.value }
                  : { ...draft, ollamaModel: event.target.value },
              )
            }
            placeholder={remote ? "gpt-4.1-mini" : "qwen3:4b"}
            spellCheck={false}
          />
        </label>

        {remote && (
          <label
            htmlFor="assistant-api-key"
            className="block space-y-1.5 text-[10px] font-semibold tracking-wide uppercase"
          >
            <span className="text-muted-foreground">
              {t("assistant.setup.apiKey")}
            </span>
            <Input
              id="assistant-api-key"
              aria-label={t("assistant.setup.apiKey")}
              type="password"
              value={draft.openaiApiKey ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, openaiApiKey: event.target.value || null })
              }
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        <div className="bg-muted/60 text-muted-foreground flex gap-2 border p-2 text-[10px] leading-relaxed">
          <FileLock2Icon
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <p>
            {remote
              ? t("assistant.setup.remoteDisclosure")
              : t("assistant.setup.localDisclosure")}
          </p>
        </div>

        <div className="border-border/70 flex items-center justify-between gap-3 border p-2.5">
          <span className="min-w-0">
            <span className="block text-xs font-semibold">
              {t("assistant.setup.tts")}
            </span>
            <span className="text-muted-foreground mt-0.5 block text-[9px] leading-relaxed">
              {t("assistant.setup.ttsDisclosure")}
            </span>
          </span>
          <Switch
            aria-label={t("assistant.setup.tts")}
            checked={draft.ttsEnabled}
            onCheckedChange={(ttsEnabled) =>
              setDraft({
                ...draft,
                ttsEnabled,
                ttsProvider: ttsEnabled ? "system" : "disabled",
              })
            }
          />
        </div>

        <Button
          className="w-full"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner /> : <ShieldCheckIcon aria-hidden="true" />}
          {t("assistant.setup.saveAndCheck")}
        </Button>
      </div>
    </section>
  );
}

export function AssistantPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const config = useSettingsStore((state) => state.config);
  const activeInstance = useInstanceStore((state) => state.activeInstance);
  const recentLogs = useGameStore((state) => state.recentLogs);
  const messages = useAssistantStore((state) => state.messages);
  const isProcessing = useAssistantStore((state) => state.isProcessing);
  const providerHealth = useAssistantStore((state) => state.providerHealth);
  const context = useAssistantStore((state) => state.context);
  const contextStatus = useAssistantStore((state) => state.contextStatus);
  const contextError = useAssistantStore((state) => state.contextError);
  const checkHealth = useAssistantStore((state) => state.checkHealth);
  const refreshContext = useAssistantStore((state) => state.refreshContext);
  const sendMessage = useAssistantStore((state) => state.sendMessage);
  const clearHistory = useAssistantStore((state) => state.clearHistory);
  const [draft, setDraft] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const spokenMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (initializedRef.current || !config) return;
    initializedRef.current = true;
    void checkHealth();
    void refreshContext(recentLogs.map((entry) => entry.message));
    if (searchParams.get("source") === "failure") {
      setDraft(t("assistant.prompts.failure"));
    }
  }, [checkHealth, config, recentLogs, refreshContext, searchParams, t]);

  useEffect(() => {
    void messages.length;
    transcriptEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const assistantConfig = config?.assistant;
  const isConfigured = assistantConfig ? configured(assistantConfig) : false;
  const canSend = isConfigured && providerHealth === "online";
  const providerName = assistantConfig
    ? assistantConfig.llmProvider === "ollama"
      ? t("assistant.setup.ollama")
      : t("assistant.setup.openai")
    : "—";
  const modelName = assistantConfig
    ? assistantConfig.llmProvider === "ollama"
      ? assistantConfig.ollamaModel
      : assistantConfig.openaiModel
    : "—";

  useEffect(() => {
    if (!assistantConfig?.ttsEnabled || isProcessing) return;
    if (
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      return;
    }
    const latest = messages.at(-1);
    if (
      !latest ||
      latest.role !== "assistant" ||
      latest.failed ||
      !latest.content ||
      spokenMessageIdRef.current === latest.id
    ) {
      return;
    }

    spokenMessageIdRef.current = latest.id;
    const utterance = new SpeechSynthesisUtterance(latest.content);
    utterance.lang = config?.language === "zh-CN" ? "zh-CN" : "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [assistantConfig?.ttsEnabled, config?.language, isProcessing, messages]);

  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (!canSend || !draft.trim()) return;
      const prompt = draft;
      const logContext =
        includeContext && context.lineCount > 0 ? context.content : null;
      setDraft("");
      setIncludeContext(false);
      await sendMessage(prompt, logContext);
    },
    [
      canSend,
      context.content,
      context.lineCount,
      draft,
      includeContext,
      sendMessage,
    ],
  );

  const copyContext = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(context.content);
      toast.success(t("assistant.context.copied"));
    } catch (error) {
      console.error("Failed to copy redacted assistant context:", error);
      toast.error(t("assistant.context.copyFailed"));
    }
  }, [context.content, t]);

  const emptyCopy = useMemo(
    () =>
      searchParams.get("source") === "failure"
        ? t("assistant.empty.failureDescription")
        : t("assistant.empty.description"),
    [searchParams, t],
  );

  return (
    <div className="relative z-10 h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-3 p-3 sm:p-4">
        <header className="flex flex-wrap items-end justify-between gap-3 px-0.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-primary size-1.5 rounded-full" />
              <p className="text-primary font-mono text-[10px] font-bold tracking-[0.18em] uppercase">
                {t("assistant.eyebrow")}
              </p>
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
              {t("assistant.title")}
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-xs leading-relaxed">
              {t("assistant.description")}
            </p>
          </div>
          <div className="border-border/70 bg-card/70 flex items-center gap-3 border px-3 py-2 backdrop-blur-md">
            <div className="min-w-0">
              <p className="text-muted-foreground font-mono text-[8px] tracking-wider uppercase">
                {providerName}
              </p>
              <p className="max-w-40 truncate text-[10px] font-semibold">
                {modelName || t("assistant.noModel")}
              </p>
            </div>
            <ProviderStatus />
          </div>
        </header>

        <div className="grid flex-1 grid-cols-[minmax(0,1.45fr)_minmax(250px,0.65fr)] items-start gap-3 max-[760px]:grid-cols-1">
          <section
            aria-labelledby="assistant-transcript-title"
            className="border-border/80 bg-card/88 flex h-[calc(100vh-150px)] min-h-[400px] max-h-[760px] min-w-0 flex-col border shadow-lg backdrop-blur-xl"
          >
            <div className="border-border/70 flex items-center justify-between gap-3 border-b px-3 py-2.5">
              <div>
                <p className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.12em] uppercase">
                  {t("assistant.workspace")}
                </p>
                <h2
                  id="assistant-transcript-title"
                  className="text-sm font-bold"
                >
                  {activeInstance?.name ?? t("assistant.noInstance")}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[10px]"
                disabled={messages.length === 0}
                onClick={clearHistory}
              >
                <EraserIcon aria-hidden="true" />
                {t("assistant.clear")}
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div
                className="flex min-h-[330px] flex-col gap-4 p-4"
                data-testid="assistant-transcript"
              >
                {messages.length === 0 ? (
                  <div className="m-auto max-w-lg py-8 text-center">
                    <span className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-full">
                      <SparklesIcon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-lg font-black tracking-tight">
                      {t("assistant.empty.title")}
                    </h3>
                    <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-xs leading-relaxed">
                      {emptyCopy}
                    </p>
                    <div className="mt-5 grid gap-2 text-left sm:grid-cols-3">
                      {promptKeys.map((key) => (
                        <button
                          key={key}
                          type="button"
                          className="border-border/80 bg-background/50 hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-ring min-h-20 border p-2.5 text-left text-[10px] font-semibold leading-relaxed transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canSend}
                          onClick={() => setDraft(t(key))}
                        >
                          {t(key)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={cn(
                        "flex max-w-[88%] gap-2.5",
                        message.role === "user" && "ml-auto flex-row-reverse",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : message.failed
                              ? "bg-red-500/10 text-red-600 dark:text-red-300"
                              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {message.role === "user" ? (
                          <UserRoundIcon
                            className="size-3.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <BotIcon className="size-3.5" aria-hidden="true" />
                        )}
                      </span>
                      <div
                        className={cn(
                          "border-border/70 min-w-0 border px-3 py-2.5 text-xs leading-relaxed",
                          message.role === "user"
                            ? "bg-primary/8"
                            : message.failed
                              ? "border-red-500/25 bg-red-500/5"
                              : "bg-background/55",
                        )}
                      >
                        {message.content ? (
                          <p className="whitespace-pre-wrap break-words">
                            {message.content}
                          </p>
                        ) : (
                          <span className="text-muted-foreground inline-flex items-center gap-2">
                            <Spinner />
                            {t("assistant.thinking")}
                          </span>
                        )}
                        {message.stats && (
                          <p className="text-muted-foreground mt-2 font-mono text-[8px] uppercase">
                            {t("assistant.tokens", {
                              count: Number(message.stats.evalCount),
                            })}
                          </p>
                        )}
                      </div>
                    </article>
                  ))
                )}
                <div ref={transcriptEndRef} />
              </div>
            </ScrollArea>
            <p className="sr-only" role="status" aria-live="polite">
              {isProcessing
                ? t("assistant.thinking")
                : messages.at(-1)?.role === "assistant" &&
                    messages.at(-1)?.content
                  ? t("assistant.responseReady")
                  : ""}
            </p>

            {!canSend && (
              <div className="border-border/70 bg-amber-500/8 text-amber-900 dark:text-amber-100 mx-3 mt-3 flex items-center gap-2 border px-3 py-2 text-[10px]">
                <CircleAlertIcon
                  className="size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {!isConfigured
                    ? t("assistant.setupRequired")
                    : t("assistant.providerUnavailable")}
                </span>
                {isConfigured && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 text-[9px]"
                    onClick={() => void checkHealth()}
                  >
                    <RefreshCwIcon aria-hidden="true" />
                    {t("common.retry")}
                  </Button>
                )}
              </div>
            )}

            <form
              className="mt-auto p-3"
              onSubmit={(event) => void submit(event)}
            >
              <div className="border-border/80 bg-background/55 focus-within:border-primary/60 border p-2 transition-colors">
                <Textarea
                  aria-label={t("assistant.composerLabel")}
                  className="min-h-20 resize-none border-0 bg-transparent p-1.5 shadow-none focus-visible:ring-0"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                  placeholder={t("assistant.composerPlaceholder")}
                  disabled={!canSend || isProcessing}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-[9px]">
                    {t("assistant.composerHint")}
                  </span>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!canSend || isProcessing || !draft.trim()}
                  >
                    {isProcessing ? (
                      <Spinner />
                    ) : (
                      <SendIcon aria-hidden="true" />
                    )}
                    {t("assistant.send")}
                  </Button>
                </div>
              </div>
            </form>
          </section>

          <aside className="flex min-w-0 flex-col gap-3">
            <section
              aria-labelledby="assistant-context-title"
              className="border-border/80 bg-card/88 border p-3 shadow-sm backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.12em] uppercase">
                    {t("assistant.context.eyebrow")}
                  </p>
                  <h2
                    id="assistant-context-title"
                    className="mt-0.5 text-sm font-bold"
                  >
                    {t("assistant.context.title")}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("assistant.context.refresh")}
                  disabled={contextStatus === "loading"}
                  onClick={() =>
                    void refreshContext(
                      recentLogs.map((entry) => entry.message),
                    )
                  }
                >
                  <RefreshCwIcon
                    className={cn(
                      "size-3.5",
                      contextStatus === "loading" && "animate-spin",
                    )}
                    aria-hidden="true"
                  />
                </Button>
              </div>

              <div className="border-border/70 mt-3 flex items-center justify-between gap-3 border p-2.5">
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">
                    {t("assistant.context.attach")}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[9px]">
                    {t("assistant.context.lines", { count: context.lineCount })}
                  </span>
                </span>
                <Switch
                  aria-label={t("assistant.context.attach")}
                  checked={includeContext}
                  disabled={context.lineCount === 0}
                  onCheckedChange={setIncludeContext}
                />
              </div>

              <div className="bg-zinc-950 text-zinc-300 mt-2 min-h-28 max-h-44 overflow-auto p-2.5 font-mono text-[8px] leading-relaxed">
                {contextStatus === "loading" ? (
                  <p className="text-zinc-500">
                    {t("assistant.context.loading")}
                  </p>
                ) : contextError ? (
                  <p className="text-red-300">{contextError}</p>
                ) : context.content ? (
                  <pre className="whitespace-pre-wrap break-words font-inherit">
                    {context.content}
                  </pre>
                ) : (
                  <p className="text-zinc-500">
                    {t("assistant.context.empty")}
                  </p>
                )}
              </div>

              <div className="text-muted-foreground mt-2 flex items-start gap-2 text-[9px] leading-relaxed">
                <ShieldCheckIcon
                  className="mt-0.5 size-3 shrink-0"
                  aria-hidden="true"
                />
                <p>{t("assistant.context.privacy")}</p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 w-full text-[9px]"
                disabled={!context.content}
                onClick={() => void copyContext()}
              >
                <ClipboardIcon aria-hidden="true" />
                {t("assistant.context.copy")}
              </Button>
            </section>

            <AssistantSetup />
          </aside>
        </div>
      </div>
    </div>
  );
}
