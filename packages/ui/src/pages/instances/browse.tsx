import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  SearchIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  downloadContentFile,
  getContentVersions,
  getInstance,
  searchContent,
} from "@/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type {
  ContentProject,
  ContentSearchResult,
  ContentVersion,
  Instance,
} from "@/types";

function formatDownloads(n: number | bigint): string {
  const num = Number(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

function getSubfolder(projectType: string): string {
  switch (projectType) {
    case "mod":
      return "mods";
    case "shader":
      return "shaderpacks";
    case "resourcepack":
      return "resourcepacks";
    case "datapack":
      return "datapacks";
    default:
      return "mods";
  }
}

const ITEMS_PER_PAGE = 20;

export default function BrowsePage() {
  const { t } = useTranslation();
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();

  const [instance, setInstance] = useState<Instance | null>(null);

  // Search state
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [projectType, setProjectType] = useState("");
  const [gameVersion] = useState("");
  const [loader, setLoader] = useState("");
  const [sortBy, setSortBy] = useState("relevance");
  const [offset, setOffset] = useState(0);

  // Results
  const [result, setResult] = useState<ContentSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Install dialog
  const [installProject, setInstallProject] = useState<ContentProject | null>(
    null,
  );
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  // Load instance info
  useEffect(() => {
    if (instanceId) {
      getInstance(instanceId).then(setInstance).catch(console.error);
    }
  }, [instanceId]);

  // Derive game version from instance
  const instanceGameVersion = instance?.versionId ?? "";
  const instanceLoader = instance?.modLoader ?? "";

  const doSearch = useCallback(
    async (searchOffset = 0) => {
      setLoading(true);
      try {
        const gameVersions =
          gameVersion || instanceGameVersion
            ? [gameVersion || instanceGameVersion]
            : [];
        const loaders =
          loader || instanceLoader ? [loader || instanceLoader] : [];

        const res = await searchContent(
          submittedQuery,
          projectType,
          gameVersions,
          loaders,
          sortBy,
          searchOffset,
          ITEMS_PER_PAGE,
        );
        setResult(res);
        setOffset(searchOffset);
      } catch (e) {
        toast.error(`Search failed: ${e}`);
      } finally {
        setLoading(false);
      }
    },
    [
      submittedQuery,
      projectType,
      gameVersion,
      instanceGameVersion,
      loader,
      instanceLoader,
      sortBy,
    ],
  );

  // Search when filters change (after initial search)
  useEffect(() => {
    doSearch(0);
  }, [doSearch]);

  const handleSearch = () => {
    setSubmittedQuery(query);
  };

  const totalPages = result
    ? Math.ceil(Number(result.totalHits) / ITEMS_PER_PAGE)
    : 0;
  const currentPage = Math.floor(offset / ITEMS_PER_PAGE) + 1;

  // Install flow
  const openInstall = async (project: ContentProject) => {
    setInstallProject(project);
    setVersions([]);
    setLoadingVersions(true);
    try {
      const gameVersions = instanceGameVersion ? [instanceGameVersion] : [];
      const loaders = instanceLoader ? [instanceLoader] : [];
      const vers = await getContentVersions(project.id, gameVersions, loaders);
      setVersions(vers);
    } catch (e) {
      toast.error(`Failed to load versions: ${e}`);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleInstall = async (version: ContentVersion) => {
    if (!instanceId || !installProject) return;
    setInstalling(version.id);
    try {
      const subfolder = getSubfolder(installProject.projectType);
      await downloadContentFile(
        instanceId,
        version.fileUrl,
        version.fileName,
        subfolder,
      );
      toast.success(t("browse.installed", { name: installProject.title }));
      setInstallProject(null);
    } catch (e) {
      toast.error(t("browse.installFailed", { error: String(e) }));
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{t("browse.title")}</h1>
          {instance && (
            <p className="text-sm text-muted-foreground">{instance.name}</p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select
          value={projectType}
          onValueChange={(v) => setProjectType(v ?? "")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("browse.projectType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("browse.allTypes")}</SelectItem>
            <SelectItem value="mod">{t("browse.mod")}</SelectItem>
            <SelectItem value="modpack">{t("browse.modpack")}</SelectItem>
            <SelectItem value="shader">{t("browse.shader")}</SelectItem>
            <SelectItem value="resourcepack">
              {t("browse.resourcepack")}
            </SelectItem>
            <SelectItem value="datapack">{t("browse.datapack")}</SelectItem>
            <SelectItem value="plugin">{t("browse.plugin")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={loader} onValueChange={(v) => setLoader(v ?? "")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("browse.loader")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("browse.allLoaders")}</SelectItem>
            <SelectItem value="fabric">Fabric</SelectItem>
            <SelectItem value="forge">Forge</SelectItem>
            <SelectItem value="neoforge">NeoForge</SelectItem>
            <SelectItem value="quilt">Quilt</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v ?? "relevance")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("browse.sortBy")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">{t("browse.relevance")}</SelectItem>
            <SelectItem value="downloads">{t("browse.downloads")}</SelectItem>
            <SelectItem value="follows">{t("browse.follows")}</SelectItem>
            <SelectItem value="newest">{t("browse.newest")}</SelectItem>
            <SelectItem value="updated">{t("browse.updated")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t("browse.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
      </div>

      {/* Source indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{t("browse.source")}:</span>
        <Badge variant="outline">Modrinth</Badge>
        {result && (
          <span className="ml-auto">
            {t("browse.totalResults", {
              count: Number(result.totalHits),
            })}
          </span>
        )}
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Spinner />
            <span className="ml-2 text-muted-foreground">
              {t("browse.loading")}
            </span>
          </div>
        )}

        {!loading && result && result.hits.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-lg mb-1">{t("browse.noResults")}</p>
            <p className="text-sm">{t("browse.noResultsHint")}</p>
          </div>
        )}

        {!loading && result && result.hits.length > 0 && (
          <div className="space-y-2 pr-2">
            {result.hits.map((project) => (
              <div
                key={`${project.source}-${project.id}`}
                className="flex items-start gap-3 p-3 rounded-lg bg-card/50 hover:bg-card/80 transition-colors"
              >
                {/* Icon */}
                {project.iconUrl ? (
                  <img
                    src={project.iconUrl}
                    alt={project.title}
                    className="w-12 h-12 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-muted-foreground">
                      {project.title.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{project.title}</h3>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {project.projectType}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {project.description}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{t("browse.by", { author: project.author })}</span>
                    <span>
                      <DownloadIcon className="inline size-3 mr-0.5" />
                      {formatDownloads(project.downloads)}
                    </span>
                    {project.loaders.length > 0 && (
                      <div className="flex gap-1">
                        {project.loaders.slice(0, 3).map((l) => (
                          <Badge
                            key={l}
                            variant="outline"
                            className="text-[10px] px-1 py-0"
                          >
                            {l}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Install button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => openInstall(project)}
                >
                  {t("common.install")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      {result && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => doSearch(Math.max(0, offset - ITEMS_PER_PAGE))}
          >
            <ChevronLeftIcon className="size-4 mr-1" />
            {t("browse.prevPage")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("browse.pageOf", { current: currentPage, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => doSearch(offset + ITEMS_PER_PAGE)}
          >
            {t("browse.nextPage")}
            <ChevronRightIcon className="size-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Install Version Picker Dialog */}
      <Dialog
        open={!!installProject}
        onOpenChange={(open) => !open && setInstallProject(null)}
      >
        <DialogContent className="max-w-lg max-h-[70vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("browse.installTitle")}</DialogTitle>
            <DialogDescription>
              {installProject?.title} - {t("browse.installHint")}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[50vh]">
            {loadingVersions && (
              <div className="flex items-center justify-center py-8">
                <Spinner />
                <span className="ml-2 text-muted-foreground">
                  {t("browse.loadingVersions")}
                </span>
              </div>
            )}

            {!loadingVersions && versions.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                {t("browse.noResults")}
              </p>
            )}

            {!loadingVersions && versions.length > 0 && (
              <div className="space-y-2 pr-2">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card/50 hover:bg-card/80 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {version.name || version.versionNumber}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{version.versionNumber}</span>
                        {version.gameVersions.slice(0, 3).map((gv) => (
                          <Badge
                            key={gv}
                            variant="outline"
                            className="text-[10px] px-1 py-0"
                          >
                            {gv}
                          </Badge>
                        ))}
                        {version.loaders.map((l) => (
                          <Badge
                            key={l}
                            variant="outline"
                            className="text-[10px] px-1 py-0"
                          >
                            {l}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={installing === version.id}
                      onClick={() => handleInstall(version)}
                    >
                      {installing === version.id ? (
                        <>
                          <Spinner />
                          {t("browse.installing")}
                        </>
                      ) : (
                        t("common.install")
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallProject(null)}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
