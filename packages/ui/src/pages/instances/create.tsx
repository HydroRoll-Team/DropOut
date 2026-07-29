import { zodResolver } from "@hookform/resolvers/zod";
import { defineStepper } from "@stepperize/react";
import { open } from "@tauri-apps/plugin-shell";
import { ArrowLeftIcon, Link2Icon, XIcon } from "lucide-react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Controller,
  FormProvider,
  type Resolver,
  useForm,
  useFormContext,
  Watch,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import z from "zod/v4";
import {
  getFabricLoadersForVersion,
  getForgeVersionsForGame,
  getVersions,
  installFabric,
  installForge,
  installVersion,
  updateInstance,
} from "@/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useInstanceStore } from "@/models/instance";
import type { FabricLoaderEntry, ForgeVersion, Version } from "@/types";

const versionSchema = z.object({
  versionId: z.string("Version is required"),
});

type VersionFormData = z.infer<typeof versionSchema>;

function VersionComponent() {
  const { t } = useTranslation();
  const {
    control,
    formState: { errors },
  } = useFormContext<z.infer<typeof versionSchema>>();

  const [versionSearch, setVersionSearch] = useState<string>("");
  const [versionFilter, setVersionFilter] = useState<
    "all" | "release" | "snapshot" | "old_alpha" | "old_beta" | null
  >("release");

  const [versions, setVersions] = useState<Version[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadVersions = useCallback(async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const versions = await getVersions();
      setVersions(versions);
    } catch (e) {
      console.error("Failed to load versions:", e);
      setErrorMessage(`Failed to load versions: ${String(e)}`);
      return;
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!versions) loadVersions();
  }, [versions, loadVersions]);

  const filteredVersions = useMemo(() => {
    if (!versions) return null;
    const all = versions;
    let list = all.slice();
    if (versionFilter !== "all") {
      list = list.filter((v) => v.type === versionFilter);
    }
    if (versionSearch.trim()) {
      const q = versionSearch.trim().toLowerCase().replace(/。/g, ".");
      list = list.filter((v) => v.id.toLowerCase().includes(q));
    }
    return list;
  }, [versions, versionFilter, versionSearch]);

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden">
      <div className="flex flex-row items-center mb-4 space-x-2">
        <div className="flex flex-row space-x-2 w-full">
          <FieldLabel htmlFor="version-search" className="text-nowrap">
            {t("create.versions")}
          </FieldLabel>
          <Input
            id="version-search"
            placeholder={t("create.searchVersions")}
            value={versionSearch}
            onChange={(e) => setVersionSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-row space-x-2">
          <FieldLabel className="text-nowrap">{t("create.type")}</FieldLabel>
          <Select
            value={versionFilter}
            onValueChange={(value) => setVersionFilter(value)}
          >
            <SelectTrigger aria-label={t("create.filterByType")}>
              <SelectValue placeholder={t("create.filterByType")} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="all">{t("create.allVersions")}</SelectItem>
              <SelectItem value="release">
                {t("create.releaseVersions")}
              </SelectItem>
              <SelectItem value="snapshot">
                {t("create.snapshotVersions")}
              </SelectItem>
              <SelectItem value="old_alpha">{t("create.oldAlpha")}</SelectItem>
              <SelectItem value="old_beta">{t("create.oldBeta")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={loadVersions} disabled={isLoading}>
          {t("common.refresh")}
        </Button>
      </div>
      {errorMessage && (
        <div className="size-full flex flex-col items-center justify-center space-y-2">
          <p className="text-red-500">{errorMessage}</p>
          <Button variant="outline" onClick={loadVersions}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      {isLoading && !errorMessage ? (
        <div className="size-full flex flex-col items-center justify-center">
          <Spinner />
          <p>{t("create.loadingVersions")}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="size-full pr-2">
            <Controller
              name="versionId"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  {...field}
                  value={field.value || ""}
                  className="space-y-2"
                >
                  {filteredVersions?.map((version) => (
                    <FieldLabel key={version.id} htmlFor={version.id}>
                      <Field orientation="horizontal" className="py-2">
                        <FieldContent>
                          <FieldTitle>
                            {version.id}
                            <Badge variant="outline">{version.type}</Badge>
                          </FieldTitle>
                          <FieldDescription>
                            {new Date(version.releaseTime).toLocaleString()}
                          </FieldDescription>
                        </FieldContent>
                        <div className="flex flex-row space-x-2 items-center">
                          <Button
                            aria-label={`${t("common.open")} ${version.id}`}
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              open(
                                `https://zh.minecraft.wiki/w/Java%E7%89%88${version.id}`,
                              );
                            }}
                          >
                            <Link2Icon />
                          </Button>
                          <RadioGroupItem
                            value={version.id}
                            id={version.id}
                            aria-label={`${version.id} ${version.type}`}
                          />
                        </div>
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              )}
            ></Controller>
          </ScrollArea>
        </div>
      )}
      {errors.versionId && <FieldError errors={[errors.versionId]} />}
    </div>
  );
}

const instanceSchema = z.object({
  name: z.string().min(1, "Instance name is required"),
  notes: z.string().max(100, "Notes must be at most 100 characters").optional(),
  modLoader: z.enum(["fabric", "forge"]).optional(),
  modLoaderVersion: z.string().optional(),
});

type InstanceFormData = z.infer<typeof instanceSchema>;
type CreateInstanceFormData = VersionFormData | InstanceFormData;

function InstanceComponent() {
  const { t } = useTranslation();
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<z.infer<typeof instanceSchema>>();

  const versionId = useVersionId();

  const [forgeVersions, setForgeVersions] = useState<ForgeVersion[] | null>(
    null,
  );
  const [fabricVersions, setFabricVersions] = useState<
    FabricLoaderEntry[] | null
  >(null);

  const [isLoadingForge, setIsLoadingForge] = useState(false);
  const [isLoadingFabric, setIsLoadingFabric] = useState(false);
  const loadForgeVersions = useCallback(async () => {
    if (forgeVersions) return;
    if (!versionId) return toast.error("Version ID is not set");
    setIsLoadingForge(true);
    try {
      const versions = await getForgeVersionsForGame(versionId);
      setForgeVersions(versions);
    } catch (e) {
      console.error("Failed to load Forge versions:", e);
      toast.error(`Failed to load Forge versions: ${String(e)}`);
    } finally {
      setIsLoadingForge(false);
    }
  }, [versionId, forgeVersions]);
  const loadFabricVersions = useCallback(async () => {
    if (fabricVersions) return;
    if (!versionId) return toast.error("Version ID is not set");
    setIsLoadingFabric(true);
    try {
      const versions = await getFabricLoadersForVersion(versionId);
      setFabricVersions(versions);
    } catch (e) {
      console.error("Failed to load Fabric versions:", e);
      toast.error(`Failed to load Fabric versions: ${String(e)}`);
    } finally {
      setIsLoadingFabric(false);
    }
  }, [versionId, fabricVersions]);

  const modLoaderField = register("modLoader");
  const modLoaderVersionField = register("modLoaderVersion");

  return (
    <ScrollArea className="size-full pr-2">
      <div className="h-full flex flex-col space-y-4">
        <div className="bg-card w-full p-6 shadow shrink-0">
          <FieldSet className="w-full">
            <Field orientation="horizontal">
              <FieldLabel htmlFor="name" className="text-nowrap" required>
                {t("create.instanceName")}
              </FieldLabel>
              <Input
                id="name"
                {...register("name")}
                aria-invalid={!!errors.name}
              />
              {errors.name && <FieldError errors={[errors.name]} />}
            </Field>
            <Field>
              <FieldLabel htmlFor="notes" className="text-nowrap">
                {t("create.instanceNotes")}
              </FieldLabel>
              <Textarea
                id="notes"
                className="resize-none min-h-0"
                {...register("notes")}
                rows={1}
              />
              {errors.notes && <FieldError errors={[errors.notes]} />}
            </Field>
          </FieldSet>
        </div>

        <Accordion className="border">
          <AccordionItem
            value="forge"
            onOpenChange={(open) => {
              if (open) loadForgeVersions();
            }}
          >
            <Watch
              control={control}
              render={({ modLoader, modLoaderVersion }) => (
                <AccordionTrigger
                  className="border-b px-4 py-3"
                  disabled={modLoader && modLoader !== "forge"}
                >
                  <div className="flex flex-row w-full items-center space-x-4">
                    <span className="font-bold">Forge</span>
                    {modLoader === "forge" && (
                      <>
                        <span className="text-nowrap font-bold">
                          {modLoaderVersion}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          nativeButton={false}
                          onClick={(e) => {
                            e.stopPropagation();
                            modLoaderField.onChange({
                              target: {
                                name: modLoaderField.name,
                                value: null,
                              },
                            });
                            modLoaderVersionField.onChange({
                              target: {
                                name: modLoaderVersionField.name,
                                value: null,
                              },
                            });
                          }}
                          render={(domProps) => (
                            <div {...domProps}>
                              <XIcon />
                            </div>
                          )}
                        />
                      </>
                    )}
                  </div>
                </AccordionTrigger>
              )}
            />
            <AccordionContent>
              {isLoadingForge ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <Spinner />
                  <p>{t("create.loadingForge")}</p>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  {forgeVersions?.map((version, idx) => (
                    <React.Fragment
                      key={`forge-${version.version}-${version.minecraftVersion}`}
                    >
                      <Button
                        variant="ghost"
                        className="p-3 py-6 border-b justify-start"
                        onClick={() => {
                          modLoaderField.onChange({
                            target: {
                              name: modLoaderField.name,
                              value: "forge",
                            },
                          });
                          modLoaderVersionField.onChange({
                            target: {
                              name: modLoaderVersionField.name,
                              value: version.version,
                            },
                          });
                        }}
                      >
                        Forge {version.version} for Minecraft{" "}
                        {version.minecraftVersion}
                      </Button>
                      {idx !== forgeVersions.length - 1 && <Separator />}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem
            value="fabric"
            onOpenChange={(open) => {
              if (open) loadFabricVersions();
            }}
          >
            <Watch
              control={control}
              render={({ modLoader, modLoaderVersion }) => (
                <AccordionTrigger
                  className="border-b px-4 py-3"
                  disabled={modLoader && modLoader !== "fabric"}
                >
                  <div className="flex flex-row w-full items-center space-x-4">
                    <span className="font-bold">Fabric</span>
                    {modLoader === "fabric" && (
                      <>
                        <span className="text-nowrap font-bold">
                          {modLoaderVersion}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          nativeButton={false}
                          onClick={(e) => {
                            e.stopPropagation();
                            modLoaderField.onChange({
                              target: {
                                name: modLoaderField.name,
                                value: null,
                              },
                            });
                            modLoaderVersionField.onChange({
                              target: {
                                name: modLoaderVersionField.name,
                                value: null,
                              },
                            });
                          }}
                          render={(domProps) => (
                            <div {...domProps}>
                              <XIcon />
                            </div>
                          )}
                        />
                      </>
                    )}
                  </div>
                </AccordionTrigger>
              )}
            />

            <AccordionContent>
              {isLoadingFabric ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <Spinner />
                  <p>{t("create.loadingFabric")}</p>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  {fabricVersions?.map((version, idx) => (
                    <React.Fragment
                      key={`fabric-${version.loader.version}-${version.intermediary.version}`}
                    >
                      <Button
                        variant="ghost"
                        className="p-3 py-6 border-b justify-start"
                        onClick={() => {
                          modLoaderField.onChange({
                            target: {
                              name: modLoaderField.name,
                              value: "fabric",
                            },
                          });
                          modLoaderVersionField.onChange({
                            target: {
                              name: modLoaderVersionField.name,
                              value: version.loader.version,
                            },
                          });
                        }}
                      >
                        Fabric {version.loader.version} for Minecraft{" "}
                        {version.intermediary.version}
                      </Button>
                      {idx !== fabricVersions.length - 1 && <Separator />}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </ScrollArea>
  );
}

const VersionIdContext = createContext<string | null>(null);
export const useVersionId = () => useContext(VersionIdContext);

const { useStepper, Stepper } = defineStepper(
  {
    id: "version",
    title: "Version",
    Component: VersionComponent,
    schema: versionSchema,
  },
  {
    id: "instance",
    title: "Instance",
    Component: InstanceComponent,
    schema: instanceSchema,
  },
);

export function CreateInstancePage() {
  const { t } = useTranslation();
  const stepper = useStepper();
  const schema = stepper.state.current.data.schema;
  const form = useForm<CreateInstanceFormData>({
    resolver: zodResolver(schema as never) as Resolver<CreateInstanceFormData>,
  });
  const navigate = useNavigate();

  const instanceStore = useInstanceStore();

  const [versions, setVersions] = useState<Version[] | null>(null);
  useEffect(() => {
    const loadVersions = async () => {
      const versions = await getVersions();
      setVersions(versions);
    };
    if (!versions) loadVersions();
  }, [versions]);

  // Step 2
  const [versionId, setVersionId] = useState<string | null>(null);

  // Step 2
  // 这里不要动，后面会做一个download页面，需要迁移到download-models
  const [_instanceMeta, setInstanceMeta] = useState<z.infer<
    typeof instanceSchema
  > | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const handleSubmit = useCallback(
    async (data: CreateInstanceFormData) => {
      switch (stepper.state.current.data.id) {
        case "version":
          setVersionId((data as z.infer<typeof versionSchema>).versionId);
          return await stepper.navigation.next();
        case "instance":
          setInstanceMeta(data as z.infer<typeof instanceSchema>);
      }

      if (!versionId) return toast.error(t("create.selectVersionFirst"));

      setIsCreating(true);

      // 这里不要动，React数据是异步更新，直接用的数据才是实时的
      const instanceMeta = data as z.infer<typeof instanceSchema>;

      try {
        const instance = await instanceStore.create(instanceMeta.name);
        instance.notes = instanceMeta.notes ?? null;
        await updateInstance(instance);

        await installVersion(instance.id, versionId);
        switch (instanceMeta.modLoader) {
          case "fabric":
            if (!instanceMeta.modLoaderVersion) {
              toast.error(t("create.selectFabricVersion"));
              return;
            }
            await installFabric(
              instance.id,
              versionId,
              instanceMeta.modLoaderVersion,
            );
            break;
          case "forge":
            if (!instanceMeta.modLoaderVersion) {
              toast.error(t("create.selectForgeVersion"));
              return;
            }
            await installForge(
              instance.id,
              versionId,
              instanceMeta.modLoaderVersion,
            );
            break;
          default:
            toast.error("Unsupported mod loader");
            break;
        }

        navigate("/instances");
      } catch (error) {
        console.error(error);
        toast.error(t("create.failedCreate"));
      } finally {
        setIsCreating(false);
      }
    },
    [stepper, instanceStore.create, versionId, navigate, t],
  );

  return (
    <FormProvider {...form}>
      <ol
        aria-label={t("create.title")}
        className="w-full flex list-none flex-row items-center justify-center px-6 mb-6"
      >
        {stepper.state.all.map((step, idx) => {
          const current = stepper.state.current;
          const isInactive = stepper.state.current.data.id !== step.id;
          const isLast = stepper.lookup.getLast().id === step.id;
          return (
            <li
              key={`stepper-item-${step.id}`}
              className={cn("flex items-center", !isLast && "flex-1")}
              aria-current={isInactive ? undefined : "step"}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  isInactive
                    ? "border-border bg-secondary text-secondary-foreground"
                    : "border-primary bg-primary text-primary-foreground",
                )}
              >
                <span className="sr-only">{step.title}: </span>
                {idx + 1}
              </span>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-2 h-0.5 w-full bg-muted",
                    current.status === "success" && "bg-primary",
                    "transition-all duration-300 ease-in-out",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      <form
        className="flex flex-col flex-1 min-h-0 space-y-4 px-6"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <div className="flex-1 overflow-hidden w-full max-w-xl mx-auto">
          <VersionIdContext.Provider value={versionId}>
            {stepper.flow.switch({
              version: ({ Component }) => <Component />,
              instance: ({ Component }) => <Component />,
            })}
          </VersionIdContext.Provider>
        </div>
        <div className="w-full flex flex-row justify-between">
          <Stepper.Prev
            render={(domProps) => (
              <Button
                type="button"
                variant="secondary"
                disabled={isCreating}
                {...domProps}
              >
                {t("common.previous")}
              </Button>
            )}
          />
          {stepper.state.isLast ? (
            <Button type="submit" disabled={isCreating}>
              {isCreating ? (
                <>
                  <Spinner />
                  {t("create.creating")}
                </>
              ) : (
                t("common.create")
              )}
            </Button>
          ) : (
            <Button type="submit">{t("common.next")}</Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}

function PageWrapper() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  return (
    <div className="flex size-full overflow-hidden px-6 py-8">
      <Stepper.Root
        className="flex flex-col flex-1 space-y-4"
        orientation="horizontal"
      >
        {({ stepper }) => (
          <>
            <div className="flex flex-row space-x-4">
              <Button
                aria-label={t("common.back")}
                variant="secondary"
                size="icon"
                onClick={() => {
                  if (stepper.state.isFirst) return navigate(-1);
                  setShowCancelDialog(true);
                }}
              >
                <ArrowLeftIcon />
              </Button>
              <h1 className="text-2xl font-bold">{t("create.title")}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("create.subtitle")}
            </p>
            <CreateInstancePage />
          </>
        )}
      </Stepper.Root>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("create.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("create.cancelDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => navigate(-1)}
            >
              {t("common.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PageWrapper;
