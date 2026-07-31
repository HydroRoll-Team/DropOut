import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import {
  getLauncherFixtureLocale,
  getLauncherFixtureName,
  getLauncherFixtureTheme,
} from "@/lib/launcher-runtime";
import type {
  Account,
  AccountSummary,
  AssistantLogContext,
  ContentSearchResult,
  DetectedLauncher,
  ImportableInstance,
  Instance,
  JavaCatalog,
  JavaInstallation,
  LauncherConfig,
  LaunchReadiness,
  MigrationImportReport,
  MigrationPreview,
  MigrationProgressEvent,
  ModInfo,
  Version,
} from "@/types";
import type { StreamChunk } from "@/types/bindings/assistant";
import type { GameExitedEvent } from "@/types/bindings/core";
import type {
  JavaDownloadProgress,
  ProgressEvent,
} from "@/types/bindings/downloader";

const account: Account = {
  type: "microsoft",
  username: "FixturePlayer",
  uuid: "4f47a0d1-58bb-4dfa-97ba-153cccfa4cf8",
  accessToken: "fixture-only",
  refreshToken: null,
  expiresAt: 4_102_444_800n,
};

const accountSummary: AccountSummary = {
  uuid: account.uuid,
  username: account.username,
  accountType: "microsoft",
  isActive: true,
};

const readyInstance: Instance = {
  id: "fixture-fabric-1211",
  name: "Copper Valley",
  gameDir: "/fixtures/dropout/instances/copper-valley",
  versionId: "1.21.1",
  createdAt: 1_735_689_600_000n,
  lastPlayed: 1_786_464_000_000n,
  iconPath: null,
  notes: "A deterministic Fabric environment for UI development.",
  modLoader: "fabric",
  modLoaderVersion: "0.16.14",
  jvmArgsOverride: null,
  memoryOverride: { min: 2048, max: 6144 },
  javaPathOverride: null,
  serverAddress: null,
  skinPath: null,
};

const vanillaInstance: Instance = {
  ...readyInstance,
  id: "fixture-vanilla-1206",
  name: "Vanilla Archive",
  gameDir: "/fixtures/dropout/instances/vanilla-archive",
  versionId: "1.20.6",
  createdAt: 1_720_627_200_000n,
  lastPlayed: null,
  notes: "Clean vanilla profile.",
  modLoader: null,
  modLoaderVersion: null,
  memoryOverride: null,
};

function createLibraryInstances(count: number): Instance[] {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return readyInstance;

    const ordinal = index + 1;
    const padded = String(ordinal).padStart(3, "0");
    const loader =
      index % 3 === 0 ? null : index % 3 === 1 ? "fabric" : "forge";
    const name =
      ordinal === 97
        ? "Redstone Archive 097"
        : `${["Alpine", "Copper", "Deep Dark", "Skyblock", "Workshop"][index % 5]} ${padded}`;

    return {
      ...readyInstance,
      id: `fixture-library-${padded}`,
      name,
      gameDir: `/fixtures/dropout/instances/library-${padded}`,
      versionId:
        index % 13 === 0 ? null : index % 4 === 0 ? "1.20.6" : "1.21.1",
      createdAt: BigInt(1_735_689_600_000 - index * 86_400_000),
      lastPlayed:
        index % 9 === 0 ? null : BigInt(1_786_464_000_000 - index * 7_200_000),
      notes:
        index % 4 === 0 ? "Automation and progression test environment." : null,
      modLoader: loader,
      modLoaderVersion:
        loader === "fabric" ? "0.16.14" : loader === "forge" ? "52.0.16" : null,
      memoryOverride: index % 5 === 0 ? { min: 3072, max: 8192 } : null,
    };
  });
}

const settings: LauncherConfig = {
  minMemory: 1024,
  maxMemory: 8192,
  javaPath: "/fixtures/java/bin/java",
  width: 1024,
  height: 768,
  downloadThreads: 8,
  customBackgroundPath: null,
  enableGpuAcceleration: true,
  enableVisualEffects: true,
  activeEffect: "saturn",
  theme: "dark",
  logUploadService: "pastebin",
  pastebinApiKey: null,
  assistant: {
    enabled: false,
    llmProvider: "ollama",
    ollamaEndpoint: "http://127.0.0.1:11434",
    ollamaModel: "",
    openaiApiKey: null,
    openaiEndpoint: "https://api.openai.com/v1",
    openaiModel: "",
    systemPrompt: "",
    responseLanguage: "auto",
    ttsEnabled: false,
    ttsProvider: "disabled",
  },
  useSharedCaches: true,
  keepLegacyPerInstanceStorage: false,
  featureFlags: {
    demoUser: false,
    quickPlayEnabled: false,
    quickPlayPath: null,
    quickPlaySingleplayer: false,
    quickPlayMultiplayerServer: null,
  },
  mirrorSource: "official",
  language: "en",
  enableSystemTray: false,
  closeToTray: true,
  startMinimizedToTray: false,
  minimizeToTrayAfterLaunch: true,
  firstLaunchCompleted: true,
  jvmPreset: "g1gc",
  githubProxy: "",
};

const javaInstallations: JavaInstallation[] = [
  {
    path: "/fixtures/java/bin/java",
    version: "21.0.7",
    arch: "aarch64",
    vendor: "Eclipse Adoptium",
    source: "managed",
    is64bit: true,
  },
];

const javaCatalog: JavaCatalog = {
  releases: [],
  availableMajorVersions: [8, 17, 21],
  ltsVersions: [8, 17, 21],
  cachedAt: 1_786_464_000_000n,
};

const versions: Version[] = [
  {
    id: "1.21.1",
    type: "release",
    url: "https://piston-meta.mojang.com/fixture/1.21.1.json",
    time: "2024-08-08T12:00:00Z",
    releaseTime: "2024-08-08T12:00:00Z",
    javaVersion: 21n,
    isInstalled: true,
  },
  {
    id: "1.20.6",
    type: "release",
    url: "https://piston-meta.mojang.com/fixture/1.20.6.json",
    time: "2024-04-29T12:00:00Z",
    releaseTime: "2024-04-29T12:00:00Z",
    javaVersion: 21n,
    isInstalled: true,
  },
];

const detectedLaunchers: DetectedLauncher[] = [
  {
    launcherType: "multimc-compatible",
    instancesDir: "/fixtures/prism/instances",
    instanceCount: 2,
  },
  {
    launcherType: "pcl-hmcl",
    instancesDir: "/fixtures/hmcl/.minecraft/versions",
    instanceCount: 1,
  },
];

const importableInstances: ImportableInstance[] = [
  {
    sourcePath: "/fixtures/prism/instances/create-live",
    gameDir: "/fixtures/prism/instances/create-live/.minecraft",
    launcherType: "multimc-compatible",
    sourceKind: "instance",
    versionId: "1.21.1-fabric",
    name: "Create Live",
    minecraftVersion: "1.21.1",
    modLoader: "fabric",
    modLoaderVersion: "0.16.14",
    notes: "Automation-focused survival world.",
    memoryOverride: { min: 3072, max: 6144 },
    javaPathOverride: "/fixtures/java/bin/java",
    jvmArgsOverride: "-XX:+UseG1GC",
    iconSource: "/fixtures/prism/icons/create-live.png",
  },
  {
    sourcePath: "/fixtures/prism/instances/vanilla-lab",
    gameDir: "/fixtures/prism/instances/vanilla-lab/.minecraft",
    launcherType: "multimc-compatible",
    sourceKind: "instance",
    versionId: "1.20.6",
    name: "Vanilla Lab",
    minecraftVersion: "1.20.6",
    modLoader: null,
    modLoaderVersion: null,
    notes: null,
    memoryOverride: null,
    javaPathOverride: null,
    jvmArgsOverride: null,
    iconSource: null,
  },
];

const hmclImportableInstances: ImportableInstance[] = [
  {
    sourcePath: "/fixtures/hmcl/.minecraft/versions/1.20.1-fabric-isolated",
    gameDir: "/fixtures/hmcl/.minecraft",
    launcherType: "hmcl",
    sourceKind: "version",
    versionId: "1.20.1-fabric-isolated",
    name: "1.20.1 Fabric Isolated",
    minecraftVersion: "1.20.1",
    modLoader: "fabric",
    modLoaderVersion: "0.15.11",
    notes: null,
    memoryOverride: null,
    javaPathOverride: null,
    jvmArgsOverride: null,
    iconSource: null,
  },
];

function migrationPreview(sourcePath: string): MigrationPreview {
  const source =
    [...importableInstances, ...hmclImportableInstances].find(
      (instance) => instance.sourcePath === sourcePath,
    ) ?? importableInstances[0];
  const hasConflict = source.name === "Create Live";
  const includedContent: ReadonlyArray<readonly [string, number, bigint]> = [
    ["mods", 184, 782_237_696n],
    ["resourcepacks", 6, 37_748_736n],
    ["shaderpacks", 2, 15_728_640n],
    ["saves", 91, 1_224_736_768n],
    ["config", 63, 4_718_592n],
    ...(source.sourceKind === "version"
      ? ([["version-metadata", 3, 18_874_368n]] as const)
      : []),
  ];
  const content = [
    ...includedContent.map(([id, fileCount, totalBytes]) => ({
      id,
      relativePath: id,
      disposition: "include",
      fileCount,
      totalBytes,
      reason: null,
    })),
    {
      id: "logs",
      relativePath: "logs",
      disposition: "skip",
      fileCount: 27,
      totalBytes: 14_680_064n,
      reason: "Generated session data",
    },
    {
      id: "assets",
      relativePath: "assets",
      disposition: "skip",
      fileCount: 820,
      totalBytes: 523_239_424n,
      reason: "Shared cache will be resolved by DropOut",
    },
    {
      id: "unsupported-linked-content",
      relativePath: "mods/external-library",
      disposition: "unsupported",
      fileCount: 1,
      totalBytes: 0n,
      reason: "Symbolic links are not followed during migration",
    },
  ];
  const totalFiles = includedContent.reduce(
    (total, [, count]) => total + count,
    0,
  );
  const totalBytes = includedContent.reduce(
    (total, [, , bytes]) => total + bytes,
    0n,
  );

  return {
    source,
    suggestedName: hasConflict ? `${source.name} (Prism)` : source.name,
    nameConflict: hasConflict,
    content,
    conflicts: hasConflict
      ? [
          {
            kind: "name",
            message: `An instance named “${source.name}” already exists.`,
            suggestedResolution: `Use “${source.name} (Prism)” or choose another name.`,
          },
        ]
      : [],
    warnings: ["1 unsupported content group will not be copied"],
    totalFiles,
    totalBytes,
    canImport: true,
  };
}

type FixtureState = {
  activeInstanceId: string | null;
  settings: LauncherConfig;
};

const fixtureState: FixtureState = {
  activeInstanceId: readyInstance.id,
  settings,
};

function fixturesForCurrentScenario() {
  const name = getLauncherFixtureName() ?? "ready";
  const noAccount = name === "empty" || name === "no-account";
  const noInstances =
    name === "empty" || name === "no-instance" || name === "instances-empty";
  const instances = noInstances
    ? []
    : name === "instances-single"
      ? [readyInstance]
      : name === "memory-invalid"
        ? [
            {
              ...readyInstance,
              memoryOverride: { min: 8192, max: 2048 },
            },
            vanillaInstance,
          ]
        : name === "instances-20" || name === "instances-grid"
          ? createLibraryInstances(20)
          : name === "instances-100"
            ? createLibraryInstances(100)
            : [readyInstance, vanillaInstance];
  const activeInstance =
    instances.find(
      (instance) => instance.id === fixtureState.activeInstanceId,
    ) ??
    instances[0] ??
    null;

  return {
    name,
    account: noAccount ? null : account,
    accounts: noAccount ? [] : [accountSummary],
    instances,
    activeInstance,
  };
}

const listeners = new Map<string, Set<EventCallback<unknown>>>();
const cancelledMigrationOperations = new Set<string>();
const invokedCommands: string[] = [];

export function emitFixtureEvent<T>(eventName: string, payload: T) {
  for (const listener of listeners.get(eventName) ?? []) {
    listener({ event: eventName, id: 0, payload });
  }
}

export function resetFixtureCommandLog() {
  invokedCommands.length = 0;
}

export function getFixtureCommandLog() {
  return [...invokedCommands];
}

export async function fixtureListen<T>(
  eventName: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  const eventListeners = listeners.get(eventName) ?? new Set();
  eventListeners.add(handler as EventCallback<unknown>);
  listeners.set(eventName, eventListeners);

  if (
    getLauncherFixtureName() === "java-download-progress" &&
    eventName === "java-download-progress"
  ) {
    queueMicrotask(() => {
      emitFixtureEvent<JavaDownloadProgress>("java-download-progress", {
        fileName: "OpenJDK21U-jre_aarch64_mac_hotspot_21.0.7_6.tar.gz",
        downloadedBytes: 1_610_612_736n,
        totalBytes: 2_147_483_648n,
        speedBytesPerSec: 33_554_432n,
        etaSeconds: 16n,
        status: "Verifying",
        percentage: 125,
      });
    });
  }

  return () => {
    eventListeners.delete(handler as EventCallback<unknown>);
  };
}

export async function fixtureInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  invokedCommands.push(command);
  const fixture = fixturesForCurrentScenario();

  if (
    (fixture.name === "error" || fixture.name === "instances-error") &&
    command === "list_instances"
  ) {
    throw new Error("Fixture: instance index could not be read");
  }

  if (fixture.name === "instances-loading" && command === "list_instances") {
    return new Promise<T>(() => undefined);
  }

  const result = (() => {
    switch (command) {
      case "get_active_account":
        return fixture.account;
      case "get_all_accounts":
        return fixture.accounts;
      case "get_active_instance":
        return fixture.activeInstance;
      case "get_config_path":
        return "/fixtures/dropout/config.json";
      case "get_instance":
        return (
          fixture.instances.find(
            (instance) => instance.id === args.instanceId,
          ) ?? fixture.activeInstance
        );
      case "get_settings":
        return {
          ...fixtureState.settings,
          assistant:
            fixture.name === "assistant-ready" ||
            fixture.name === "assistant-offline" ||
            fixture.name === "failed"
              ? {
                  ...fixtureState.settings.assistant,
                  enabled: true,
                  ollamaModel: "qwen3:4b",
                }
              : fixtureState.settings.assistant,
          theme: getLauncherFixtureTheme() ?? fixtureState.settings.theme,
          language:
            getLauncherFixtureLocale() ?? fixtureState.settings.language,
        };
      case "list_instances":
        return fixture.instances;
      case "get_versions":
        return versions;
      case "get_launch_readiness": {
        const requestedInstance = fixture.instances.find(
          (instance) => instance.id === args.instanceId,
        );
        return {
          versionInstalled:
            fixture.name !== "downloading" &&
            fixture.name !== "files-missing" &&
            requestedInstance?.versionId !== null,
          requiredJavaMajor: 21n,
          java:
            fixture.name === "not-ready" ||
            String(args.instanceId).endsWith("017")
              ? null
              : javaInstallations[0],
        } satisfies LaunchReadiness;
      }
      case "detect_launchers":
        return fixture.name === "migration" ? detectedLaunchers : [];
      case "scan_launcher_instances":
        return fixture.name === "migration"
          ? String(args.instancesDir).includes("hmcl")
            ? hmclImportableInstances
            : importableInstances
          : [];
      case "preview_launcher_import":
        return migrationPreview(String(args.sourcePath));
      case "execute_launcher_import": {
        const operationId = String(args.operationId);
        const preview = migrationPreview(String(args.sourcePath));
        const instanceName =
          typeof args.newName === "string" && args.newName.trim()
            ? args.newName.trim()
            : preview.suggestedName;
        const loaderNeedsInstall = Boolean(
          preview.source.modLoader && preview.source.sourceKind !== "version",
        );

        queueMicrotask(() => {
          emitFixtureEvent<MigrationProgressEvent>("migration-progress", {
            operationId,
            progress: {
              completedFiles: 218,
              totalFiles: preview.totalFiles,
              completedBytes: 943_718_400n,
              totalBytes: preview.totalBytes,
              currentPath: "saves/Automation District/region/r.0.0.mca",
            },
          });
        });

        return new Promise<MigrationImportReport>((resolve, reject) => {
          setTimeout(() => {
            if (cancelledMigrationOperations.delete(operationId)) {
              reject(
                new Error(
                  "Migration cancelled; copied files were rolled back.",
                ),
              );
              return;
            }
            emitFixtureEvent<MigrationProgressEvent>("migration-progress", {
              operationId,
              progress: {
                completedFiles: preview.totalFiles,
                totalFiles: preview.totalFiles,
                completedBytes: preview.totalBytes,
                totalBytes: preview.totalBytes,
                currentPath: "options.txt",
              },
            });
            resolve({
              operationId,
              instanceId: `fixture-import-${preview.source.name.toLowerCase().replaceAll(" ", "-")}`,
              instanceName,
              sourcePath: preview.source.sourcePath,
              copiedFiles: preview.totalFiles,
              copiedBytes: preview.totalBytes,
              skippedSymlinks: 0,
              warnings: [],
              compatibilityStatus: loaderNeedsInstall
                ? "action-required"
                : "ready-to-validate",
              compatibilityChecks: [
                {
                  id: "version",
                  status: "ready",
                  summary: `Minecraft ${preview.source.minecraftVersion ?? preview.source.versionId} identified`,
                  action: null,
                },
                {
                  id: "loader",
                  status: loaderNeedsInstall ? "action-required" : "ready",
                  summary: loaderNeedsInstall
                    ? `${preview.source.modLoader} metadata was identified, but its launcher profile was not imported`
                    : preview.source.modLoader
                      ? `${preview.source.modLoader} loader profile preserved`
                      : "Vanilla loader configuration preserved",
                  action: loaderNeedsInstall
                    ? `Install ${preview.source.modLoader} ${preview.source.modLoaderVersion} for Minecraft ${preview.source.minecraftVersion} before the first launch`
                    : null,
                },
                {
                  id: "java",
                  status: "ready",
                  summary: preview.source.javaPathOverride
                    ? "Source Java override is available"
                    : "DropOut will resolve a compatible Java runtime",
                  action: null,
                },
                {
                  id: "memory",
                  status: "ready",
                  summary: preview.source.memoryOverride
                    ? `Memory override preserved: ${preview.source.memoryOverride.min}–${preview.source.memoryOverride.max} MB`
                    : "DropOut default memory settings will be used",
                  action: null,
                },
              ],
            });
          }, 800);
        });
      }
      case "cancel_launcher_import":
        cancelledMigrationOperations.add(String(args.operationId));
        return true;
      case "rollback_launcher_import":
        return true;
      case "import_from_launcher":
        return {
          ...readyInstance,
          id: `fixture-import-${String(args.sourcePath).split("/").at(-1)}`,
          name:
            typeof args.newName === "string"
              ? args.newName
              : "Imported fixture",
        };
      case "detect_java":
      case "detect_all_java_installations":
        return javaInstallations;
      case "refresh_java_catalog":
      case "fetch_java_catalog":
        return javaCatalog;
      case "search_content":
        return {
          hits: [],
          totalHits: 0,
          offset: Number(args.offset ?? 0),
          limit: Number(args.limit ?? 20),
        } satisfies ContentSearchResult;
      case "set_active_instance":
        fixtureState.activeInstanceId = String(args.instanceId);
        return undefined;
      case "save_settings":
        fixtureState.settings = args.config as LauncherConfig;
        return undefined;
      case "update_tray_download_status":
      case "refresh_system_tray":
      case "show_system_notification":
      case "show_main_window":
        return undefined;
      case "start_game":
        return `Fixture: started Minecraft ${String(args.versionId)}`;
      case "assistant_check_health":
        return fixture.name !== "assistant-offline";
      case "get_assistant_log_context":
        return {
          lineCount: 3,
          content: [
            "[main/ERROR] Could not initialize Fabric loader",
            "Mod resolution failed for sodium 0.6.0",
            "Crash report written to ~/.minecraft/crash-reports/[redacted]",
          ].join("\n"),
        } satisfies AssistantLogContext;
      case "assistant_chat_stream": {
        const response = args.logContext
          ? "The attached evidence points to a Fabric mod compatibility conflict. Disable sodium 0.6.0, verify its Minecraft version, then retry the instance."
          : "Start by checking the loader and mod versions for the active instance.";
        queueMicrotask(() => {
          emitFixtureEvent<StreamChunk>("assistant-stream", {
            content: response.slice(0, 72),
            done: false,
            stats: null,
          });
          emitFixtureEvent<StreamChunk>("assistant-stream", {
            content: response.slice(72),
            done: true,
            stats: null,
          });
        });
        return response;
      }
      case "install_version": {
        emitFixtureEvent<number>("download-start", 4);
        emitFixtureEvent<ProgressEvent>("download-progress", {
          file: "client-1.21.1.jar",
          downloaded: 64n,
          total: 128n,
          status: "Downloading",
          completedFiles: 2,
          totalFiles: 4,
          totalDownloadedBytes: 192n,
        });
        emitFixtureEvent<void>("download-complete", undefined);
        return undefined;
      }
      case "open_file_explorer":
        return undefined;
      case "scan_instance_mods": {
        const libraryOrdinal = String(args.instanceId).match(
          /^fixture-library-(\d+)$/,
        )?.[1];
        const count = libraryOrdinal ? Number(libraryOrdinal) % 18 : 12;
        return Array.from({ length: count }, (_, index) => ({
          fileName: `fixture-mod-${index + 1}.jar`,
          filePath: `/fixtures/mods/fixture-mod-${index + 1}.jar`,
          enabled: index % 5 !== 0,
          fileSize: BigInt((index + 1) * 1024 * 1024),
          modName: `Fixture Mod ${index + 1}`,
          modId: `fixture_mod_${index + 1}`,
          version: "1.0.0",
          description: null,
          modLoader: fixture.activeInstance?.modLoader ?? "fabric",
        })) satisfies ModInfo[];
      }
      case "stop_game": {
        const active = fixturesForCurrentScenario().activeInstance;
        queueMicrotask(() => {
          if (!active) return;
          emitFixtureEvent<GameExitedEvent>("game-exited", {
            instanceId: active.id,
            versionId: active.versionId ?? "unknown",
            exitCode: null,
            wasStopped: true,
          });
        });
        return "Fixture: stopped Minecraft";
      }
      default:
        throw new Error(`Fixture command is not implemented: ${command}`);
    }
  })();

  return result as T;
}
