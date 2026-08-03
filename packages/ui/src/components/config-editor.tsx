import {
  BracesIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  RotateCcwIcon,
  WandSparklesIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { type ZodType, z } from "zod";
import { setLanguage } from "@/i18n";
import { MAX_DOWNLOAD_THREADS, MIN_DOWNLOAD_THREADS } from "@/lib/config";
import { useSettingsStore } from "@/models/settings";
import type { LauncherConfig } from "@/types";
import {
  MonacoJsonEditor,
  type MonacoJsonEditorHandle,
} from "./monaco-json-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { FieldError } from "./ui/field";
import { Spinner } from "./ui/spinner";

const launcherConfigSchema: ZodType<LauncherConfig> = z.object({
  minMemory: z.number(),
  maxMemory: z.number(),
  javaPath: z.string(),
  width: z.number(),
  height: z.number(),
  downloadThreads: z
    .number()
    .min(MIN_DOWNLOAD_THREADS)
    .max(MAX_DOWNLOAD_THREADS),
  customBackgroundPath: z.string().nullable(),
  enableGpuAcceleration: z.boolean(),
  enableVisualEffects: z.boolean(),
  activeEffect: z.string(),
  theme: z.string(),
  logUploadService: z.string(),
  pastebinApiKey: z.string().nullable(),
  assistant: z.object({
    enabled: z.boolean(),
    llmProvider: z.string(),
    ollamaEndpoint: z.string(),
    ollamaModel: z.string(),
    openaiApiKey: z.string().nullable(),
    openaiEndpoint: z.string(),
    openaiModel: z.string(),
    systemPrompt: z.string(),
    responseLanguage: z.string(),
    ttsEnabled: z.boolean(),
    ttsProvider: z.string(),
  }),
  useSharedCaches: z.boolean(),
  keepLegacyPerInstanceStorage: z.boolean(),
  featureFlags: z.object({
    demoUser: z.boolean(),
    quickPlayEnabled: z.boolean(),
    quickPlayPath: z.string().nullable(),
    quickPlaySingleplayer: z.boolean(),
    quickPlayMultiplayerServer: z.string().nullable(),
  }),
  mirrorSource: z.string(),
  language: z.string(),
  enableSystemTray: z.boolean(),
  closeToTray: z.boolean(),
  startMinimizedToTray: z.boolean(),
  minimizeToTrayAfterLaunch: z.boolean(),
  firstLaunchCompleted: z.boolean(),
  jvmPreset: z.string(),
  githubProxy: z.string(),
});

const launcherConfigJsonSchema = z.toJSONSchema(launcherConfigSchema) as Record<
  string,
  unknown
>;

function serializeConfig(config: LauncherConfig | null) {
  return config ? JSON.stringify(config, null, 2) : "";
}

type ValidationResult =
  | { valid: true; config: LauncherConfig }
  | { valid: false; message: string };

function validateConfig(content: string): ValidationResult {
  try {
    const parsed: unknown = JSON.parse(content);
    const result = launcherConfigSchema.safeParse(parsed);
    if (result.success) return { valid: true, config: result.data };

    const issue = result.error.issues[0];
    const path = issue?.path.join(".") || "config";
    return {
      valid: false,
      message: `${path}: ${issue?.message ?? "Invalid configuration"}`,
    };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface ConfigEditorProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Dialog>, "onOpenChange"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigEditor({ onOpenChange, ...props }: ConfigEditorProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const editorRef = useRef<MonacoJsonEditorHandle>(null);

  const initialContent = serializeConfig(settings.config);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [rawConfigContent, setRawConfigContent] = useState(initialContent);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [savedNotice, setSavedNotice] = useState(false);

  const isDirty = rawConfigContent !== savedContent;
  const validation = useMemo(
    () => validateConfig(rawConfigContent),
    [rawConfigContent],
  );
  const isDark = document.documentElement.classList.contains("dark");

  useEffect(() => {
    const nextContent = serializeConfig(settings.config);
    setSavedContent(nextContent);
    setRawConfigContent(nextContent);
    setSavedNotice(Boolean(nextContent));
  }, [settings.config]);

  const handleEditorChange = useCallback((value: string) => {
    setRawConfigContent(value);
    setSaveError(null);
    setSavedNotice(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving || !isDirty || !validation.valid) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await settings.update(validation.config);
      settings.applyTheme(validation.config.theme);
      setLanguage(validation.config.language);
      setSavedContent(rawConfigContent);
      setSavedNotice(true);
      toast.success(t("config.saved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
      toast.error(t("config.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [isDirty, isSaving, rawConfigContent, settings, t, validation]);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onOpenChange(false);
  }, [isDirty, onOpenChange]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) onOpenChange(true);
      else requestClose();
    },
    [onOpenChange, requestClose],
  );

  return (
    <>
      <Dialog onOpenChange={handleOpenChange} {...props}>
        <DialogContent className="grid h-[min(92vh,760px)] max-h-[calc(100vh-1.5rem)] w-[min(94vw,1120px)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[1120px]">
          <DialogHeader className="border-border/70 border-b px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="min-w-0">
                <p className="text-primary text-[9px] font-bold uppercase tracking-[0.2em]">
                  {t("config.eyebrow")}
                </p>
                <DialogTitle className="mt-1 flex items-center gap-2 text-lg">
                  <BracesIcon className="text-primary size-4" />
                  {t("config.title")}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {t("config.description")}
                </DialogDescription>
              </div>
              <span className="border-primary/30 bg-primary/8 text-primary mt-1 shrink-0 border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]">
                Monaco · JSON
              </span>
            </div>
            <p
              className="text-muted-foreground mt-2 truncate font-mono text-[9px]"
              title={settings.configPath ?? undefined}
            >
              {settings.configPath ?? t("config.pathUnavailable")}
            </p>
          </DialogHeader>

          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
            <div className="border-border/70 bg-muted/25 flex items-center justify-between gap-3 border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
                  launcher-config.json
                </span>
                {isDirty && (
                  <span
                    className="bg-amber-500 size-1.5 rounded-full"
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void editorRef.current?.format()}
                  disabled={!settings.config || isSaving}
                >
                  <WandSparklesIcon />
                  {t("config.format")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRawConfigContent(savedContent);
                    setSaveError(null);
                    setSavedNotice(true);
                  }}
                  disabled={!isDirty || isSaving}
                >
                  <RotateCcwIcon />
                  {t("config.reset")}
                </Button>
              </div>
            </div>

            {settings.config ? (
              <MonacoJsonEditor
                ref={editorRef}
                ariaLabel={t("config.editorLabel")}
                className="bg-[#0a0a0c]"
                dark={isDark}
                jsonSchema={launcherConfigJsonSchema}
                value={rawConfigContent}
                onChange={handleEditorChange}
                onCursorChange={(line, column) => setCursor({ line, column })}
                onSave={() => void handleSave()}
              />
            ) : (
              <div className="bg-card/70 flex min-h-0 items-center justify-center">
                <Spinner className="size-5" />
                <span className="text-muted-foreground ml-2 text-xs">
                  {t("config.loading")}
                </span>
              </div>
            )}

            <div
              data-testid="config-editor-status"
              className="border-border/70 bg-muted/30 text-muted-foreground flex min-w-0 items-center justify-between gap-3 border-t px-3 py-1.5 font-mono text-[9px]"
              aria-live="polite"
            >
              <div className="flex min-w-0 items-center gap-2">
                {validation.valid ? (
                  <CheckCircle2Icon className="size-3 shrink-0 text-emerald-600 dark:text-emerald-300" />
                ) : (
                  <CircleAlertIcon className="text-destructive size-3 shrink-0" />
                )}
                <span
                  className={
                    validation.valid ? "truncate" : "text-destructive truncate"
                  }
                  title={validation.valid ? undefined : validation.message}
                >
                  {validation.valid
                    ? isDirty
                      ? t("config.validUnsaved")
                      : savedNotice
                        ? t("config.validSaved")
                        : t("config.valid")
                    : validation.message}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span>{t("config.cursor", cursor)}</span>
                <span>UTF-8</span>
                <span>JSON</span>
              </div>
            </div>
          </div>

          <div className="border-border/70 bg-background flex min-w-0 items-center justify-between gap-3 border-t px-4 py-3">
            <div className="min-w-0" aria-live="assertive">
              {saveError && <FieldError errors={[{ message: saveError }]} />}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={isSaving}
              >
                {t("config.close")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || !isDirty || !validation.valid}
              >
                {isSaving ? <Spinner /> : <CheckCircle2Icon />}
                {t("config.save")}
                <span className="text-primary-foreground/65 ml-1 hidden font-mono text-[9px] sm:inline">
                  ⌘/Ctrl S
                </span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showDiscardConfirm}
        onOpenChange={setShowDiscardConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("config.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("config.discardDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("config.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => onOpenChange(false)}
            >
              {t("config.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
