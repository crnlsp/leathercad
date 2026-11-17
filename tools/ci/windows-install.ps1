# The Windows installer, installed (R13; docs/superpowers/specs/
# 2026-11-03-windows-installer-and-distribution-design.md §5). Called by
# .github/workflows/installers.yml, one step at a time, on a Windows runner:
#
#   Install   -Installer <exe>   remembers the data folder, then runs an NSIS
#                                installer silently (/S) and waits
#   Seed                         writes the maker's data into %APPDATA%\leathercad
#                                and remembers it, and where the app is installed
#   Check     -Version <v>       the installed app: its version, the same folder,
#                                .lcp registered, shortcuts, and the data folder
#                                as Install found it, byte for byte; exports
#                                LEATHERCAD_PACKAGED_EXECUTABLE
#   Uninstall                    runs the uninstaller silently: the program, its
#                                shortcuts and registry entries go, the data
#                                folder stays exactly as it was
#
# The data folder is remembered before each install and uninstall rather than
# once, after seeding: the app, run between them, may rewrite preferences.json
# and clear a kept copy that no session names, as it should.
#
# What it remembers between steps lives in $env:RUNNER_TEMP\r13. Each failure
# is reported as a GitHub annotation; any fails the step.
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [ValidateSet('Install', 'Seed', 'Check', 'Uninstall')] [string] $Step,
  [string] $Installer,
  [string] $Version
)
$ErrorActionPreference = 'Stop'

$State = Join-Path $env:RUNNER_TEMP 'r13'
$Data = Join-Path $env:APPDATA 'leathercad'
$Fixtures = Join-Path $PSScriptRoot '..\..\fixtures\projects'
$Uninstalls = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
# electron-builder names both from the file association's `name`.
$ProgId = 'LeatherCAD project'
$Shortcuts = @(
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'LeatherCAD.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'LeatherCAD.lnk')
)
$script:Failed = $false

function Fail([string] $Message) {
  Write-Output "::error title=Windows installer::$Message"
  $script:Failed = $true
}

# The uninstall entry electron-builder writes, under a GUID derived from appId;
# HKCU\Software\<that GUID> holds InstallLocation. $null when not installed.
function Get-Entry {
  Get-ChildItem $Uninstalls | Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -like 'LeatherCAD *' }
}

function Get-InstallLocation($Entry) {
  (Get-ItemProperty "HKCU:\Software\$($Entry.PSChildName)" -ErrorAction SilentlyContinue).InstallLocation
}

# Every file under a folder, by its relative path, with its SHA-256.
function Get-Hashes([string] $Root) {
  $hashes = [ordered]@{}
  Get-ChildItem $Root -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
    $hashes[$_.FullName.Substring($Root.Length + 1)] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
  }
  $hashes
}

# Remembers every file in the data folder, by its bytes.
function Save-Data {
  $hashes = if (Test-Path $Data) { Get-Hashes $Data } else { @{} }
  $hashes | ConvertTo-Json | Set-Content (Join-Path $State 'data.json')
}

# Each remembered file is still there, with the same bytes.
function Compare-Data([string] $What) {
  $expected = Get-Content (Join-Path $State 'data.json') -Raw | ConvertFrom-Json -AsHashtable
  $actual = Get-Hashes $Data
  foreach ($path in $expected.Keys) {
    if (-not $actual.Contains($path)) { Fail "$What`: $path is gone from $Data." }
    elseif ($actual[$path] -ne $expected[$path]) { Fail "$What`: $path in $Data has changed." }
  }
  Write-Output "$What`: $($expected.Count) files in $Data checked."
}

switch ($Step) {
  'Install' {
    New-Item -ItemType Directory -Force $State | Out-Null
    Save-Data
    $process = Start-Process $Installer -ArgumentList '/S' -PassThru
    if (-not $process.WaitForExit(300000)) { Fail "$Installer /S was still running after five minutes." }
    elseif ($process.ExitCode -ne 0) { Fail "$Installer /S exited with $($process.ExitCode)." }
    else { Write-Output "Installed $Installer." }
  }

  'Seed' {
    # The maker's data, as 1.6.0 left it: a changed setting, a template of
    # their own, unsaved work kept at close (8.12) and a printer correction.
    New-Item -ItemType Directory -Force (Join-Path $Data 'templates'), (Join-Path $Data 'unsaved'), $State | Out-Null
    Set-Content (Join-Path $Data 'preferences.json') '{ "version": 2, "stitchMarginMm": 4.5 }' -NoNewline
    Set-Content (Join-Path $Data 'printers.json') '{ "version": 1, "corrections": { "Office printer": { "x": 1.005, "y": 0.999 } } }' -NoNewline
    Copy-Item (Join-Path $Fixtures 'card-holder.lcp') (Join-Path $Data 'templates\My card holder.lcp')
    Copy-Item (Join-Path $Fixtures 'key-fob.lcp') (Join-Path $Data 'unsaved\01JC0000000000000000000000.lcp')
    Save-Data

    $entry = Get-Entry
    if ($null -eq $entry) { Fail 'No uninstall entry after installing the baseline.'; break }
    $location = Get-InstallLocation $entry
    if (-not $location) { Fail "No InstallLocation under HKCU\Software\$($entry.PSChildName)."; break }
    Set-Content (Join-Path $State 'location.txt') $location -NoNewline
    Write-Output "Seeded $Data; the baseline is installed in $location."
  }

  'Check' {
    $entry = Get-Entry
    if ($null -eq $entry) { Fail 'No uninstall entry.'; break }
    $installed = (Get-ItemProperty $entry.PSPath).DisplayVersion
    if ($installed -ne $Version) { Fail "The uninstall entry says $installed, not $Version." }
    $location = Get-InstallLocation $entry
    $baseline = Get-Content (Join-Path $State 'location.txt') -Raw
    if ($location -ne $baseline) { Fail "Installed in $location, not where the baseline was, $baseline." }
    $executable = Join-Path $location 'leathercad.exe'
    if (-not (Test-Path $executable)) { Fail "No $executable." }

    $type = (Get-ItemProperty 'HKCU:\Software\Classes\.lcp' -ErrorAction SilentlyContinue).'(default)'
    if ($type -ne $ProgId) { Fail "HKCU\Software\Classes\.lcp names '$type', not '$ProgId'." }
    $open = (Get-ItemProperty "HKCU:\Software\Classes\$ProgId\shell\open\command" -ErrorAction SilentlyContinue).'(default)'
    if ($open -notlike "*$executable*") { Fail "'$ProgId' opens with '$open', not $executable." }
    foreach ($shortcut in $Shortcuts) { if (-not (Test-Path $shortcut)) { Fail "No $shortcut." } }

    Compare-Data 'After installing'
    if ($env:GITHUB_ENV) { "LEATHERCAD_PACKAGED_EXECUTABLE=$executable" | Add-Content $env:GITHUB_ENV }
    Write-Output "LeatherCAD $installed is installed in $location."
  }

  'Uninstall' {
    $entry = Get-Entry
    if ($null -eq $entry) { Fail 'Nothing to uninstall.'; break }
    $location = Get-InstallLocation $entry
    Save-Data

    # NSIS's uninstaller copies itself to %TEMP% and returns at once, so wait
    # for what it removes rather than for the process.
    $uninstaller = Get-ChildItem $location -Filter 'Uninstall *.exe' | Select-Object -First 1
    Start-Process $uninstaller.FullName -ArgumentList '/currentuser', '/S' -Wait
    for ($second = 0; $second -lt 120 -and ((Test-Path $entry.PSPath) -or (Test-Path $location)); $second++) {
      Start-Sleep 1
    }

    foreach ($left in @($entry.PSPath, "HKCU:\Software\$($entry.PSChildName)", $location) + $Shortcuts) {
      if (Test-Path $left) { Fail "$left is still there after uninstalling." }
    }
    $type = (Get-ItemProperty 'HKCU:\Software\Classes\.lcp' -ErrorAction SilentlyContinue).'(default)'
    if ($type -eq $ProgId) { Fail "HKCU\Software\Classes\.lcp still names '$ProgId'." }
    if (Test-Path "HKCU:\Software\Classes\$ProgId") { Fail "HKCU\Software\Classes\$ProgId is still there." }
    Compare-Data 'After uninstalling'
  }
}

if ($script:Failed) { exit 1 }
