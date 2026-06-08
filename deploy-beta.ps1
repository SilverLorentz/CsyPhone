param(
    [switch]$PrecheckOnly
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir '.env.staging.local'
$stateFile = Join-Path $scriptDir '.deploy-state.json'
$projectName = 'sully-frontend'
$betaBranch = 'beta'
$betaAliasUrl = 'https://beta.sully-frontend.pages.dev'
$wranglerNpx = 'npx.cmd'

function Import-EnvFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing env file: $Path"
    }

    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            return
        }

        $separatorIndex = $line.IndexOf('=')
        if ($separatorIndex -lt 1) {
            throw "Invalid env line: $line"
        }

        $key = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim()

        if ((($value.StartsWith('"') -and $value.EndsWith('"'))) -or (($value.StartsWith("'")) -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        Set-Item -Path ("Env:" + $key) -Value $value
    }
}

function Assert-RequiredEnv {
    param([string[]]$Keys)

    foreach ($key in $Keys) {
        $value = (Get-Item -Path ("Env:" + $key) -ErrorAction SilentlyContinue).Value
        if ([string]::IsNullOrWhiteSpace($value) -or $value -match 'replace-me|<your-|<set-') {
            throw "Missing or placeholder value for $key in $envFile"
        }
    }
}

function Find-PagesDeploymentUrl {
    param([string[]]$Lines, [string]$ProjectName)

    $pattern = "https://[A-Za-z0-9-]+\." + [regex]::Escape($ProjectName) + "\.pages\.dev"
    foreach ($line in $Lines) {
        $match = [regex]::Match($line, $pattern)
        if ($match.Success) {
            return $match.Value
        }
    }

    return $null
}

function Get-GitHead {
    $output = git rev-parse HEAD 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return ($output | Select-Object -First 1).Trim()
}

function Get-GitDirty {
    $output = git status --porcelain 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return @($output).Count -gt 0
}

function Invoke-BetaBuild {
    $viteCmd = Join-Path $scriptDir 'node_modules\.bin\vite.cmd'
    $viteJs = Join-Path $scriptDir 'node_modules\vite\bin\vite.js'

    if (Test-Path -LiteralPath $viteCmd) {
        & $viteCmd build --mode staging
        $script:BetaBuildExitCode = $LASTEXITCODE
        return
    }

    if (Test-Path -LiteralPath $viteJs) {
        & node $viteJs build --mode staging
        $script:BetaBuildExitCode = $LASTEXITCODE
        return
    }

    npm run build -- --mode staging
    $script:BetaBuildExitCode = $LASTEXITCODE
}

function Invoke-NativeCapture {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $FilePath @ArgumentList 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    return [pscustomobject]@{
        Output   = @($output | ForEach-Object { $_.ToString() })
        ExitCode = $exitCode
    }
}

function Save-BetaDeployState {
    param([string]$PreviewUrl)

    $state = [ordered]@{
        lastBetaDeployAt = (Get-Date).ToString('o')
        gitCommit        = Get-GitHead
        gitDirty         = Get-GitDirty
        betaAliasUrl     = $betaAliasUrl
        previewUrl       = $PreviewUrl
    }

    $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
}

function Get-LatestPreviewUrl {
    param([string]$ProjectName, [string]$Branch)

    $listResult = Invoke-NativeCapture -FilePath $wranglerNpx -ArgumentList @(
        'wrangler',
        'pages',
        'deployment',
        'list',
        '--project-name',
        $ProjectName
    )
    $listOutput = $listResult.Output
    $listExitCode = $listResult.ExitCode
    if ($listExitCode -ne 0) {
        throw "Pages deployment listing failed with exit code $listExitCode"
    }

    $rowPattern = '\|\s*Preview\s*\|\s*' + [regex]::Escape($Branch) + '\s*\|'
    foreach ($line in $listOutput) {
        if ($line -match $rowPattern) {
            $url = Find-PagesDeploymentUrl -Lines @($line) -ProjectName $ProjectName
            if ($null -ne $url) {
                return $url
            }
        }
    }

    return $null
}

Push-Location $scriptDir
try {
    Write-Host "Loading beta env from $envFile" -ForegroundColor Cyan
    Import-EnvFile -Path $envFile
    Assert-RequiredEnv -Keys @('VITE_CSYOS_BACKEND_URL', 'VITE_CSYOS_BACKEND_TOKEN')

    Write-Host "Precheck: verifying Cloudflare auth..." -ForegroundColor Cyan
    npx wrangler whoami
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler auth precheck failed with exit code $LASTEXITCODE"
    }

    Write-Host "Precheck: building beta bundle (staging mode)..." -ForegroundColor Cyan
    Invoke-BetaBuild
    if ($script:BetaBuildExitCode -ne 0) {
        throw "Staging build precheck failed with exit code $script:BetaBuildExitCode"
    }

    if ($PrecheckOnly) {
        Write-Host "Precheck complete. No deploy executed." -ForegroundColor Green
        Write-Host "Canonical beta URL: $betaAliasUrl" -ForegroundColor Green
        return
    }

    Write-Host "Deploying beta bundle to Cloudflare Pages preview..." -ForegroundColor Cyan
    $deployResult = Invoke-NativeCapture -FilePath $wranglerNpx -ArgumentList @(
        'wrangler',
        'pages',
        'deploy',
        'dist',
        '--project-name',
        $projectName,
        '--branch',
        $betaBranch,
        '--commit-dirty=true'
    )
    $deployOutput = $deployResult.Output
    $deployExitCode = $deployResult.ExitCode
    $deployOutput | ForEach-Object { $_ }
    if ($deployExitCode -ne 0) {
        throw "Pages deploy failed with exit code $deployExitCode"
    }

    Write-Host "Beta deploy complete." -ForegroundColor Green
    Write-Host "Canonical beta URL: $betaAliasUrl" -ForegroundColor Green

    $latestPreviewUrl = Find-PagesDeploymentUrl -Lines $deployOutput -ProjectName $projectName
    if ($null -eq $latestPreviewUrl) {
        $latestPreviewUrl = Get-LatestPreviewUrl -ProjectName $projectName -Branch $betaBranch
    }

    if ($null -ne $latestPreviewUrl) {
        Write-Host "Latest preview URL: $latestPreviewUrl" -ForegroundColor Green
    } else {
        Write-Host "Latest preview URL: unavailable (run 'npx wrangler pages deployment list --project-name $projectName' if needed)." -ForegroundColor Yellow
    }

    Save-BetaDeployState -PreviewUrl $latestPreviewUrl
    Write-Host "Beta deploy marker recorded in $stateFile" -ForegroundColor Green
} finally {
    Pop-Location
}
