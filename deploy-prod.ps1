param(
    [switch]$PrecheckOnly,
    [switch]$AllowWithoutRecentBeta
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir '.env.production.local'
$stateFile = Join-Path $scriptDir '.deploy-state.json'
$wranglerNpx = 'npx.cmd'
$recentBetaWindowHours = 24
$prodConfirmationPhrase = 'DEPLOY PROD SULLY-FRONTEND'

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

function Get-DeployState {
    if (-not (Test-Path -LiteralPath $stateFile)) {
        return $null
    }

    $raw = Get-Content -LiteralPath $stateFile -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }

    return $raw | ConvertFrom-Json
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

function Assert-CloudflareAuth {
    Write-Host "Precheck: verifying Cloudflare auth..." -ForegroundColor Cyan
    npx wrangler whoami
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler auth precheck failed with exit code $LASTEXITCODE"
    }
}

Push-Location $scriptDir
try {
    $state = Get-DeployState
    $gitHead = Get-GitHead
    $gitDirty = Get-GitDirty

    if (-not $AllowWithoutRecentBeta) {
        if ($gitDirty) {
            throw "Production deploy blocked: the working tree has uncommitted changes. Commit them, redeploy beta, then retry production."
        }

        if ($null -eq $state) {
            throw "Production deploy blocked: no recent beta deploy marker found. Run .\\deploy-beta.ps1 first."
        }

        $lastBetaAt = [datetimeoffset]::Parse($state.lastBetaDeployAt)
        $age = (Get-Date) - $lastBetaAt.LocalDateTime
        if ($age.TotalHours -gt $recentBetaWindowHours) {
            throw "Production deploy blocked: the latest recorded beta deploy is older than $recentBetaWindowHours hours. Run .\\deploy-beta.ps1 again first."
        }

        if ($state.gitDirty) {
            throw "Production deploy blocked: the latest recorded beta deploy came from a dirty working tree. Commit the intended code, redeploy beta, then retry production."
        }

        if ($gitHead -and $state.gitCommit -and $gitHead -ne $state.gitCommit) {
            throw "Production deploy blocked: HEAD ($gitHead) does not match the last beta deploy commit ($($state.gitCommit)). Re-run beta for the current code first."
        }
    }

    Write-Host "" 
    Write-Host "=========================================" -ForegroundColor Red
    Write-Host "  Production Pages deploy is about to run  " -ForegroundColor Red
    Write-Host "=========================================" -ForegroundColor Red
    Write-Host ""

    if ($state) {
        Write-Host "Latest recorded beta deploy: $($state.lastBetaDeployAt)" -ForegroundColor Yellow
        if ($state.previewUrl) {
            Write-Host "Latest beta preview URL: $($state.previewUrl)" -ForegroundColor Yellow
        }
    }

    Write-Host "Loading production env from $envFile" -ForegroundColor Cyan
    Import-EnvFile -Path $envFile
    Assert-RequiredEnv -Keys @('VITE_CSYOS_BACKEND_URL', 'VITE_CSYOS_BACKEND_TOKEN')

    Assert-CloudflareAuth

    Write-Host "Building production bundle..." -ForegroundColor Cyan
    npm run build -- --mode production
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }

    if ($PrecheckOnly) {
        Write-Host "Production precheck complete. No deploy executed." -ForegroundColor Green
        return
    }

    $confirm = Read-Host "Type '$prodConfirmationPhrase' to continue"
    if ($confirm -ne $prodConfirmationPhrase) {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }

    Write-Host "Deploying production bundle to Cloudflare Pages..." -ForegroundColor Cyan
    & $wranglerNpx wrangler pages deploy dist --project-name sully-frontend
    if ($LASTEXITCODE -ne 0) {
        throw "Pages deploy failed with exit code $LASTEXITCODE"
    }

    Write-Host "Production deploy complete." -ForegroundColor Green
} finally {
    Pop-Location
}
