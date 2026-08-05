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
  "README.md",
  "og.png"
)

foreach ($file in $clientFiles) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $clientOutput $file) -Force
}

Copy-Item -LiteralPath (Join-Path $projectRoot ".openai\hosting.json") -Destination (Join-Path $hostingOutput "hosting.json") -Force

Write-Host "Build concluído em dist/."
