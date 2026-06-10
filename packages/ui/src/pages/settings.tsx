import { toNumber } from "es-toolkit/compat";
import { FileJsonIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { migrateSharedCaches } from "@/client";
import { ConfigEditor } from "@/components/config-editor";
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
import { useI18n } from "@/lib/i18n";
import { useJavaStore } from "@/models/java";
import { useSettingsStore } from "@/models/settings";

export type SettingsTab = "general" | "java" | "appearance" | "advanced";

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const { config, ...settings } = useSettingsStore();
  const javaStore = useJavaStore();
  const [showConfigEditor, setShowConfigEditor] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  useEffect(() => {
    const refresh = async () => {
      try {
        await settings.refresh();
      } catch (error) {
        console.error(error);
        toast.error(t("settings.refreshFailed", { error: String(error) }));
      }
      try {
        await javaStore.refreshInstallations();
        if (!javaStore.catalog) await javaStore.refresh();
      } catch (error) {
        console.error(error);
        toast.error(t("settings.javaCatalogFailed", { error: String(error) }));
      }
    };
    refresh();
  }, [
    settings.refresh,
    javaStore.refresh,
    javaStore.refreshInstallations,
    javaStore.catalog,
    t,
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
                  <FieldLegend>{t("settings.window.title")}</FieldLegend>
                  <FieldDescription>
                    {t("settings.window.desc")}
                  </FieldDescription>
                  <FieldGroup>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel htmlFor="width">
                          {t("settings.window.width")}
                        </FieldLabel>
                        <Input
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
                          {t("settings.window.height")}
                        </FieldLabel>
                        <Input
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
                          {t("settings.window.gpu")}
                        </FieldLabel>
                        <FieldDescription>
                          {t("settings.window.gpuDesc")}
                        </FieldDescription>
                      </FieldContent>
                      <Switch
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
                      {t("settings.network.threads")}
                    </Label>
                    <Input
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
                      min={1}
                      max={64}
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
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="java-path">
                    {t("settings.java.path")}
                  </FieldLabel>
                  <Input
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
                  <FieldLegend>{t("settings.java.installs")}</FieldLegend>
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
                      {t("settings.appearance.themeDesc")}
                    </FieldDescription>
                  </FieldContent>
                  <Select
                    items={[
                      { label: t("settings.theme.dark"), value: "dark" },
                      { label: t("settings.theme.light"), value: "light" },
                      { label: t("settings.theme.system"), value: "system" },
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
                    <SelectTrigger className="w-full max-w-48">
                      <SelectValue
                        placeholder={t("settings.appearance.themePlaceholder")}
                      />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value="system">
                          {t("settings.theme.system")}
                        </SelectItem>
                        <SelectItem value="light">
                          {t("settings.theme.light")}
                        </SelectItem>
                        <SelectItem value="dark">
                          {t("settings.theme.dark")}
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
                      {t("settings.appearance.languageDesc")}
                    </FieldDescription>
                  </FieldContent>
                  <Select
                    items={[
                      { label: t("lang.chinese"), value: "zh" },
                      { label: t("lang.english"), value: "en" },
                    ]}
                    value={locale}
                    onValueChange={(value) => {
                      if (value === "zh" || value === "en") {
                        setLocale(value);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full max-w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value="zh">{t("lang.chinese")}</SelectItem>
                        <SelectItem value="en">{t("lang.english")}</SelectItem>
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
                  <FieldLegend>{t("settings.advanced.options")}</FieldLegend>
                  <FieldGroup>
                    <Field className="flex flex-row items-center justify-between">
                      <FieldContent>
                        <FieldLabel htmlFor="use-shared-caches">
                          {t("settings.advanced.sharedCaches")}
                        </FieldLabel>
                        <FieldDescription>
                          {t("settings.advanced.sharedCachesDesc")}
                        </FieldDescription>
                      </FieldContent>
                      <Switch
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
                          {t("settings.advanced.legacyStorageDesc")}
                        </FieldDescription>
                      </FieldContent>
                      <Switch
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
          {t("settings.title")}
        </h2>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfigEditor(true)}
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
          <TabsTrigger value="general">{t("settings.tab.general")}</TabsTrigger>
          <TabsTrigger value="java">{t("settings.tab.java")}</TabsTrigger>
          <TabsTrigger value="appearance">
            {t("settings.tab.appearance")}
          </TabsTrigger>
          <TabsTrigger value="advanced">
            {t("settings.tab.advanced")}
          </TabsTrigger>
        </TabsList>
        {renderScrollArea()}
      </Tabs>

      <ConfigEditor
        open={showConfigEditor}
        onOpenChange={() => setShowConfigEditor(false)}
      />
    </div>
  );
}
