# Completa la config MCP de Cursor que el AWS CLI no pudo escribir (WinError 2).
# Ejecutar una vez en PowerShell: .\scripts\finish-aws-mcp-cursor.ps1

$ProfileName = "sebastian-hackaton"
$Uvx = "C:\Users\sevac\.local\bin\uvx.exe"
if (-not (Test-Path $Uvx)) {
  $Uvx = (Get-Command uvx -ErrorAction SilentlyContinue).Source
}
if (-not $Uvx) { throw "uvx no encontrado. Instala uv o ajusta la ruta en este script." }

$awsMcp = @{
  command = $Uvx
  args    = @(
    "mcp-proxy-for-aws@latest",
    "https://aws-mcp.us-east-1.api.aws/mcp",
    "--metadata",
    "INSTALL_SOURCE=aws-cli"
  )
  env     = @{
    AWS_MCP_PROXY_PROFILES = $ProfileName
  }
}

function Merge-AwsMcpEnv {
  param([hashtable]$Server)
  if (-not $Server.env) { $Server.env = @{} }
  $Server.env["AWS_MCP_PROXY_PROFILES"] = $ProfileName
  return $Server
}

# Cursor
$cursorMcp = Join-Path $env:USERPROFILE ".cursor\mcp.json"
$cursorDir = Split-Path $cursorMcp -Parent
if (-not (Test-Path $cursorDir)) { New-Item -ItemType Directory -Path $cursorDir -Force | Out-Null }
$cursor = @{ mcpServers = @{} }
if (Test-Path $cursorMcp) {
  $cursor = Get-Content $cursorMcp -Raw | ConvertFrom-Json -AsHashtable
  if (-not $cursor.mcpServers) { $cursor.mcpServers = @{} }
}
$cursor.mcpServers["aws-mcp"] = $awsMcp
($cursor | ConvertTo-Json -Depth 10) | Set-Content -Path $cursorMcp -Encoding utf8
Write-Host "Actualizado: $cursorMcp"

# Claude Code
$claudeJson = Join-Path $env:USERPROFILE ".claude.json"
if (Test-Path $claudeJson) {
  $claude = Get-Content $claudeJson -Raw | ConvertFrom-Json
  if ($claude.mcpServers.'aws-mcp') {
    if (-not $claude.mcpServers.'aws-mcp'.env) {
      $claude.mcpServers.'aws-mcp' | Add-Member -NotePropertyName env -NotePropertyValue ([pscustomobject]@{ AWS_MCP_PROXY_PROFILES = $ProfileName })
    } else {
      $claude.mcpServers.'aws-mcp'.env.AWS_MCP_PROXY_PROFILES = $ProfileName
    }
    $claude | ConvertTo-Json -Depth 20 | Set-Content -Path $claudeJson -Encoding utf8
    Write-Host "Actualizado perfil MCP en: $claudeJson"
  }
}

# Cline
$clineMcp = Join-Path $env:USERPROFILE ".cline\mcp.json"
if (Test-Path $clineMcp) {
  $cline = Get-Content $clineMcp -Raw | ConvertFrom-Json
  if ($cline.mcpServers.'aws-mcp') {
    if (-not $cline.mcpServers.'aws-mcp'.env) {
      $cline.mcpServers.'aws-mcp' | Add-Member -NotePropertyName env -NotePropertyValue ([pscustomobject]@{ AWS_MCP_PROXY_PROFILES = $ProfileName })
    } else {
      $cline.mcpServers.'aws-mcp'.env.AWS_MCP_PROXY_PROFILES = $ProfileName
    }
    $cline | ConvertTo-Json -Depth 10 | Set-Content -Path $clineMcp -Encoding utf8
    Write-Host "Actualizado: $clineMcp"
  }
}

Write-Host "Listo. Reinicia Cursor para cargar aws-mcp."
