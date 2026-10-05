# CRU2026 - production run on this PC (test phase). See docs/deployment.md.
#
# Run manually:   .\scripts\prod\run-prod.ps1 [-Build]
# Run at logon:   shortcut in the user's Startup folder, see docs/deployment.md, "Autostart".
# No admin rights needed anywhere.
#
# What it does: starts portable Postgres if it is down, applies pending migrations
# (`prisma migrate deploy` - never resets data), optionally rebuilds, then supervises
# two processes until the window is closed:
#   - the app on 127.0.0.1:3100 ONLY (nothing listens on a public interface)
#   - a Cloudflare quick tunnel (cloudflared) - the only way in from the internet
# A quick tunnel gets a NEW random https://*.trycloudflare.com address every time it
# starts. The current one is written to logs\public-url.txt and passed to the app as
# NEXTAUTH_URL (a process env var wins over .env). If the tunnel dies, both are
# restarted with the new address; if only the app dies, only the app is restarted.

param(
    [switch]$Build,
    [string]$PgBin       = "C:\Users\mmazur\pgportable\pgsql\bin",
    [string]$PgData      = "C:\Users\mmazur\pgdata",
    [string]$Cloudflared = "C:\Users\mmazur\cloudflared\cloudflared.exe",
    [int]$Port           = 3100
)

$ErrorActionPreference = "Stop"
$AppDir = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location -Path $AppDir

$LogDir = Join-Path $AppDir "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log       = Join-Path $LogDir ("prod-{0:yyyy-MM-dd}.log" -f (Get-Date))
$AppLog    = Join-Path $LogDir "app.log"
$AppErrLog = Join-Path $LogDir "app-error.log"
$TunnelLog = Join-Path $LogDir "tunnel.log"
$UrlFile   = Join-Path $LogDir "public-url.txt"
$LocalUrl  = "http://127.0.0.1:$Port"
$WatchdogSeconds = 15

function Log($msg) {
    $line = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg
    Write-Host $line
    Add-Content -Path $Log -Value $line -Encoding UTF8
}

# Native tools write warnings to stderr; under EAP=Stop PowerShell 5.1 would turn
# those into terminating errors even on exit code 0 (same gotcha as start.ps1).
function Invoke-Native([string]$What, [scriptblock]$Action) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $Action 2>&1 | ForEach-Object { Add-Content -Path $Log -Value "$_" -Encoding UTF8 } }
    finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

function Stop-Tree($proc) {
    if ($proc -and -not $proc.HasExited) { taskkill /T /F /PID $proc.Id *> $null }
}

# Leftovers from a previous run that was closed without cleanup (children outlive
# the console). Only our own cloudflared binary and whatever holds our port.
function Stop-Leftovers {
    Get-Process cloudflared -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $Cloudflared } |
        ForEach-Object { taskkill /T /F /PID $_.Id *> $null }
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { taskkill /T /F /PID $_.OwningProcess *> $null }
}

function Start-Tunnel {
    Remove-Item $TunnelLog -ErrorAction SilentlyContinue
    $proc = Start-Process -FilePath $Cloudflared -WindowStyle Hidden -PassThru `
        -ArgumentList "tunnel", "--no-autoupdate", "--url", $LocalUrl `
        -RedirectStandardError $TunnelLog
    foreach ($i in 1..60) {
        Start-Sleep -Seconds 1
        if ($proc.HasExited) { break }
        $hit = Select-String -Path $TunnelLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($hit) {
            $url = $hit.Matches[0].Value
            Set-Content -Path $UrlFile -Value $url -Encoding ASCII
            Log "Tunnel up: $url"
            return @{ Process = $proc; Url = $url }
        }
    }
    Stop-Tree $proc
    throw "cloudflared did not report a tunnel address within 60 s - see $TunnelLog"
}

function Start-App([string]$PublicUrl) {
    $env:NEXTAUTH_URL = $PublicUrl
    $proc = Start-Process -FilePath "node" -WindowStyle Hidden -PassThru `
        -ArgumentList "node_modules\next\dist\bin\next", "start", "-H", "127.0.0.1", "-p", "$Port" `
        -RedirectStandardOutput $AppLog -RedirectStandardError $AppErrLog
    foreach ($i in 1..60) {
        Start-Sleep -Seconds 1
        if ($proc.HasExited) { break }
        try {
            $r = Invoke-WebRequest -Uri "$LocalUrl/login" -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) { Log "App up on $LocalUrl (NEXTAUTH_URL=$PublicUrl)"; return $proc }
        } catch { }
    }
    Stop-Tree $proc
    throw "App did not answer on $LocalUrl/login within 60 s - see $AppErrLog"
}

$env:NODE_ENV = "production"
$env:CI = "1"
$tunnel = $null
$app = $null

try {
    Log "=== CRU2026 production start ==="
    if (-not (Test-Path $Cloudflared)) { throw "cloudflared not found at $Cloudflared" }

    # 1. Postgres (listens on localhost only - see postgresql.conf listen_addresses)
    $pgIsReady = Join-Path $PgBin "pg_isready.exe"
    $pgCtl     = Join-Path $PgBin "pg_ctl.exe"
    & $pgIsReady -h localhost -p 5432 *> $null
    if (-not $?) {
        Log "Postgres down - starting from $PgData"
        $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        & $pgCtl -D "$PgData" -l (Join-Path $PgData "server.log") start | Out-Null
        $ErrorActionPreference = $prev
        $ready = $false
        foreach ($i in 1..60) {
            & $pgIsReady -h localhost -p 5432 *> $null
            if ($?) { $ready = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) { throw "Postgres did not come up within 60 s - see $PgData\server.log" }
    }
    Log "Postgres OK"

    # 2. Schema
    Invoke-Native "prisma migrate deploy" { npx prisma migrate deploy }
    Log "Migrations applied"

    # 3. Build (on request, or when there is no build yet)
    if ($Build -or -not (Test-Path (Join-Path $AppDir ".next\BUILD_ID"))) {
        Log "Building..."
        Invoke-Native "next build" { npx next build }
        Log "Build OK"
    }

    # 4. Tunnel + app, supervised. The tunnel comes first: the app needs its address.
    Stop-Leftovers
    $tunnel = Start-Tunnel
    $app = Start-App $tunnel.Url
    Log "Serving. Send testers: $($tunnel.Url)  (also in $UrlFile). Close this window to stop."

    while ($true) {
        Start-Sleep -Seconds $WatchdogSeconds
        if ($tunnel.Process.HasExited) {
            Log "Tunnel died - restarting tunnel and app (the address WILL change)"
            Stop-Tree $app
            $tunnel = Start-Tunnel
            $app = Start-App $tunnel.Url
            Log "New address - send testers: $($tunnel.Url)"
        } elseif ($app.HasExited) {
            Log "App died (exit code $($app.ExitCode)) - restarting, see $AppErrLog"
            $app = Start-App $tunnel.Url
        }
    }
} catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
} finally {
    Stop-Tree $app
    if ($tunnel) { Stop-Tree $tunnel.Process }
}
