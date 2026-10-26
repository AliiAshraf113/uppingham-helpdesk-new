$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$artifactsPath = Join-Path $projectRoot 'artifacts'
$stagePath = Join-Path $artifactsPath '.cpanel-stage'
$zipPath = Join-Path $artifactsPath 'uppingham-helpdesk-cpanel.zip'

New-Item -ItemType Directory -Path $artifactsPath -Force | Out-Null
if (Test-Path -LiteralPath $stagePath) {
  Remove-Item -LiteralPath $stagePath -Recurse -Force
}
New-Item -ItemType Directory -Path $stagePath | Out-Null

try {
  $rootFiles = @(
    'server.js', 'package-lock.json', 'next.config.ts', 'next-env.d.ts',
    'postcss.config.mjs', 'tsconfig.json'
  )
  foreach ($relativePath in $rootFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination $stagePath
  }

  $package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
  $package.scripts = [ordered]@{
    dev = 'next dev'
    build = 'next build --webpack'
    start = 'node server.js'
  }
  $packageJson = $package | ConvertTo-Json -Depth 20
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Join-Path $stagePath 'package.json'), $packageJson, $utf8WithoutBom)

  $sourceApp = Join-Path $projectRoot 'src\app'
  $stagedApp = Join-Path $stagePath 'src\app'
  New-Item -ItemType Directory -Path (Split-Path -Parent $stagedApp) -Force | Out-Null
  Copy-Item -LiteralPath $sourceApp -Destination $stagedApp -Recurse

  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stagePath,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )
  Write-Output "Created $zipPath"
}
finally {
  if (Test-Path -LiteralPath $stagePath) {
    Remove-Item -LiteralPath $stagePath -Recurse -Force
  }
}
