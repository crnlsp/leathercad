# The Microsoft Store's package, installed (B5; docs/superpowers/specs/
# 2026-11-03-windows-installer-and-distribution-design.md §7). Called once by
# .github/workflows/installers.yml on a Windows runner, after
# `pnpm --filter @leathercad/desktop package:msix`:
#
#   1. signs the .msix with a throwaway certificate whose subject is the
#      manifest's Publisher, and trusts it on this runner only — the Store
#      signs the package it ships;
#   2. installs it (Add-AppxPackage) and checks what it declares: .lcp, and
#      the maker's data folder left unvirtualized;
#   3. starts it as Start does, through shell:AppsFolder, and waits for the
#      log it writes at every start in %APPDATA%\leathercad\logs — deleted
#      first, so the app must create it, as a new file, where the .exe would;
#   4. writes a template from inside the package (Invoke-CommandInDesktopPackage
#      runs a process with the package's view of the file system);
#   5. removes the package: the template and the log must still be there;
#   6. installs it again, and the template must be there for the package too.
#
# A file the package created in AppData would otherwise live in its private
# copy, %LOCALAPPDATA%\Packages\<family>\LocalCache\Roaming, and go with it:
# that is what decision D16 and build/AppxManifest.xml prevent. Each failure is
# a GitHub annotation; any fails the step.
[CmdletBinding()]
param([Parameter(Mandatory)] [string] $Package)
$ErrorActionPreference = 'Stop'

$Data = Join-Path $env:APPDATA 'leathercad'
$Template = Join-Path $Data 'templates\Store template.lcp'
$Log = Join-Path $Data 'logs\main.log'
$Fixture = (Resolve-Path (Join-Path $PSScriptRoot '..\..\fixtures\projects\card-holder.lcp')).Path
$State = Join-Path $env:RUNNER_TEMP 'b5'
$script:Failed = $false

function Fail([string] $Message) {
  Write-Output "::error title=MSIX::$Message"
  $script:Failed = $true
}

function Wait-Until([scriptblock] $Condition, [int] $Seconds) {
  for ($second = 0; $second -lt $Seconds; $second++) {
    if (& $Condition) { return $true }
    Start-Sleep 1
  }
  & $Condition
}

function Get-Installed { Get-AppxPackage | Where-Object { $_.Name -eq $script:Name } }

# A process with the package's view of the file system, which writes what
# it found to a file outside AppData, where no package is redirected.
function Invoke-InPackage([string] $Script, [string] $Result) {
  Remove-Item $Result -ErrorAction SilentlyContinue
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Script))
  Invoke-CommandInDesktopPackage -PackageFamilyName $script:Family -AppId $script:AppId `
    -Command 'powershell.exe' -Args "-NoProfile -NonInteractive -EncodedCommand $encoded"
  if (-not (Wait-Until { Test-Path $Result } 60)) { Fail "Nothing ran inside the package: no $Result."; return $null }
  Get-Content $Result -Raw
}

New-Item -ItemType Directory -Force $State, (Split-Path $Template) | Out-Null
Remove-Item $Template, $Log -ErrorAction SilentlyContinue

# 1. The manifest says who publishes it; the certificate must say the same.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($Package)
try {
  $reader = New-Object IO.StreamReader(($zip.Entries | Where-Object FullName -eq 'AppxManifest.xml').Open())
  [xml] $manifest = $reader.ReadToEnd()
  $reader.Close()
} finally { $zip.Dispose() }
$script:Name = $manifest.Package.Identity.Name
$publisher = $manifest.Package.Identity.Publisher
$script:AppId = $manifest.Package.Applications.Application.Id

$certificate = New-SelfSignedCertificate -Type Custom -Subject $publisher -KeyUsage DigitalSignature `
  -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(1) `
  -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
$cer = Join-Path $State 'test.cer'
Export-Certificate -Cert $certificate -FilePath $cer | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
  Sort-Object FullName -Descending | Select-Object -First 1
& $signtool.FullName sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $Package
if ($LASTEXITCODE) { Fail "signtool could not sign $Package."; exit 1 }

# 2. Installed, with what it declares.
Add-AppxPackage -Path $Package
$installed = Get-Installed
if ($null -eq $installed) { Fail "$script:Name is not installed after Add-AppxPackage."; exit 1 }
$script:Family = $installed.PackageFamilyName
$declared = (Get-AppxPackageManifest $installed).Package
if (-not ($declared.Applications.Application.Extensions.Extension.FileTypeAssociation.SupportedFileTypes.FileType -contains '.lcp')) {
  Fail 'The package does not open .lcp files.'
}
if ($declared.Capabilities.Capability.Name -notcontains 'unvirtualizedResources') {
  Fail 'The package does not ask for unvirtualizedResources.'
}
$Private = Join-Path $env:LOCALAPPDATA "Packages\$script:Family\LocalCache\Roaming\leathercad"
Write-Output "Installed $($installed.PackageFullName)."

# 3. Started as from Start, it writes its log where the .exe does.
Start-Process "shell:AppsFolder\$script:Family!$script:AppId"
if (Wait-Until { (Test-Path $Log) -and (Select-String -Path $Log -Pattern 'starting' -Quiet) } 90) {
  Write-Output "The packaged app started and wrote $Log."
} elseif (Test-Path (Join-Path $Private 'logs\main.log')) {
  Fail "The packaged app wrote its log into the package's private copy, $Private, not $Data."
} else {
  Fail "The packaged app wrote no log within 90 seconds of starting."
}
Get-Process leathercad -ErrorAction SilentlyContinue | Stop-Process -Force
Wait-Until { $null -eq (Get-Process leathercad -ErrorAction SilentlyContinue) } 30 | Out-Null

# 4. A template, saved by the package.
$saved = Join-Path $State 'saved.txt'
$found = Invoke-InPackage @"
Copy-Item -LiteralPath '$Fixture' -Destination '$Template'
(Get-FileHash -LiteralPath '$Template').Hash | Set-Content -LiteralPath '$saved'
"@ $saved
$expected = (Get-FileHash $Fixture).Hash
if ($null -ne $found -and $found.Trim() -ne $expected) { Fail "The package saved a template that reads $found, not $expected." }
if (-not (Test-Path $Template)) { Fail "The template the package saved is not in $Data." }
if (Test-Path $Private) { Fail "The package wrote into its private copy, $Private." }

# 5. Removed: the maker's data stays.
Remove-AppxPackage -Package $installed.PackageFullName
if ($null -ne (Get-Installed)) { Fail "$script:Name is still installed after Remove-AppxPackage." }
foreach ($file in @($Template, $Log)) {
  if (-not (Test-Path $file)) { Fail "$file is gone after removing the package." }
}
if ((Test-Path $Template) -and (Get-FileHash $Template).Hash -ne $expected) { Fail "$Template changed when the package was removed." }

# 6. Installed again, the package finds the template.
Add-AppxPackage -Path $Package
$seen = Join-Path $State 'seen.txt'
$found = Invoke-InPackage @"
(Get-FileHash -LiteralPath '$Template').Hash | Set-Content -LiteralPath '$seen'
"@ $seen
if ($null -ne $found -and $found.Trim() -ne $expected) { Fail "Reinstalled, the package reads the template as '$($found.Trim())', not $expected." }
else { Write-Output 'Reinstalled, the package still has the template.' }
Remove-AppxPackage -Package (Get-Installed).PackageFullName

if ($script:Failed) { exit 1 }
