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
import { DisplayTitle } from "@/components/deco/display-title";
import { B64Block } from "@/components/deco/marks";
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
import { CREEPER_PNG } from "@/lib/eggs";
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
        "chip",
        status === "online" && "chip-go",
        status === "offline" && "chip-fault",
        (status === "idle" || status === "checking") && "chip-ghost",
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
    <section aria-labelledby="assistant-setup-title" className="win">
      <div aria-hidden="true" className="win-title">
        <span>PROVIDER.CFG</span>
        <Settings2Icon className="size-3" />
      </div>
      <div className="border-b border-rule px-2.5 py-2">
        <p className="type-pixel text-[11px] text-ink/60">
          {t("assistant.setup.eyebrow")}
        </p>
        <h2
          id="assistant-setup-title"
          className="font-display text-[16px] font-semibold tracking-[-0.03em]"
        >
          {t("assistant.setup.title")}
        </h2>
      </div>

      <div className="space-y-3 p-2.5">
        <div className="flex items-center justify-between gap-3 text-xs font-medium">
          <span>{t("assistant.setup.enabled")}</span>
          <Switch
            aria-label={t("assistant.setup.enabled")}
            checked={draft.enabled}
            onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
          />
        </div>

        <div className="block space-y-1 font-pixel text-[11px] uppercase">
          <span className="text-ink/65">{t("assistant.setup.provider")}</span>
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
          className="block space-y-1 font-pixel text-[11px] uppercase"
        >
          <span className="text-ink/65">{t("assistant.setup.endpoint")}</span>
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
          className="block space-y-1 font-pixel text-[11px] uppercase"
        >
          <span className="text-ink/65">{t("assistant.setup.model")}</span>
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
            className="block space-y-1 font-pixel text-[11px] uppercase"
          >
            <span className="text-ink/65">{t("assistant.setup.apiKey")}</span>
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

        <div className="dots flex gap-2 border border-dashed border-rule p-2 text-[11px] leading-relaxed text-ink/75">
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

        <div className="flex items-center justify-between gap-3 border border-rule bg-paper p-2.5">
          <span className="min-w-0">
            <span className="block text-xs font-semibold">
              {t("assistant.setup.tts")}
            </span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-ink/60">
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
    if (messages.length === 0) return;
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
    <div className="relative h-full overflow-x-hidden overflow-y-auto">
      <span
        aria-hidden="true"
        className="type-display glyph-dropped pointer-events-none absolute -top-6 left-[min(704px,calc(100%-220px))] -translate-x-full text-[180px] leading-none opacity-50 select-none"
      >
        03
      </span>
      <div className="relative flex min-h-full flex-col gap-4 px-6 pt-4 pb-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="tag text-[13px]">
              <span className="shrink-0">{t("assistant.eyebrow")}</span>
              <span aria-hidden="true" className="leader w-14" />
              <span className="max-w-48 truncate">{providerName}</span>
            </p>
            <DisplayTitle
              text={t("assistant.title")}
              stagger={false}
              className="mt-3 text-[51px]"
            />
            <p className="mt-2 max-w-2xl text-[13px] leading-snug text-ink/70">
              {t("assistant.description")}
            </p>
          </div>
          <div className="win min-w-48">
            <div aria-hidden="true" className="win-title">
              <span>LLM.LINK</span>
              <span className="opacity-60">∵ x</span>
            </div>
            <div className="flex items-center gap-3 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="type-pixel text-[11px] text-ink/60">
                  {providerName}
                </p>
                <p className="max-w-40 truncate font-display text-[14px] font-semibold tracking-[-0.02em]">
                  {modelName || t("assistant.noModel")}
                </p>
              </div>
              <ProviderStatus />
            </div>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-[minmax(0,1fr)_292px] items-start gap-4 max-[760px]:grid-cols-1">
          <section
            aria-labelledby="assistant-transcript-title"
            className="win flex h-[calc(100vh-250px)] min-h-[420px] max-h-[760px] min-w-0 flex-col"
          >
            <div aria-hidden="true" className="win-title shrink-0">
              <span>ASSISTANT.APP</span>
              <span className="opacity-70">
                {messages.length.toString().padStart(3, "0")} MSG
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2">
              <div className="min-w-0">
                <p className="type-pixel text-[11px] text-ink/60">
                  {t("assistant.workspace")}
                </p>
                <h2
                  id="assistant-transcript-title"
                  className="truncate font-display text-[17px] font-semibold tracking-[-0.03em]"
                >
                  {activeInstance?.name ?? t("assistant.noInstance")}
                </h2>
              </div>
              <Button
                variant="outline"
                size="xs"
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
                  <div className="m-auto max-w-xl py-6">
                    <SparklesIcon className="size-5" aria-hidden="true" />
                    <h3 className="type-display mt-3 text-[32px]">
                      {t("assistant.empty.title")}
                    </h3>
                    <p className="col-rule mt-3 max-w-md text-[13px] leading-relaxed text-ink/70">
                      {emptyCopy}
                    </p>
                    <div className="mt-5 grid gap-2 text-left sm:grid-cols-3">
                      {promptKeys.map((key, index) => (
                        <button
                          key={key}
                          type="button"
                          className="group/prompt relative min-h-24 cursor-pointer border border-dashed border-rule bg-sheet p-2.5 pt-6 text-left text-[11.5px] leading-snug font-medium transition-[background-color,color,box-shadow] outline-none hover:border-solid hover:shadow-[3px_3px_0_0_var(--signal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={!canSend}
                          onClick={() => setDraft(t(key))}
                        >
                          <span
                            aria-hidden="true"
                            className="type-pixel absolute top-1 left-2 text-[11px] text-ink/50"
                          >
                            Q.{String(index + 1).padStart(2, "0")}
                          </span>
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
                        "flex max-w-[min(88%,720px)] gap-2.5",
                        message.role === "user" && "ml-auto flex-row-reverse",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center border border-rule",
                          message.role === "user"
                            ? "bg-ink text-paper"
                            : message.failed
                              ? "bg-fault text-white"
                              : "bg-go text-[#1e1e1e]",
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
                          "min-w-0 border border-rule px-3 py-2.5 text-[12.5px] leading-relaxed",
                          message.role === "user"
                            ? "bg-ink text-paper"
                            : message.failed
                              ? "border-l-4 border-l-fault bg-sheet"
                              : "bg-sheet shadow-[3px_3px_0_0_var(--rule)]",
                        )}
                      >
                        <p
                          aria-hidden="true"
                          className="type-pixel mb-1 text-[10px] opacity-55"
                        >
                          {message.role === "user" ? "▸ YOU" : "◂ DROPOUT"}
                        </p>
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
                          <p className="type-pixel mt-2 text-[10px] opacity-60">
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
              <div className="mx-3 mt-3 flex items-center gap-2 border border-rule border-l-8 border-l-warn bg-sheet px-3 py-2 text-[11px]">
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
                    variant="outline"
                    size="xs"
                    className="ml-auto"
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
              <div className="border border-rule bg-sheet p-2 transition-shadow focus-within:shadow-[3px_3px_0_0_var(--signal)]">
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
                  <span className="type-pixel text-[11px] text-ink/55">
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
            <section aria-labelledby="assistant-context-title" className="win">
              <div aria-hidden="true" className="win-title">
                <span>PRIVACY.GATE</span>
                <span className="opacity-70">
                  {context.lineCount.toString().padStart(3, "0")} LN
                </span>
              </div>
              <div className="flex items-start justify-between gap-3 border-b border-rule px-2.5 py-2">
                <div>
                  <p className="type-pixel text-[11px] text-ink/60">
                    {t("assistant.context.eyebrow")}
                  </p>
                  <h2
                    id="assistant-context-title"
                    className="font-display text-[16px] font-semibold tracking-[-0.03em]"
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

              <div className="space-y-2 p-2.5">
                <div className="flex items-center justify-between gap-3 border border-rule bg-paper p-2.5">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">
                      {t("assistant.context.attach")}
                    </span>
                    <span className="type-pixel mt-0.5 block text-[11px] text-ink/60">
                      {t("assistant.context.lines", {
                        count: context.lineCount,
                      })}
                    </span>
                  </span>
                  <Switch
                    aria-label={t("assistant.context.attach")}
                    checked={includeContext}
                    disabled={context.lineCount === 0}
                    onCheckedChange={setIncludeContext}
                  />
                </div>

                <div className="type-mono max-h-44 min-h-28 overflow-auto border border-rule bg-[#1e1e1e] p-2.5 text-[10px] leading-relaxed text-[#d9d6cf]">
                  {contextStatus === "loading" ? (
                    <p className="text-[#8a877f]">
                      {t("assistant.context.loading")}
                    </p>
                  ) : contextError ? (
                    <p className="text-[#ff8a8e]">{contextError}</p>
                  ) : context.content ? (
                    <pre className="whitespace-pre-wrap break-words font-inherit">
                      {context.content}
                    </pre>
                  ) : (
                    <p className="text-[#8a877f]">
                      {t("assistant.context.empty")}
                    </p>
                  )}
                </div>

                <div className="flex items-start gap-2 text-[11px] leading-relaxed text-ink/65">
                  <ShieldCheckIcon
                    className="mt-0.5 size-3 shrink-0"
                    aria-hidden="true"
                  />
                  <p>{t("assistant.context.privacy")}</p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={!context.content}
                  onClick={() => void copyContext()}
                >
                  <ClipboardIcon aria-hidden="true" />
                  {t("assistant.context.copy")}
                </Button>
              </div>
            </section>

            <B64Block data={CREEPER_PNG} width={34} className="px-1 pt-2" />

            <AssistantSetup />
          </aside>
        </div>
      </div>
    </div>
  );
}
