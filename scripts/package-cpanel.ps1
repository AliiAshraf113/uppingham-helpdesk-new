# Packaging script for cPanel Passenger Node deployment
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$artifactsPath = Join-Path $projectRoot 'artifacts'
$stagePath = Join-Path $artifactsPath '.cpanel-stage'
$zipPath = Join-Path $artifactsPath 'uppingham-helpdesk-cpanel.zip'

Write-Host "Starting cPanel deployment packaging..."

# Ensure clean staging directory and remove any pre-existing output zip
New-Item -ItemType Directory -Path $artifactsPath -Force | Out-Null
if (Test-Path -LiteralPath $stagePath) {
  Remove-Item -LiteralPath $stagePath -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
New-Item -ItemType Directory -Path $stagePath | Out-Null

try {
  # 1. Root configuration and startup files
  $rootFiles = @(
    'server.js',
    'package-lock.json',
    'next.config.ts',
    'next-env.d.ts',
    'postcss.config.mjs',
    'tsconfig.json',
    'auth.ts',
    '.env.example'
  )

  foreach ($relativePath in $rootFiles) {
    $srcFile = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $srcFile)) {
      throw "Required root file missing: $relativePath"
    }
    Copy-Item -LiteralPath $srcFile -Destination (Join-Path $stagePath $relativePath)
  }

  # 2. Package.json with deployment scripts
  $packageJsonPath = Join-Path $projectRoot 'package.json'
  if (-not (Test-Path -LiteralPath $packageJsonPath)) {
    throw "package.json missing from project root."
  }
  $package = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
  $package.scripts = [ordered]@{
    dev = 'next dev'
    build = 'next build --webpack'
    start = 'node server.js'
    'db:migrate' = 'node scripts/migrate.mjs'
  }
  $packageJson = $package | ConvertTo-Json -Depth 20
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Join-Path $stagePath 'package.json'), $packageJson, $utf8WithoutBom)

  # 3. Source directory: src (all UI, API routes, server services, types)
  $srcDir = Join-Path $projectRoot 'src'
  if (-not (Test-Path -LiteralPath $srcDir)) {
    throw "src directory missing."
  }
  Copy-Item -LiteralPath $srcDir -Destination $stagePath -Recurse

  # 4. Migration source files (all 0001 through 0004)
  $migrationsDir = Join-Path $projectRoot 'migrations'
  if (-not (Test-Path -LiteralPath $migrationsDir)) {
    throw "migrations directory missing."
  }
  Copy-Item -LiteralPath $migrationsDir -Destination $stagePath -Recurse

  # 5. Migration runner and utilities in scripts/
  $stagedScriptsDir = Join-Path $stagePath 'scripts'
  New-Item -ItemType Directory -Path $stagedScriptsDir -Force | Out-Null
  $scriptFiles = @('migrate.mjs', 'migration-utils.mjs')
  foreach ($sf in $scriptFiles) {
    $srcScript = Join-Path $projectRoot "scripts\$sf"
    if (-not (Test-Path -LiteralPath $srcScript)) {
      throw "Required script missing: scripts\$sf"
    }
    Copy-Item -LiteralPath $srcScript -Destination (Join-Path $stagedScriptsDir $sf)
  }

  # 6. Pre-archive validation: verify all critical files exist in stage
  $requiredFiles = @(
    'server.js',
    'package.json',
    'package-lock.json',
    'next.config.ts',
    'next-env.d.ts',
    'postcss.config.mjs',
    'tsconfig.json',
    'auth.ts',
    '.env.example',
    'src/app/page.tsx',
    'src/app/layout.tsx',
    'src/app/globals.css',
    'src/app/components/app-header.tsx',
    'src/app/components/auth-controls.tsx',
    'src/app/components/notification-indicator.tsx',
    'src/app/components/ticket-create-form.tsx',
    'src/app/components/ticket-detail-actions.tsx',
    'src/app/components/asset-create-form.tsx',
    'src/app/components/asset-actions.tsx',
    'src/app/tickets/page.tsx',
    'src/app/tickets/[ticketNumber]/page.tsx',
    'src/app/assets/page.tsx',
    'src/app/reports/page.tsx',
    'src/app/settings/page.tsx',
    'src/app/sign-in/page.tsx',
    'src/app/api/auth/[...nextauth]/route.ts',
    'src/app/api/health/route.ts',
    'src/app/api/tickets/route.ts',
    'src/app/api/assets/route.ts',
    'src/app/api/reports/route.ts',
    'src/app/api/notifications/route.ts',
    'src/app/api/admin/reference-data/route.ts',
    'src/server/auth/auth-config.ts',
    'src/server/auth/principal.ts',
    'src/server/identity/entra.ts',
    'src/server/tickets/repository.ts',
    'src/server/tickets/service.ts',
    'src/server/assets/repository.ts',
    'src/server/assets/service.ts',
    'src/server/reports/service.ts',
    'src/server/notifications/service.ts',
    'src/server/admin/service.ts',
    'src/server/db/pool.ts',
    'src/server/db/transaction.ts',
    'src/server/http/errors.ts',
    'src/server/http/request.ts',
    'src/types/next-auth.d.ts',
    'migrations/0001_identity_and_reference.sql',
    'migrations/0002_assets_and_tickets.sql',
    'migrations/0003_history_comments_files_notifications.sql',
    'migrations/0004_technician_internal_notes.sql',
    'scripts/migrate.mjs',
    'scripts/migration-utils.mjs'
  )

  foreach ($req in $requiredFiles) {
    $normPath = $req.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $stagedItem = Join-Path $stagePath $normPath
    if (-not (Test-Path -LiteralPath $stagedItem)) {
      throw "Validation failed: Required file not found in stage: $req"
    }
  }

  # 7. Pre-archive validation: verify forbidden files are NOT present in stage
  $forbiddenPatterns = @(
    '*.env',
    '.env.*',
    '*.pem',
    '*.key',
    '*.pfx',
    '*.zip',
    '*.tar',
    '*.tgz',
    '*.log'
  )
  foreach ($pattern in $forbiddenPatterns) {
    $found = Get-ChildItem -Path $stagePath -Filter $pattern -Recurse -File -Force -ErrorAction SilentlyContinue
    # Ignore .env.example
    $realViolations = $found | Where-Object { $_.Name -ne '.env.example' }
    if ($realViolations) {
      $violationNames = ($realViolations | Select-Object -ExpandProperty FullName) -join ', '
      throw "Security validation failed: Forbidden files found in stage: $violationNames"
    }
  }

  # Explicit check for forbidden directories in stage
  $forbiddenDirs = @('.git', '.next', 'node_modules', 'artifacts', 'deploy-patch')
  foreach ($fDir in $forbiddenDirs) {
    $checkPath = Join-Path $stagePath $fDir
    if (Test-Path -LiteralPath $checkPath) {
      throw "Security validation failed: Forbidden directory found in stage: $fDir"
    }
  }

  # 8. Create ZIP archive with relative paths
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stagePath,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  # 9. Post-archive validation: inspect the generated ZIP entries
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entryNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $zip.Entries) {
      $normEntry = $entry.FullName.Replace('\', '/')
      $entryNames.Add($normEntry) | Out-Null

      # Disallow absolute paths or parent directory traversals
      if ($normEntry.StartsWith('/') -or $normEntry.Contains('../') -or $normEntry.Contains('..\\')) {
        throw "Security violation in zip entry path: $normEntry"
      }

      # Disallow forbidden files in archive
      $name = $entry.Name
      if ($name -match '^\.env' -and $name -ne '.env.example') {
        throw "Security violation: Environment file in zip: $($entry.FullName)"
      }
      if ($name -match '\.(zip|tar|gz|tgz|pem|key|pfx|log)$' -and $entry.FullName -ne 'uppingham-helpdesk-cpanel.zip') {
        throw "Security violation: Archive/secret file in zip: $($entry.FullName)"
      }
      if ($normEntry -match '^(node_modules|\.git|\.next|artifacts|deploy-patch)/') {
        throw "Security violation: Forbidden directory in zip: $($entry.FullName)"
      }
    }

    # Verify all required files are present in the zip
    foreach ($req in $requiredFiles) {
      $normReq = $req.Replace('\', '/')
      if (-not $entryNames.Contains($normReq)) {
        throw "Post-archive validation failed: Required file '$normReq' missing from ZIP!"
      }
    }
  } finally {
    $zip.Dispose()
  }

  $zipItem = Get-Item $zipPath
  Write-Host "Success! Created verified archive: $zipPath ($($zipItem.Length) bytes)"
} catch {
  # Never leave an invalid or partial zip
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  Write-Error $_
  exit 1
} finally {
  if (Test-Path -LiteralPath $stagePath) {
    Remove-Item -LiteralPath $stagePath -Recurse -Force
  }
}
