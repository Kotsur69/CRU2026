# CRU2026 — skrypt startowy (dev)
# Uruchom z folderu nextjs_space:  .\start.ps1
# Flagi:
#   -Fresh   wymuś ponowny seed bazy
#   -NoDev   przygotuj wszystko, ale nie odpalaj serwera dev
# Baza: przenośny PostgreSQL (pgportable) — NIE Docker.
# Aplikacja startuje na http://localhost:3100  (3000 zajęte przez inną apkę)

param(
    [switch]$Fresh,
    [switch]$NoDev,
    # Ścieżki przenośnego Postgresa — nadpisz, jeśli masz je gdzie indziej.
    [string]$PgBin  = "C:\Users\mmazur\pgportable\pgsql\bin",
    [string]$PgData = "C:\Users\mmazur\pgdata"
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$Port    = 3100
$DbName  = "cru2026"
$DbUser  = "cru"
$DbPass  = "cru"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# Windows PowerShell 5.1 gotcha: pod $ErrorActionPreference = "Stop", KAŻDA linia,
# którą program natywny wypisze na stderr (nawet zwykłe ostrzeżenie, np. deprecation
# warning z Prisma czy "server may be running" z pg_ctl), zostaje zamieniona w błąd
# przerywający skrypt — mimo że proces kończy się kodem 0. Dlatego każde wywołanie
# programu natywnego idzie przez ten wrapper: EAP tymczasowo na "Continue" (stderr
# tylko się wyświetla, nie przerywa), a o realnym niepowodzeniu decyduje $LASTEXITCODE.
function Invoke-Checked {
    param(
        [Parameter(Mandatory)][string]$FailMessage,
        [Parameter(Mandatory)][scriptblock]$Action
    )
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Action
    } finally {
        $ErrorActionPreference = $prevEAP
    }
    if ($LASTEXITCODE -ne 0) {
        throw "$FailMessage (exit code $LASTEXITCODE)"
    }
}

# yarn nie jest na PATH na tej maszynie — fallback na `corepack yarn`.
$script:UseCorepack = -not (Get-Command yarn -ErrorAction SilentlyContinue)
function Invoke-Yarn {
    param([Parameter(ValueFromRemainingArguments = $true)]$YarnArgs)
    Invoke-Checked -FailMessage "yarn $($YarnArgs -join ' ') nie powiodło się" -Action {
        if ($script:UseCorepack) { corepack yarn @YarnArgs } else { yarn @YarnArgs }
    }
}

# Nie pytaj interaktywnie o nic (corepack potrafi zapytać o zgodę na pobranie yarn) —
# proces działa w tle/nieinteraktywnie, więc prompt = ciche zawieszenie na zawsze.
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
$env:CI = "1"

try {

# 1. Konfiguracja (.env) — wstrzykuje świeży NEXTAUTH_SECRET
Step "Konfiguracja (.env)"
if (-not (Test-Path ".env")) {
    $bytes = New-Object 'System.Byte[]' 32
    ([System.Security.Cryptography.RNGCryptoServiceProvider]::new()).GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes)

    $content = Get-Content ".env.example" -Raw
    if ($content -match 'NEXTAUTH_SECRET=') {
        $content = $content -replace 'NEXTAUTH_SECRET=.*', ('NEXTAUTH_SECRET="{0}"' -f $secret)
    } else {
        $content += "`nNEXTAUTH_SECRET=`"$secret`"`n"
    }
    Set-Content -Path ".env" -Value $content -Encoding UTF8
    Write-Host "Utworzono .env z .env.example (+ wygenerowany NEXTAUTH_SECRET)." -ForegroundColor Yellow
} else {
    Write-Host ".env już istnieje — pomijam."
}

# 2. Zależności
Step "Zależności (yarn install)"
if (-not (Test-Path "node_modules")) {
    Invoke-Yarn install
} else {
    Write-Host "node_modules istnieje — pomijam. (wymuś: rm -r node_modules)"
}

# 3. Baza — przenośny PostgreSQL (pgportable)
Step "PostgreSQL (pgportable)"
$psql      = Join-Path $PgBin "psql.exe"
$pgIsReady = Join-Path $PgBin "pg_isready.exe"
$pgCtl     = Join-Path $PgBin "pg_ctl.exe"

foreach ($exe in @($psql, $pgIsReady, $pgCtl)) {
    if (-not (Test-Path $exe)) {
        throw "Nie znaleziono $exe — podaj poprawny -PgBin (folder z psql.exe/pg_ctl.exe)."
    }
}

# 3a. Czy nasłuchuje na 5432? Jeśli nie — wystartuj instancję z $PgData.
& $pgIsReady -h localhost -p 5432 *> $null
if (-not $?) {
    Write-Host "Postgres nie odpowiada — startuję z $PgData ..." -ForegroundColor Yellow
    if (-not (Test-Path $PgData)) {
        throw "Brak katalogu danych: $PgData. Podaj poprawny -PgData albo zainicjuj bazę (initdb)."
    }
    $log = Join-Path $PgData "server.log"
    # Nie używamy Invoke-Checked tu celowo: "inny serwer może być uruchomiony" to
    # ostrzeżenie o stale postmaster.pid, pg_ctl mimo to próbuje wystartować — to nie
    # jest błąd. O sukcesie i tak decyduje pętla pg_isready poniżej, nie kod wyjścia.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $pgCtl -D "$PgData" -l "$log" start | Out-Null
    $ErrorActionPreference = $prevEAP

    Write-Host "Czekam na gotowość Postgresa..." -NoNewline
    $ready = $false
    foreach ($i in 1..30) {
        & $pgIsReady -h localhost -p 5432 *> $null
        if ($?) { $ready = $true; break }
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline
    }
    if ($ready) { Write-Host " OK" -ForegroundColor Green }
    else { throw "Postgres nie wstał w 30s — sprawdź $log" }
} else {
    Write-Host "Postgres działa na localhost:5432 — używam istniejącej instancji."
}

# 3b. Rola + baza (idempotentnie; łączymy się jako superuser postgres — trust auth)
$env:PGCLIENTENCODING = "UTF8"
$roleExists = (& $psql -U postgres -h localhost -p 5432 -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DbUser';" | Select-Object -First 1)
if ("$roleExists".Trim() -ne '1') {
    Write-Host "Tworzę rolę '$DbUser'..."
    & $psql -U postgres -h localhost -p 5432 -c "CREATE ROLE $DbUser LOGIN PASSWORD '$DbPass';" | Out-Null
} else {
    Write-Host "Rola '$DbUser' istnieje — pomijam."
}

$dbExists = (& $psql -U postgres -h localhost -p 5432 -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName';" | Select-Object -First 1)
if ("$dbExists".Trim() -ne '1') {
    Write-Host "Tworzę bazę '$DbName' (owner $DbUser)..."
    & $psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE $DbName OWNER $DbUser;" | Out-Null
} else {
    Write-Host "Baza '$DbName' istnieje — pomijam."
}

# 4. Schemat + dane
Step "Schemat bazy (prisma db push)"
Invoke-Yarn db:push

$seedMarker = ".seeded"
if ($Fresh -or -not (Test-Path $seedMarker)) {
    Step "Seed (slowniki z audytu + admin + przyklady)"
    Invoke-Yarn db:seed
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
Invoke-Yarn dev

} catch {
    Write-Host "`n=== BŁĄD ===" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
