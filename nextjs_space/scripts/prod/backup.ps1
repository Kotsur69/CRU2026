# CRU2026 - nightly backup (test phase). See docs/deployment.md, section "Backups".
#
#   .\scripts\prod\backup.ps1 -Target "D:\cru-backup"
#
# -Target MUST be a different physical disk (or a NAS share) - a backup on the same
# drive as the data dies with it. Writes only below -Target:
#   db\cru2026-<timestamp>.dump   pg_dump custom format; dumps older than -KeepDays deleted
#   files\                        mirror of storage-local (robocopy /MIR, incremental)
# Restore: pg_restore --clean --if-exists -U cru -h localhost -d cru2026 <file.dump>

param(
    [Parameter(Mandatory)][string]$Target,
    [int]$KeepDays = 14,
    [string]$PgBin = "C:\Users\mmazur\pgportable\pgsql\bin"
)

$ErrorActionPreference = "Stop"
$AppDir = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$DbDir = Join-Path $Target "db"
$FilesDir = Join-Path $Target "files"
New-Item -ItemType Directory -Force -Path $DbDir, $FilesDir | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$dump = Join-Path $DbDir "cru2026-$stamp.dump"

# 1. Database (metadata only - small, so a full dump every night)
& (Join-Path $PgBin "pg_dump.exe") -U cru -h localhost -d cru2026 -Fc -f $dump
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit code $LASTEXITCODE)" }
Get-ChildItem $DbDir -Filter "cru2026-*.dump" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
    Remove-Item -Force -Confirm:$false

# 2. Attachments (49 GB - robocopy only copies what changed since the last run)
robocopy (Join-Path $AppDir "storage-local") $FilesDir /MIR /R:2 /W:5 /NP /NFL /NDL /LOG+:(Join-Path $Target "robocopy.log") | Out-Null
# robocopy: exit codes below 8 mean success (0 = nothing to do, 1 = files copied, ...)
if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit code $LASTEXITCODE) - see $Target\robocopy.log" }

Write-Host "Backup OK: $dump"
