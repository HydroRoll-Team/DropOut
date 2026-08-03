export function hasStagedChanges(changedFiles) {
  return changedFiles.trim().length > 0;
}
