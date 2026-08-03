import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { toNumber } from "es-toolkit/compat";
import { FileJsonIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { migrateSharedCaches } from "@/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUpdater } from "@/components/updater";
import { setLanguage } from "@/i18n";
import { MAX_DOWNLOAD_THREADS, MIN_DOWNLOAD_THREADS } from "@/lib/config";
import { useJavaStore } from "@/models/java";
import { useSettingsStore } from "@/models/settings";

export type SettingsTab = "general" | "appearance" | "advanced";

export function SettingsPage() {
  const { config, ...settings } = useSettingsStore();
  const javaStore = useJavaStore();
  const updater = useUpdater();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauri()) return;

    let mounted = true;

    getVersion()
      .then((version) => {
        if (mounted) setAppVersion(version);
      })
      .catch((error) => console.error("Failed to read app version", error));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const refresh = async () => {
      try {
        await settings.refresh();
      } catch (error) {
        console.error(error);
        toast.error(`Failed to refresh settings: ${error}`);
      }
      try {
        await javaStore.refreshInstallations();
        if (!javaStore.catalog) await javaStore.refresh();
      } catch (error) {
        console.error(error);
        toast.error(`Failed to refresh java catalogs: ${error}`);
      }
    };
    refresh();
  }, [
    settings.refresh,
    javaStore.refresh,
    javaStore.refreshInstallations,
    javaStore.catalog,
  ]);

  const renderScrollArea = () => {
    if (!config) {
      return (
        <div className="size-full justify-center items-center">
          <Spinner />
        </div>
      );
    }
    return (
      <ScrollArea className="size-full pr-2">
        <TabsContent value="general" className="size-full">
          <Card className="size-full">
            <CardHeader>
              <CardTitle className="font-bold text-xl">
                {t("settings.general.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>
                    {t("settings.general.windowOptions")}
                  </FieldLegend>
                  <FieldDescription>
                    {t("settings.general.windowOptionsHint")}
                  </FieldDescription>
                  <FieldGroup>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel htmlFor="width">
                          {t("settings.general.width")}
                        </FieldLabel>
                        <Input
                          id="width"
                          type="number"
                          name="width"
                          value={config?.width}
                          onChange={(e) => {
                            settings.merge({
                              width: toNumber(e.target.value),
                            });
                          }}
                          onBlur={() => {
                            settings.save();
                          }}
                          min={800}
                          max={3840}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="height">
                          {t("settings.general.height")}
                        </FieldLabel>
                        <Input
                          id="height"
                          type="number"
                          name="height"
                          value={config?.height}
                          onChange={(e) => {
                            settings.merge({
                              height: toNumber(e.target.value),
                            });
                          }}
                          onBlur={() => {
                            settings.save();
                          }}
                          min={600}
                          max={2160}
                        />
                      </Field>
                    </div>
                    <Field className="flex flex-row items-center justify-between">
                      <FieldContent>
                        <FieldLabel htmlFor="gpu-acceleration">
                          {t("settings.general.gpuAcceleration")}
                        </FieldLabel>
                        <FieldDescription>
                          {t("settings.general.gpuAccelerationHint")}
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        id="gpu-acceleration"
                        aria-label={t("settings.general.gpuAcceleration")}
                        checked={config?.enableGpuAcceleration}
                        onCheckedChange={(checked) => {
                          settings.merge({
                            enableGpuAcceleration: checked,
                          });
                          settings.save();
                        }}
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>
                <FieldSet>
                  <FieldLegend>{t("settings.network.title")}</FieldLegend>
                  <Field>
                    <Label htmlFor="download-threads">
                      {t("settings.network.downloadThreads")}
                    </Label>
                    <Input
                      id="download-threads"
                      type="number"
                      name="download-threads"
                      value={config?.downloadThreads}
                      onChange={(e) => {
                        settings.merge({
                          downloadThreads: toNumber(e.target.value),
                        });
                      }}
                      onBlur={() => {
                        settings.save();
                      }}
                      min={MIN_DOWNLOAD_THREADS}
                      max={MAX_DOWNLOAD_THREADS}
                    />
                  </Field>
                  <Field className="flex flex-row">
                    <FieldContent>
                      <FieldLabel htmlFor="mirror-source">
                        {t("settings.network.mirror")}
                      </FieldLabel>
                      <FieldDescription>
                        {t("settings.network.mirrorHint")}
                      </FieldDescription>
                    </FieldContent>
                    <Select
                      items={[
                        { label: "Official", value: "official" },
                        { label: "BMCLAPI", value: "bmclapi" },
                      ]}
                      value={config.mirrorSource}
                      onValueChange={async (value) => {
                        if (value) {
                          settings.merge({ mirrorSource: value });
                          await settings.save();
                        }
                      }}
                    >
                      <SelectTrigger
                        aria-label={t("settings.network.mirror")}
                        className="w-full max-w-48"
                      >
                        <SelectValue
                          placeholder={t("settings.network.mirror")}
                        />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value="official">
                            {t("settings.network.official")}
                          </SelectItem>
                          <SelectItem value="bmclapi">
                            {t("settings.network.bmclapi")}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="github-proxy">
                      {t("settings.network.githubProxy")}
                    </FieldLabel>
                    <FieldDescription>
                      {t("settings.network.githubProxyHint")}
                    </FieldDescription>
                    <Input
                      id="github-proxy"
                      type="text"
                      placeholder="https://ghproxy.hydroroll.team"
                      value={config?.githubProxy ?? ""}
                      onChange={(e) => {
                        settings.merge({ githubProxy: e.target.value });
                      }}
                      onBlur={() => settings.save()}
                    />
                  </Field>
                </FieldSet>
                <FieldSet>
                  <FieldLegend>{t("settings.jvm.title")}</FieldLegend>
                  <Field className="flex flex-row">
                    <FieldContent>
                      <FieldLabel htmlFor="jvm-preset">
                        {t("settings.jvm.gcPreset")}
                      </FieldLabel>
                      <FieldDescription>
                        {t("settings.jvm.gcPresetHint")}
                      </FieldDescription>
                    </FieldContent>
                    <Select
                      items={[
                        { label: "Default", value: "default" },
                        { label: "G1GC (Recommended)", value: "g1gc" },
                        { label: "ZGC (Java 21+)", value: "zgc" },
                        { label: "Shenandoah", value: "shenandoah" },
                      ]}
                      value={config.jvmPreset}
                      onValueChange={async (value) => {
                        if (value) {
                          settings.merge({ jvmPreset: value });
                          await settings.save();
                        }
                      }}
                    >
                      <SelectTrigger
                        aria-label={t("settings.jvm.gcPreset")}
                        className="w-full max-w-48"
                      >
                        <SelectValue placeholder={t("settings.jvm.gcPreset")} />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value="default">
                            {t("settings.jvm.default")}
                          </SelectItem>
                          <SelectItem value="g1gc">
                            {t("settings.jvm.g1gc")}
                          </SelectItem>
                          <SelectItem value="zgc">
                            {t("settings.jvm.zgc")}
                          </SelectItem>
                          <SelectItem value="shenandoah">
                            {t("settings.jvm.shenandoah")}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="min-memory">
                      {t("settings.jvm.minMemory")}
                    </FieldLabel>
                    <Input
                      id="min-memory"
                      type="number"
                      name="min-memory"
                      value={config?.minMemory}
                      onChange={(e) => {
                        settings.merge({
                          minMemory: toNumber(e.target.value),
                        });
                      }}
                      onBlur={() => {
                        settings.save();
                      }}
                      min={256}
                      max={config?.maxMemory ?? 16384}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="max-memory">
                      {t("settings.jvm.maxMemory")}
                    </FieldLabel>
                    <Input
                      id="max-memory"
                      type="number"
                      name="max-memory"
                      value={config?.maxMemory}
                      onChange={(e) => {
                        settings.merge({
                          maxMemory: toNumber(e.target.value),
                        });
                      }}
                      onBlur={() => {
                        settings.save();
                      }}
                      min={config?.minMemory ?? 256}
                      max={32768}
                    />
                  </Field>
                </FieldSet>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="java" className="size-full">
          <Card className="size-full">
            <CardHeader>
              <CardTitle className="font-bold text-xl">
                {t("settings.java.title")}
              </CardTitle>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="java-path">
                      {t("settings.java.javaPath")}
                    </FieldLabel>
                    <Input
                      id="java-path"
                      type="text"
                      name="java-path"
                      value={config?.javaPath}
                      onChange={(e) => {
                        settings.merge({
                          javaPath: e.target.value,
                        });
                      }}
                      onBlur={() => {
                        settings.save();
                      }}
                    />
                  </Field>
                  <FieldSet>
                    <FieldLegend>{t("settings.java.title")}</FieldLegend>
                    {javaStore.installations ? (
                      <RadioGroup
                        value={config.javaPath}
                        onValueChange={(value) => {
                          settings.merge({
                            javaPath: value,
                          });
                          settings.save();
                        }}
                      >
                        {javaStore.installations?.map((installation) => (
                          <FieldLabel
                            key={installation.path}
                            htmlFor={installation.path}
                          >
                            <Field orientation="horizontal">
                              <FieldContent>
                                <FieldTitle>
                                  {installation.vendor} ({installation.version})
                                </FieldTitle>
                                <FieldDescription>
                                  {installation.path}
                                </FieldDescription>
                              </FieldContent>
                              <RadioGroupItem
                                value={installation.path}
                                id={installation.path}
                              />
                            </Field>
                          </FieldLabel>
                        ))}
                      </RadioGroup>
                    ) : (
                      <div className="flex justify-center items-center h-30">
                        <Spinner />
                      </div>
                    )}
                  </FieldSet>
                </FieldGroup>
              </CardContent>
            </CardHeader>
          </Card>
        </TabsContent>
        <TabsContent value="appearance" className="size-full">
          <Card className="size-full">
            <CardHeader>
              <CardTitle className="font-bold text-xl">
                {t("settings.appearance.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field className="flex flex-row">
                  <FieldContent>
                    <FieldLabel htmlFor="theme">
                      {t("settings.appearance.theme")}
                    </FieldLabel>
                    <FieldDescription>
                      {t("settings.appearance.themeHint")}
                    </FieldDescription>
                  </FieldContent>
                  <Select
                    items={[
                      { label: "Dark", value: "dark" },
                      { label: "Light", value: "light" },
                      { label: "System", value: "system" },
                    ]}
                    value={config.theme}
                    onValueChange={async (value) => {
                      if (
                        value === "system" ||
                        value === "light" ||
                        value === "dark"
                      ) {
                        settings.merge({ theme: value });
                        await settings.save();
                        settings.applyTheme(value);
                      }
                    }}
                  >
                    <SelectTrigger
                      aria-label={t("settings.appearance.theme")}
                      className="w-full max-w-48"
                    >
                      <SelectValue
                        placeholder={t("settings.appearance.theme")}
                      />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value="system">
                          {t("settings.appearance.system")}
                        </SelectItem>
                        <SelectItem value="light">
                          {t("settings.appearance.light")}
                        </SelectItem>
                        <SelectItem value="dark">
                          {t("settings.appearance.dark")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="flex flex-row">
                  <FieldContent>
                    <FieldLabel htmlFor="language">
                      {t("settings.appearance.language")}
                    </FieldLabel>
                    <FieldDescription>
                      {t("settings.appearance.languageHint")}
                    </FieldDescription>
                  </FieldContent>
                  <Select
                    items={[
                      { label: "Auto", value: "auto" },
                      { label: "English", value: "en" },
                      { label: "简体中文", value: "zh-CN" },
                    ]}
                    value={config.language}
                    onValueChange={async (value) => {
                      if (value) {
                        settings.merge({ language: value });
                        await settings.save();
                        setLanguage(value);
                      }
                    }}
                  >
                    <SelectTrigger
                      aria-label={t("settings.appearance.language")}
                      className="w-full max-w-48"
                    >
                      <SelectValue
                        placeholder={t("settings.appearance.language")}
                      />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value="auto">
                          {t("settings.appearance.auto")}
                        </SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="zh-CN">简体中文</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="advanced" className="size-full">
          <Card className="size-full">
            <CardHeader>
              <CardTitle className="font-bold text-xl">
                {t("settings.advanced.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>
                    {t("settings.advanced.advancedOptions")}
                  </FieldLegend>
                  <FieldGroup>
                    <Field className="flex flex-row items-center justify-between">
                      <FieldContent>
                        <FieldLabel htmlFor="use-shared-caches">
                          {t("settings.advanced.sharedCaches")}
                        </FieldLabel>
                        <FieldDescription>
                          {t("settings.advanced.sharedCachesHint")}
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        id="use-shared-caches"
                        aria-label={t("settings.advanced.sharedCaches")}
                        checked={config?.useSharedCaches}
                        onCheckedChange={async (checked) => {
                          checked && (await migrateSharedCaches());
                          settings.merge({
                            useSharedCaches: checked,
                          });
                          settings.save();
                        }}
                      />
                    </Field>
                    <Field className="flex flex-row items-center justify-between">
                      <FieldContent>
                        <FieldLabel htmlFor="keep-per-instance-storage">
                          {t("settings.advanced.legacyStorage")}
                        </FieldLabel>
                        <FieldDescription>
                          {t("settings.advanced.legacyStorageHint")}
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        id="keep-per-instance-storage"
                        aria-label={t("settings.advanced.legacyStorage")}
                        checked={config?.keepLegacyPerInstanceStorage}
                        onCheckedChange={(checked) => {
                          settings.merge({
                            keepLegacyPerInstanceStorage: checked,
                          });
                          settings.save();
                        }}
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>
                <FieldSet>
                  <FieldLegend>{t("settings.advanced.systemTray")}</FieldLegend>
                  <FieldGroup>
                    <Field className="flex flex-row items-center justify-between">
                      <FieldContent>
                        <FieldLabel htmlFor="enable-system-tray">
                          {t("settings.advanced.enableSystemTray")}
                        </FieldLabel>
                        <FieldDescription>
                          {t("settings.advanced.enableSystemTrayHint")}
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        id="enable-system-tray"
                        aria-label={t("settings.advanced.enableSystemTray")}
                        checked={config?.enableSystemTray}
                        onCheckedChange={(checked) => {
                          settings.merge({
                            enableSystemTray: checked,
                          });
                          settings.save();
                        }}
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>
                <FieldSet>
                  <FieldLegend>{t("settings.advanced.guidedTour")}</FieldLegend>
                  <FieldGroup>
                    <Field className="flex flex-row items-center justify-between">
                      <FieldContent>
                        <FieldLabel htmlFor="first-launch-completed">
                          {t("settings.advanced.firstLaunchCompleted")}
                        </FieldLabel>
                        <FieldDescription>
                          {t("settings.advanced.firstLaunchCompletedHint")}
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        id="first-launch-completed"
                        aria-label={t("settings.advanced.firstLaunchCompleted")}
                        checked={config?.firstLaunchCompleted}
                        onCheckedChange={(checked) => {
                          settings.merge({
                            firstLaunchCompleted: checked,
                          });
                          settings.save();
                        }}
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>
                <FieldSet>
                  <FieldLegend>{t("settings.advanced.updates")}</FieldLegend>
                  <FieldGroup>
                    <Field className="flex flex-row items-center justify-between">
                      <FieldContent>
                        <FieldLabel>
                          {t("settings.advanced.currentVersion")}
                        </FieldLabel>
                        <FieldDescription>
                          {appVersion ? `v${appVersion}` : "—"}
                        </FieldDescription>
                      </FieldContent>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updater.checkForUpdate(false)}
                        disabled={updater.checking}
                      >
                        {updater.checking
                          ? t("settings.advanced.checking")
                          : t("settings.advanced.checkUpdates")}
                      </Button>
                    </Field>
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>
      </ScrollArea>
    );
  };

  return (
    <div className="size-full flex flex-col p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black bg-clip-text text-transparent bg-linear-to-r dark:from-white dark:to-white/60 from-gray-900 to-gray-600">
          Settings
        </h2>

        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/settings/editor")}
        >
          <FileJsonIcon />
          <span className="hidden sm:inline">{t("settings.openJson")}</span>
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="size-full flex flex-col gap-6"
      >
        <TabsList>
          <TabsTrigger value="general">
            {t("settings.tabs.general")}
          </TabsTrigger>
          <TabsTrigger value="java">{t("settings.tabs.java")}</TabsTrigger>
          <TabsTrigger value="appearance">
            {t("settings.tabs.appearance")}
          </TabsTrigger>
          <TabsTrigger value="advanced">
            {t("settings.tabs.advanced")}
          </TabsTrigger>
        </TabsList>
        {renderScrollArea()}
      </Tabs>
    </div>
  );
}
