export function baseGameVersion(versionId: string | null | undefined): string {
  const version = versionId?.trim() ?? "";
  if (version.includes("-forge-")) return version.split("-forge-")[0] ?? "";

  const fabricPrefix = "fabric-loader-";
  if (version.startsWith(fabricPrefix)) {
    const loaderAndGame = version.slice(fabricPrefix.length);
    const separator = loaderAndGame.indexOf("-");
    return separator >= 0 ? loaderAndGame.slice(separator + 1) : version;
  }

  return version;
}
