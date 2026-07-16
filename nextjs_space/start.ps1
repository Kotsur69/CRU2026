# CRU2026 — skrypt startowy (dev)
# Uruchom z folderu nextjs_space:  .\start.ps1
# Flagi:
#   -Fresh   wymuś ponowny seed bazy
#   -NoDev   przygotuj wszystko, ale nie odpalaj serwera dev
# Aplikacja startuje na http://localhost:3100  (3000 zajęte przez inną apkę)

param(
    [switch]$Fresh,
    [switch]$NoDev
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$Port = 3100

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# 1. Konfiguracja (.env)
Step "Konfiguracja (.env)"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Utworzono .env z .env.example — sprawdź NEXTAUTH_SECRET/DATABASE_URL." -ForegroundColor Yellow
} else {
    Write-Host ".env już istnieje — pomijam."
}

# 2. Zależności
Step "Zależności (yarn install)"
if (-not (Test-Path "node_modules")) {
    yarn install
} else {
    Write-Host "node_modules istnieje — pomijam. (wymuś: rm -r node_modules)"
}

# 3. Baza — lokalny Postgres w Dockerze
Step "Postgres (docker compose up -d)"
docker compose up -d

Write-Host "Czekam na gotowość Postgresa..." -NoNewline
$ready = $false
foreach ($i in 1..30) {
    try {
        docker compose exec -T db pg_isready -U cru -d cru2026 *> $null
        if ($?) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline
}
if ($ready) { Write-Host " OK" -ForegroundColor Green }
else { Write-Host " (timeout — kontynuuję, może i tak wstanie)" -ForegroundColor Yellow }

# 4. Schemat + dane
Step "Schemat bazy (prisma db push)"
yarn db:push

$seedMarker = ".seeded"
if ($Fresh -or -not (Test-Path $seedMarker)) {
    Step "Seed (slowniki z audytu + admin + przyklady)"
    yarn db:seed
    New-Item -ItemType File -Path $seedMarker -Force | Out-Null
} else {
    Write-Host "`nBaza już zaseedowana (.seeded) — pomijam. (wymuś: .\start.ps1 -Fresh)"
}

# 5. Start serwera
if ($NoDev) {
    Step "Gotowe (bez dev)"
    Write-Host "Odpal ręcznie: yarn dev  ->  http://localhost:$Port"
    exit 0
}

Step "Start dev  ->  http://localhost:$Port  (login: admin / admin123)"
yarn dev
