param(
  [Parameter(Mandatory = $true)]
  [string]$Target
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$bundleRoot = Join-Path $repoRoot "target/$Target/release/bundle/nsis"
$installer = Get-ChildItem -Path $bundleRoot -Filter *.exe -File | Select-Object -First 1

if ($null -eq $installer) {
  throw "Expected an NSIS installer under $bundleRoot"
}

$smokeRoot = Join-Path $env:RUNNER_TEMP ("dropout-install-smoke-" + [guid]::NewGuid())
$installRoot = Join-Path $smokeRoot "installed"
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null

try {
  $process = Start-Process -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installRoot") -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "NSIS installer exited with code $($process.ExitCode)"
  }

  $installedBinary = Get-ChildItem -Path $installRoot -Filter *.exe -File -Recurse |
    Where-Object { $_.Name -notmatch "(?i)uninstall" } |
    Select-Object -First 1
  if ($null -eq $installedBinary) {
    throw "NSIS installer did not produce an application executable"
  }

  $header = [System.IO.File]::ReadAllBytes($installedBinary.FullName)
  if ($header.Length -lt 2 -or $header[0] -ne 0x4d -or $header[1] -ne 0x5a) {
    throw "Installed application does not have a valid PE header"
  }

  Write-Output "Verified isolated Windows install for $Target"
}
finally {
  $uninstaller = Get-ChildItem -Path $installRoot -Filter *uninstall*.exe -File -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -ne $uninstaller) {
    Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait | Out-Null
  }
  if (Test-Path $smokeRoot) {
    Remove-Item -Path $smokeRoot -Recurse -Force
  }
}
