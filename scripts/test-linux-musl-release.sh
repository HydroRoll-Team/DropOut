#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dockerfile="$repo_root/.github/docker/linux-musl.Dockerfile"

if grep -qx 'Cargo.lock' "$repo_root/.dockerignore"; then
  echo "Cargo.lock must be included in reproducible musl builds" >&2
  exit 1
fi

grep -q 'AS verify-runtime' "$dockerfile"
grep -q 'verify-linux-musl-package.sh /artifacts' "$dockerfile"
grep -q 'COPY --from=verify-runtime /artifacts/ /' "$dockerfile"

fixture_root=$(mktemp -d)
cleanup() {
  rm -rf "$fixture_root"
}
trap cleanup EXIT HUP INT TERM

package_name='Dropout_0.0.0_linux_x86_64-musl'
package_root="$fixture_root/$package_name"
artifact_dir="$fixture_root/artifacts"
mkdir -p "$package_root" "$artifact_dir"

printf '#!/bin/sh\nexit 0\n' >"$package_root/dropout"
chmod +x "$package_root/dropout"
printf 'fixture readme\n' >"$package_root/README.md"
printf '[Desktop Entry]\nName=DropOut\n' >"$package_root/dropout.desktop"
printf 'fixture icon\n' >"$package_root/dropout.png"

archive="$artifact_dir/$package_name.tar.gz"
tar -czf "$archive" -C "$fixture_root" "$package_name"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$artifact_dir" && sha256sum "$package_name.tar.gz" >"$package_name.tar.gz.sha256")
else
  (cd "$artifact_dir" && shasum -a 256 "$package_name.tar.gz" >"$package_name.tar.gz.sha256")
fi

"$repo_root/scripts/verify-linux-musl-package.sh" "$artifact_dir" archive-only

printf 'corrupt\n' >>"$archive"
if "$repo_root/scripts/verify-linux-musl-package.sh" "$artifact_dir" archive-only >/dev/null 2>&1; then
  echo "corrupted musl archives must fail verification" >&2
  exit 1
fi

echo "musl release contract passed"
