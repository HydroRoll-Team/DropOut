import type React from "react";
import { useEffect, useState } from "react";
import { type ZodType, z } from "zod";
import { useSettingsStore } from "@/models/settings";
import type { LauncherConfig } from "@/types";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { FieldError } from "./ui/field";
import { Spinner } from "./ui/spinner";
import { Textarea } from "./ui/textarea";

const launcherConfigSchema: ZodType<LauncherConfig> = z.object({
  minMemory: z.number(),
  maxMemory: z.number(),
  javaPath: z.string(),
  width: z.number(),
  height: z.number(),
  downloadThreads: z.number(),
  customBackgroundPath: z.string().nullable(),
  enableGpuAcceleration: z.boolean(),
  enableVisualEffects: z.boolean(),
  activeEffect: z.string(),
  theme: z.string(),
  logUploadService: z.string(),
  pastebinApiKey: z.string().nullable(),
  assistant: z.any(), // TODO: AssistantConfig schema
  useSharedCaches: z.boolean(),
  keepLegacyPerInstanceStorage: z.boolean(),
  featureFlags: z.any(), // TODO: FeatureFlags schema
});

export interface ConfigEditorProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Dialog>, "onOpenChange"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigEditor({ onOpenChange, ...props }: ConfigEditorProps) {
  const settings = useSettingsStore();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawConfigContent, setRawConfigContent] = useState(
    JSON.stringify(settings.config, null, 2),
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setRawConfigContent(JSON.stringify(settings.config, null, 2));
  }, [settings.config]);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const validatedConfig = launcherConfigSchema.parse(
        JSON.parse(rawConfigContent),
      );
      settings.config = validatedConfig;
      await settings.save();
      onOpenChange?.(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Edit Configuration</DialogTitle>
          <DialogDescription>
            Edit the raw JSON configuration file.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={rawConfigContent}
          onChange={(e) => setRawConfigContent(e.target.value)}
          className="font-mono text-sm h-100 resize-none"
          spellCheck={false}
          aria-invalid={!!errorMessage}
        />

        {errorMessage && <FieldError errors={[{ message: errorMessage }]} />}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Spinner />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
