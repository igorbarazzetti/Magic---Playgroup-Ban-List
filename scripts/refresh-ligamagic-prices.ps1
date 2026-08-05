$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

& node .\scripts\update-ligamagic-prices.mjs
if ($LASTEXITCODE -ne 0) {
  throw "A coleta da LigaMagic falhou (código $LASTEXITCODE)."
}

$pendingPriceFile = git status --porcelain -- data/ligamagic-prices.json
if (-not $pendingPriceFile) {
  Write-Output 'Nenhuma atualização de preço para publicar.'
  exit 0
}

git add data/ligamagic-prices.json
git commit -m 'Atualiza preços LigaMagic'
git push github main:main
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível publicar os preços no GitHub (código $LASTEXITCODE)."
}
