param(
  [Parameter(Mandatory = $false)]
  [string]$Domain = "seu-dominio",

  [string]$Subpath = "projetos/playgroupanalytics/codex-banlist",

  [string]$ProjectRoot = "",

  [switch]$LocalPreview
)

$ErrorActionPreference = "Stop"

if (-not $ProjectRoot) {
  if ($PSScriptRoot) {
    $ProjectRoot = $PSScriptRoot
  } else {
    $ProjectRoot = (Get-Location).Path
  }
}

$workspaceRoot = Split-Path -Path $ProjectRoot -Parent
$targetPath = Join-Path $workspaceRoot $Subpath
$publicPath = $Subpath.Replace('\', '/').TrimStart('/')
$publicUrl = "https://$Domain/$publicPath/"

if (-not (Test-Path $targetPath)) {
  New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
  Write-Host "Criado diretório: $targetPath"
}

$filesToCopy = @(
  "index.html",
  "styles.css",
  "banlist.js",
  "og.png",
  ".htaccess"
)

foreach ($file in $filesToCopy) {
  $sourceFile = Join-Path $ProjectRoot $file
  if (-not (Test-Path $sourceFile)) {
    Write-Host "Arquivo ausente em $sourceFile (pulado)." -ForegroundColor Yellow
    continue
  }
  Copy-Item -Path $sourceFile -Destination $targetPath -Force
}

$webConfig = @"
AddDefaultCharset UTF-8
AddType text/css;charset=UTF-8 .css
AddType application/javascript;charset=UTF-8 .js

<IfModule mod_headers.c>
  <FilesMatch "\.(html|css|js|webmanifest)$">
    Header set Cache-Control "no-store, no-cache, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </FilesMatch>
</IfModule>
"@

Set-Content -Path (Join-Path $targetPath ".htaccess") -Value $webConfig -Encoding utf8

Write-Host ""
Write-Host "Publicacao preparada em:"
Write-Host "  $targetPath"
Write-Host ""
Write-Host "URL esperada no dominio:"
Write-Host "  $publicUrl"

if ($LocalPreview) {
  Write-Host ""
  Write-Host "Fazendo validacao local em http://127.0.0.1:4175/$publicPath/ ..."
  $server = Start-Process -WindowStyle Hidden -PassThru -FilePath "python" -ArgumentList @("-m", "http.server", "4175", "-d", $workspaceRoot)
  Start-Sleep -Seconds 1

  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:4175/$publicPath/" -UseBasicParsing
    Write-Host ""
    Write-Host "Resposta da validacao local: $($resp.StatusCode)"
    Write-Host "Tamanho: $($resp.RawContentLength)"
  } finally {
    if ($server -and -not $server.HasExited) {
      Stop-Process -Id $server.Id
    }
  }
}
