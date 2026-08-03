#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
workflow="$repo_root/.github/workflows/semifold-ci.yaml"

grep -q '^  attestations: write$' "$workflow"
grep -q '^        uses: actions/attest@v4$' "$workflow"
grep -q '^          subject-path: artifacts/\*\*/\*$' "$workflow"

for guide in \
  "$repo_root/packages/docs/content/en/manual/getting-started.mdx" \
  "$repo_root/packages/docs/content/zh/manual/getting-started.mdx"
do
  grep -q 'gh attestation verify' "$guide"
  grep -q -- '-R HydroRoll-Team/DropOut' "$guide"
done

echo "release provenance contract passed"
