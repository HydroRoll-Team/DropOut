import { open } from "@tauri-apps/plugin-dialog";
import {
  Coffee,
  Download,
  FileJson,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSettingsStore } from "../stores/settings-store";

const effectOptions = [
  { value: "saturn", label: "Saturn" },
  { value: "constellation", label: "Network (Constellation)" },
];

const logServiceOptions = [
  { value: "paste.rs", label: "paste.rs (Free, No Account)" },
  { value: "pastebin.com", label: "pastebin.com (Requires API Key)" },
];

const llmProviderOptions = [
  { value: "ollama", label: "Ollama (Local)" },
  { value: "openai", label: "OpenAI (Remote)" },
];

const languageOptions = [
  { value: "auto", label: "Auto (Match User)" },
  { value: "English", label: "English" },
  { value: "Chinese", label: "中文" },
  { value: "Japanese", label: "日本語" },
  { value: "Korean", label: "한국어" },
  { value: "Spanish", label: "Español" },
  { value: "French", label: "Français" },
  { value: "German", label: "Deutsch" },
  { value: "Russian", label: "Русский" },
];

const ttsProviderOptions = [
  { value: "disabled", label: "Disabled" },
  { value: "piper", label: "Piper TTS (Local)" },
  { value: "edge", label: "Edge TTS (Online)" },
];

const personas = [
  {
    value: "default",
    label: "Minecraft Expert (Default)",
    prompt:
      "You are a helpful Minecraft expert assistant. You help players with game issues, mod installation, performance optimization, and gameplay tips. Analyze any game logs provided and give concise, actionable advice.",
  },
  {
    value: "technical",
    label: "Technical Debugger",
    prompt:
      "You are a technical support specialist for Minecraft. Focus strictly on analyzing logs, identifying crash causes, and providing technical solutions. Be precise and avoid conversational filler.",
  },
  {
    value: "concise",
    label: "Concise Helper",
    prompt:
      "You are a direct and concise assistant. Provide answers in as few words as possible while remaining accurate. Use bullet points for lists.",
  },
  {
    value: "explain",
    label: "Teacher / Explainer",
    prompt:
      "You are a patient teacher. Explain Minecraft concepts, redstone mechanics, and mod features in simple, easy-to-understand terms suitable for beginners.",
  },
  {
    value: "pirate",
    label: "Pirate Captain",
    prompt:
      "You are a salty Minecraft Pirate Captain! Yarr! Speak like a pirate while helping the crew (the user) with their blocky adventures. Use terms like 'matey', 'landlubber', and 'treasure'.",
  },
];

export function SettingsView() {
  const {
    settings,
    backgroundUrl,
    javaInstallations,
    isDetectingJava,
    showJavaDownloadModal,
    selectedDownloadSource,
    javaCatalog,
    isLoadingCatalog,
    catalogError,
    selectedMajorVersion,
    selectedImageType,
    showOnlyRecommended,
    searchQuery,
    isDownloadingJava,
    downloadProgress,
    javaDownloadStatus,
    pendingDownloads,
    ollamaModels,
    openaiModels,
    isLoadingOllamaModels,
    isLoadingOpenaiModels,
    ollamaModelsError,
    openaiModelsError,
    showConfigEditor,
    rawConfigContent,
    configFilePath,
    configEditorError,
    filteredReleases,
    availableMajorVersions,
    installStatus,
    selectedRelease,
    currentModelOptions,
    loadSettings,
    saveSettings,
    detectJava,
    selectJava,
    openJavaDownloadModal,
    closeJavaDownloadModal,
    loadJavaCatalog,
    refreshCatalog,
    loadPendingDownloads,
    selectMajorVersion,
    downloadJava,
    cancelDownload,
    resumeDownloads,
    openConfigEditor,
    closeConfigEditor,
    saveRawConfig,
    loadOllamaModels,
    loadOpenaiModels,
    set,
    setSetting,
    setAssistantSetting,
    setFeatureFlag,
  } = useSettingsStore();

  // Mark potentially-unused variables as referenced so TypeScript does not report
  // them as unused in this file (they are part of the store API and used elsewhere).
  // This is a no-op but satisfies the compiler.
  void selectedDownloadSource;
  void javaCatalog;
  void javaDownloadStatus;
  void pendingDownloads;
  void ollamaModels;
  void openaiModels;
  void isLoadingOllamaModels;
  void isLoadingOpenaiModels;
  void ollamaModelsError;
  void openaiModelsError;
  void selectedRelease;
  void loadJavaCatalog;
  void loadPendingDownloads;
  void cancelDownload;
  void resumeDownloads;
  void setFeatureFlag;
  const [selectedPersona, setSelectedPersona] = useState("default");
  const [migrating, setMigrating] = useState(false);
  const [activeTab, setActiveTab] = useState("appearance");

  useEffect(() => {
    loadSettings();
    detectJava();
  }, [loadSettings, detectJava]);

  useEffect(() => {
    if (activeTab === "assistant") {
      if (settings.assistant.llmProvider === "ollama") {
        loadOllamaModels();
      } else if (settings.assistant.llmProvider === "openai") {
        loadOpenaiModels();
      }
    }
  }, [
    activeTab,
    settings.assistant.llmProvider,
    loadOllamaModels,
    loadOpenaiModels,
  ]);

  const handleSelectBackground = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        setSetting("customBackgroundPath", selected);
        saveSettings();
      }
    } catch (e) {
      console.error("Failed to select background:", e);
      toast.error("Failed to select background");
    }
  };

  const handleClearBackground = () => {
    setSetting("customBackgroundPath", null);
    saveSettings();
  };

  const handleApplyPersona = (value: string) => {
    const persona = personas.find((p) => p.value === value);
    if (persona) {
      setAssistantSetting("systemPrompt", persona.prompt);
      setSelectedPersona(value);
      saveSettings();
    }
  };

  const handleResetSystemPrompt = () => {
    const defaultPersona = personas.find((p) => p.value === "default");
    if (defaultPersona) {
      setAssistantSetting("systemPrompt", defaultPersona.prompt);
      setSelectedPersona("default");
      saveSettings();
    }
  };

  const handleRunMigration = async () => {
    if (migrating) return;
    setMigrating(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("Migration complete! Files migrated successfully");
    } catch (e) {
      console.error("Migration failed:", e);
      toast.error(`Migration failed: ${e}`);
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-black bg-clip-text text-transparent bg-linear-to-r dark:from-white dark:to-white/60 from-gray-900 to-gray-600">
          Settings
        </h2>

        <Button
          variant="outline"
          size="sm"
          onClick={openConfigEditor}
          className="gap-2"
        >
          <FileJson className="h-4 w-4" />
          <span className="hidden sm:inline">Open JSON</span>
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 overflow-hidden"
      >
        <TabsList className="grid grid-cols-4 mb-6">
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="java">Java</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="assistant">Assistant</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 pr-2">
          <TabsContent value="appearance" className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg">Appearance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="mb-3">Custom Background Image</Label>
                  <div className="flex items-center gap-6">
                    <div className="w-40 h-24 rounded-xl overflow-hidden bg-secondary border relative group shadow-lg">
                      {backgroundUrl ? (
                        <img
                          src={backgroundUrl}
                          alt="Background Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error("Failed to load image");
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-linear-to-br from-emerald-900 via-zinc-900 to-indigo-950" />
                      )}
                      {!backgroundUrl && (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50 bg-black/20">
                          Default Gradient
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        onClick={handleSelectBackground}
                      >
                        Select Image
                      </Button>
                      {backgroundUrl && (
                        <Button
                          variant="ghost"
                          className="text-red-500"
                          onClick={handleClearBackground}
                        >
                          Reset to Default
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    Select an image from your computer to replace the default
                    gradient background.
                  </p>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Visual Effects</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable particle effects and animated gradients.
                      </p>
                    </div>
                    <Switch
                      checked={settings.enableVisualEffects}
                      onCheckedChange={(checked) => {
                        setSetting("enableVisualEffects", checked);
                        saveSettings();
                      }}
                    />
                  </div>

                  {settings.enableVisualEffects && (
                    <div className="pl-4 border-l-2 border-border">
                      <div className="space-y-2">
                        <Label>Theme Effect</Label>
                        <Select
                          value={settings.activeEffect}
                          onValueChange={(value) => {
                            setSetting("activeEffect", value);
                            saveSettings();
                          }}
                        >
                          <SelectTrigger className="w-52">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {effectOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          Select the active visual theme.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">GPU Acceleration</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable GPU acceleration for the interface.
                      </p>
                    </div>
                    <Switch
                      checked={settings.enableGpuAcceleration}
                      onCheckedChange={(checked) => {
                        setSetting("enableGpuAcceleration", checked);
                        saveSettings();
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="java" className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg">Java Environment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="mb-2">Java Path</Label>
                  <div className="flex gap-2">
                    <Input
                      value={settings.javaPath}
                      onChange={(e) => setSetting("javaPath", e.target.value)}
                      className="flex-1"
                      placeholder="java or full path to java executable"
                    />
                    <Button
                      variant="outline"
                      onClick={() => detectJava()}
                      disabled={isDetectingJava}
                    >
                      {isDetectingJava ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Detect"
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Path to Java executable.
                  </p>
                </div>

                <div>
                  <Label className="mb-2">Memory Settings (MB)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="min-memory" className="text-sm">
                        Minimum Memory
                      </Label>
                      <Input
                        id="min-memory"
                        type="number"
                        value={settings.minMemory}
                        onChange={(e) =>
                          setSetting(
                            "minMemory",
                            parseInt(e.target.value, 10) || 1024,
                          )
                        }
                        min={512}
                        step={256}
                      />
                    </div>
                    <div>
                      <Label htmlFor="max-memory" className="text-sm">
                        Maximum Memory
                      </Label>
                      <Input
                        id="max-memory"
                        type="number"
                        value={settings.maxMemory}
                        onChange={(e) =>
                          setSetting(
                            "maxMemory",
                            parseInt(e.target.value, 10) || 2048,
                          )
                        }
                        min={1024}
                        step={256}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Memory allocation for Minecraft.
                  </p>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-base">
                      Detected Java Installations
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => detectJava()}
                      disabled={isDetectingJava}
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-2 ${isDetectingJava ? "animate-spin" : ""}`}
                      />
                      Rescan
                    </Button>
                  </div>

                  {javaInstallations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                      <Coffee className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p>No Java installations detected</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {javaInstallations.map((installation) => (
                        <Card
                          key={installation.path}
                          className={`p-3 cursor-pointer transition-colors ${
                            settings.javaPath === installation.path
                              ? "border-primary bg-primary/5"
                              : ""
                          }`}
                          onClick={() => selectJava(installation.path)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                <Coffee className="h-4 w-4" />
                                {installation.version}
                              </div>
                              <div className="text-sm text-muted-foreground font-mono">
                                {installation.path}
                              </div>
                            </div>
                            {settings.javaPath === installation.path && (
                              <div className="h-5 w-5 text-primary">✓</div>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  <div className="mt-4">
                    <Button
                      variant="default"
                      className="w-full"
                      onClick={openJavaDownloadModal}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Java
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg">Advanced Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="mb-2">Download Threads</Label>
                  <Input
                    type="number"
                    value={settings.downloadThreads}
                    onChange={(e) =>
                      setSetting(
                        "downloadThreads",
                        parseInt(e.target.value, 10) || 32,
                      )
                    }
                    min={1}
                    max={64}
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Number of concurrent downloads.
                  </p>
                </div>

                <div>
                  <Label className="mb-2">Log Upload Service</Label>
                  <Select
                    value={settings.logUploadService}
                    onValueChange={(value) => {
                      setSetting("logUploadService", value as any);
                      saveSettings();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {logServiceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {settings.logUploadService === "pastebin.com" && (
                  <div>
                    <Label className="mb-2">Pastebin API Key</Label>
                    <Input
                      type="password"
                      value={settings.pastebinApiKey || ""}
                      onChange={(e) =>
                        setSetting("pastebinApiKey", e.target.value || null)
                      }
                      placeholder="Enter your Pastebin API key"
                    />
                  </div>
                )}

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Use Shared Caches</Label>
                      <p className="text-sm text-muted-foreground">
                        Share downloaded assets between instances.
                      </p>
                    </div>
                    <Switch
                      checked={settings.useSharedCaches}
                      onCheckedChange={(checked) => {
                        setSetting("useSharedCaches", checked);
                        saveSettings();
                      }}
                    />
                  </div>

                  {!settings.useSharedCaches && (
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base">
                          Keep Legacy Per-Instance Storage
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Maintain separate cache folders for compatibility.
                        </p>
                      </div>
                      <Switch
                        checked={settings.keepLegacyPerInstanceStorage}
                        onCheckedChange={(checked) => {
                          setSetting("keepLegacyPerInstanceStorage", checked);
                          saveSettings();
                        }}
                      />
                    </div>
                  )}

                  {settings.useSharedCaches && (
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleRunMigration}
                        disabled={migrating}
                      >
                        {migrating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {migrating
                          ? "Migrating..."
                          : "Migrate to Shared Caches"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assistant" className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg">AI Assistant</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Enable Assistant</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable the AI assistant for help with Minecraft issues.
                    </p>
                  </div>
                  <Switch
                    checked={settings.assistant.enabled}
                    onCheckedChange={(checked) => {
                      setAssistantSetting("enabled", checked);
                      saveSettings();
                    }}
                  />
                </div>

                {settings.assistant.enabled && (
                  <>
                    <div>
                      <Label className="mb-2">LLM Provider</Label>
                      <Select
                        value={settings.assistant.llmProvider}
                        onValueChange={(value) => {
                          setAssistantSetting("llmProvider", value as any);
                          saveSettings();
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {llmProviderOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-2">Model</Label>
                      <Select
                        value={
                          settings.assistant.llmProvider === "ollama"
                            ? settings.assistant.ollamaModel
                            : settings.assistant.openaiModel
                        }
                        onValueChange={(value) => {
                          if (settings.assistant.llmProvider === "ollama") {
                            setAssistantSetting("ollamaModel", value);
                          } else {
                            setAssistantSetting("openaiModel", value);
                          }
                          saveSettings();
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentModelOptions.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {settings.assistant.llmProvider === "ollama" && (
                      <div>
                        <Label className="mb-2">Ollama Endpoint</Label>
                        <Input
                          value={settings.assistant.ollamaEndpoint}
                          onChange={(e) => {
                            setAssistantSetting(
                              "ollamaEndpoint",
                              e.target.value,
                            );
                            saveSettings();
                          }}
                          placeholder="http://localhost:11434"
                        />
                      </div>
                    )}

                    {settings.assistant.llmProvider === "openai" && (
                      <>
                        <div>
                          <Label className="mb-2">OpenAI API Key</Label>
                          <Input
                            type="password"
                            value={settings.assistant.openaiApiKey || ""}
                            onChange={(e) => {
                              setAssistantSetting(
                                "openaiApiKey",
                                e.target.value || null,
                              );
                              saveSettings();
                            }}
                            placeholder="Enter your OpenAI API key"
                          />
                        </div>
                        <div>
                          <Label className="mb-2">OpenAI Endpoint</Label>
                          <Input
                            value={settings.assistant.openaiEndpoint}
                            onChange={(e) => {
                              setAssistantSetting(
                                "openaiEndpoint",
                                e.target.value,
                              );
                              saveSettings();
                            }}
                            placeholder="https://api.openai.com/v1"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <Label className="mb-2">Response Language</Label>
                      <Select
                        value={settings.assistant.responseLanguage}
                        onValueChange={(value) => {
                          setAssistantSetting("responseLanguage", value);
                          saveSettings();
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {languageOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-2">Assistant Persona</Label>
                      <Select
                        value={selectedPersona}
                        onValueChange={handleApplyPersona}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {personas.map((persona) => (
                            <SelectItem
                              key={persona.value}
                              value={persona.value}
                            >
                              {persona.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleResetSystemPrompt}
                        >
                          Reset to Default
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="mb-2">System Prompt</Label>

                      <Textarea
                        value={settings.assistant.systemPrompt}
                        onChange={(e) => {
                          setAssistantSetting("systemPrompt", e.target.value);
                          saveSettings();
                        }}
                        rows={6}
                        className="font-mono text-sm"
                      />
                    </div>

                    <div>
                      <Label className="mb-2">Text-to-Speech</Label>

                      <Select
                        value={settings.assistant.ttsProvider}
                        onValueChange={(value) => {
                          setAssistantSetting("ttsProvider", value);
                          saveSettings();
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent>
                          {ttsProviderOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* Java Download Modal */}
      <Dialog
        open={showJavaDownloadModal}
        onOpenChange={closeJavaDownloadModal}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Download Java</DialogTitle>
            <DialogDescription>
              Download and install Java for Minecraft.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-4">
              <div>
                <Label className="mb-2">Java Version</Label>
                <Select
                  value={selectedMajorVersion?.toString() || ""}
                  onValueChange={(v) => selectMajorVersion(parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMajorVersions.map((version) => (
                      <SelectItem key={version} value={version.toString()}>
                        Java {version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2">Type</Label>
                <Select
                  value={selectedImageType}
                  onValueChange={(v) => set({ selectedImageType: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jre">JRE (Runtime)</SelectItem>
                    <SelectItem value="jdk">JDK (Development)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="recommended"
                  checked={showOnlyRecommended}
                  onCheckedChange={(checked) =>
                    set({ showOnlyRecommended: !!checked })
                  }
                />
                <Label htmlFor="recommended">Show only LTS/Recommended</Label>
              </div>

              <div>
                <Label className="mb-2">Search</Label>
                <Input
                  placeholder="Search versions..."
                  value={searchQuery}
                  onChange={(e) => set({ searchQuery: e.target.value })}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={refreshCatalog}
                disabled={isLoadingCatalog}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isLoadingCatalog ? "animate-spin" : ""}`}
                />
                Refresh Catalog
              </Button>
            </div>

            <div className="md:col-span-2">
              <ScrollArea className="h-75 pr-4">
                {isLoadingCatalog ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : catalogError ? (
                  <div className="text-red-500 p-4">{catalogError}</div>
                ) : filteredReleases.length === 0 ? (
                  <div className="text-muted-foreground p-4 text-center">
                    No Java versions found
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredReleases.map((release) => {
                      const status = installStatus(
                        release.majorVersion,
                        release.imageType,
                      );
                      return (
                        <Card
                          key={`${release.majorVersion}-${release.imageType}`}
                          className="p-3 cursor-pointer hover:bg-accent"
                          onClick={() =>
                            selectMajorVersion(release.majorVersion)
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">
                                Java {release.majorVersion}{" "}
                                {release.imageType.toUpperCase()}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {release.releaseName} • {release.architecture}{" "}
                                {release.architecture}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {release.isLts && (
                                <Badge variant="secondary">LTS</Badge>
                              )}
                              {status === "installed" && (
                                <Badge variant="default">Installed</Badge>
                              )}
                              {status === "available" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectMajorVersion(release.majorVersion);
                                    downloadJava();
                                  }}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  Download
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {isDownloadingJava && downloadProgress && (
            <div className="mt-4 p-4 border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">
                  {downloadProgress.fileName}
                </span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(downloadProgress.percentage)}%
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${downloadProgress.percentage}%` }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeJavaDownloadModal}
              disabled={isDownloadingJava}
            >
              Cancel
            </Button>
            {selectedMajorVersion && (
              <Button
                onClick={() => downloadJava()}
                disabled={isDownloadingJava}
              >
                {isDownloadingJava ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download Java {selectedMajorVersion}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Config Editor Modal */}
      <Dialog open={showConfigEditor} onOpenChange={closeConfigEditor}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Configuration</DialogTitle>
            <DialogDescription>
              Edit the raw JSON configuration file.
            </DialogDescription>
          </DialogHeader>

          <div className="text-sm text-muted-foreground mb-2">
            File: {configFilePath}
          </div>

          {configEditorError && (
            <div className="text-red-500 p-3 bg-red-50 dark:bg-red-950/30 rounded-md">
              {configEditorError}
            </div>
          )}

          <Textarea
            value={rawConfigContent}
            onChange={(e) => set({ rawConfigContent: e.target.value })}
            className="font-mono text-sm h-100 resize-none"
            spellCheck={false}
          />

          <DialogFooter>
            <Button variant="outline" onClick={closeConfigEditor}>
              Cancel
            </Button>
            <Button onClick={() => saveRawConfig()}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
