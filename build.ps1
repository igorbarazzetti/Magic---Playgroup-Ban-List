$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$clientOutput = Join-Path $projectRoot "dist\client"
$hostingOutput = Join-Path $projectRoot "dist\.openai"

& node --check (Join-Path $projectRoot "banlist.js")
if ($LASTEXITCODE -ne 0) {
  throw "A validação de banlist.js falhou."
}

New-Item -ItemType Directory -Force -Path $clientOutput | Out-Null
New-Item -ItemType Directory -Force -Path $hostingOutput | Out-Null

$clientFiles = @(
  "index.html",
  "styles.css",
  "banlist.js",
  "catalog-worker.js",
  "service-worker.js",
  "README.md",
  "og.png",
  "formatinho-logo.png",
  "favicon.png",
  "favicon-512.png",
  "apple-touch-icon.png"
)

foreach ($file in $clientFiles) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $clientOutput $file) -Force
}

$heroSource = Join-Path $projectRoot "hero-desktop"
$heroOutput = Join-Path $clientOutput "hero-desktop"
if (Test-Path -LiteralPath $heroSource) {
  New-Item -ItemType Directory -Force -Path $heroOutput | Out-Null
  Copy-Item -Path (Join-Path $heroSource "*") -Destination $heroOutput -Recurse -Force
}

Copy-Item -LiteralPath (Join-Path $projectRoot ".openai\hosting.json") -Destination (Join-Path $hostingOutput "hosting.json") -Force

$drizzleSource = Join-Path $projectRoot "drizzle"
$drizzleOutput = Join-Path $hostingOutput "drizzle"
if (Test-Path -LiteralPath $drizzleSource) {
  New-Item -ItemType Directory -Force -Path $drizzleOutput | Out-Null
  Copy-Item -Path (Join-Path $drizzleSource "*") -Destination $drizzleOutput -Recurse -Force
}

Write-Host "Build concluído em dist/."
