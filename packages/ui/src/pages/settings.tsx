import { toNumber } from "es-toolkit/compat";
import { FileJsonIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useSettingsStore } from "@/models/settings";

export type SettingsTab = "general" | "appearance" | "advanced";

export function SettingsPage() {
  const { config, ...settings } = useSettingsStore();
  const [showConfigEditor, setShowConfigEditor] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  useEffect(() => {
    if (!config) settings.refresh();
  }, [config, settings.refresh]);

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
              <CardTitle className="font-bold text-xl">General</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>Window Options</FieldLegend>
                  <FieldDescription>
                    May not work on some platforms like Linux Niri.
                  </FieldDescription>
                  <FieldGroup>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel htmlFor="width">
                          Window Default Width
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
                          Window Default Height
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
                          GPU Acceleration
                        </FieldLabel>
                        <FieldDescription>
                          Enable GPU acceleration for the interface.
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
                  <FieldLegend>Network Options</FieldLegend>
                  <Field>
                    <Label htmlFor="download-threads">Download Threads</Label>
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
                Java Installations
              </CardTitle>
              <CardContent></CardContent>
            </CardHeader>
          </Card>
        </TabsContent>
        <TabsContent value="appearance" className="size-full">
          <Card className="size-full">
            <CardHeader>
              <CardTitle className="font-bold text-xl">Appearance</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field className="flex flex-row">
                  <FieldContent>
                    <FieldLabel htmlFor="theme">Theme</FieldLabel>
                    <FieldDescription>
                      Select your prefered theme.
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
                    <SelectTrigger className="w-full max-w-48">
                      <SelectValue placeholder="Please select a prefered theme" />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
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
              <CardTitle className="font-bold text-xl">Advanced</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>Advanced Options</FieldLegend>
                  <FieldGroup>
                    <Field className="flex flex-row items-center justify-between">
                      <FieldContent>
                        <FieldLabel htmlFor="use-shared-caches">
                          Use Shared Caches
                        </FieldLabel>
                        <FieldDescription>
                          Share downloaded assets between instances.
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
                          Keep Legacy Per-Instance Storage
                        </FieldLabel>
                        <FieldDescription>
                          Maintain separate cache folders for compatibility.
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
          Settings
        </h2>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfigEditor(true)}
        >
          <FileJsonIcon />
          <span className="hidden sm:inline">Open JSON</span>
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="size-full flex flex-col gap-6"
      >
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="java">Java</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
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
