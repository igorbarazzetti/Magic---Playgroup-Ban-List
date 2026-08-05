param(
  [Parameter(Mandatory = $true)]
  [string]$Hostname,

  [string]$TunnelName = "magic-banlist",
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\igor\OneDrive\Documentos\Magic\codex-banlist"
$localUrl = "http://127.0.0.1:$Port"

function Ensure-LocalServer {
  $pythonProc = Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "*\Python312\python.exe" -and $_.CommandLine -match "http\.server" -and $_.CommandLine -match ":$Port"
  }

  if (-not $pythonProc) {
    Start-Process -WindowStyle Hidden -PassThru -FilePath python -ArgumentList "-m", "http.server", $Port, "-d", $projectRoot | Out-Null
    Start-Sleep -Seconds 1
  }
}

function Assert-CloudflareReady {
  $cloudflareCert = Join-Path $env:USERPROFILE ".cloudflared\cert.pem"
  if (-not (Test-Path $cloudflareCert)) {
    Write-Host "`nCloudflare não está autenticado neste usuário. Rode:"
    Write-Host "  cloudflared tunnel login"
    Write-Host "Abra o link exibido no terminal e autentique." 
    Write-Host "Quando voltar, execute este script novamente."
    exit 1
  }
}

Ensure-LocalServer
Assert-CloudflareReady

$existing = cloudflared tunnel list 2>$null | Select-String -Pattern "^\s*$TunnelName\s+" 
if (-not $existing) {
  Write-Host "Criando túnel: $TunnelName"
  cloudflared tunnel create $TunnelName
}

Write-Host "Configurando DNS: $Hostname"
cloudflared tunnel route dns --overwrite-dns $TunnelName $Hostname

Write-Host "Subindo túnel estável em: https://$Hostname"
cloudflared tunnel run $TunnelName
