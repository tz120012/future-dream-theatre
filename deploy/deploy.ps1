# 未来梦想剧场 —— 一键部署脚本（Windows / PowerShell 5.1+）
#
# 由三个 .bat 调用（.bat 只负责用 ASCII 调起本脚本，中文提示都在这里，
# 因为 cmd 解析含中文的 .bat 会串行错乱）：
#   一键部署.bat   -> -Action start（默认）：检查 Docker、导入镜像、启动服务、打开浏览器
#   停止服务.bat   -> -Action stop ：停止容器，保留数据
#   查看日志.bat   -> -Action logs ：实时跟踪日志

param(
    [ValidateSet('start', 'stop', 'logs')]
    [string]$Action = 'start',
    # 供自动化测试/计划任务使用：不等待回车，服务就绪即退出。
    [switch]$NoPause
)

# 注意：Docker 命令失败时会往 stderr 写内容，`$ErrorActionPreference='Stop'`
# 会把它升级成「意外错误」并中断脚本（例如镜像还没导入时）。这里统一用 Continue，
# 每个关键步骤自己检查退出码和结果。
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Root = $PSScriptRoot
if (-not $Root) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location $Root

trap {
    Write-Host ''
    Write-Host "   [失败] 意外错误：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host '   把窗口里这段文字截图发给维护人员即可定位问题。'
    exit 1
}

$ComposeFile = Join-Path $Root 'docker-compose.deploy.yml'
$ImagesDir = Join-Path $Root 'images'
$ModelDir = Join-Path $Root 'whisper-model'

function Write-Head([string]$Text) {
    Write-Host ''
    Write-Host "== $Text ==" -ForegroundColor Cyan
}
function Write-Ok([string]$Text)   { Write-Host "   [OK] $Text"   -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host "   [注意] $Text" -ForegroundColor Yellow }
function Write-Bad([string]$Text)  { Write-Host "   [失败] $Text" -ForegroundColor Red }

function Get-EnvValue([string]$Name, [string]$Default) {
    $envFile = Join-Path $Root '.env'
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile -Encoding UTF8) {
            $trimmed = $line.Trim()
            if ($trimmed -match "^\s*$([regex]::Escape($Name))\s*=\s*(.+?)\s*$") {
                $value = $Matches[1].Trim('"').Trim("'")
                if ($value) { return $value }
            }
        }
    }
    return $Default
}

function Test-DockerDaemon {
    try {
        $null = & docker version --format '{{.Server.Version}}' 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

function Start-DockerDesktop {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\Docker Desktop.exe')
    )
    foreach ($exe in $candidates) {
        if ($exe -and (Test-Path $exe)) {
            Write-Host '   正在启动 Docker Desktop，第一次启动可能要 1~3 分钟……'
            Start-Process -FilePath $exe | Out-Null
            return $true
        }
    }
    return $false
}

function Wait-DockerDaemon([int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-DockerDaemon) { return $true }
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 3
    }
    Write-Host ''
    return (Test-DockerDaemon)
}

function Get-ComposeInvoker {
    $null = & docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) {
        return { param([string[]]$Arguments) & docker compose -f $ComposeFile @Arguments }
    }
    $null = & docker-compose --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        return { param([string[]]$Arguments) & docker-compose -f $ComposeFile @Arguments }
    }
    return $null
}

function Test-PortBusy([int]$Port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return ($null -ne $conn)
    } catch {
        $client = New-Object System.Net.Sockets.TcpClient
        try { $client.Connect('127.0.0.1', $Port); return $true }
        catch { return $false }
        finally { $client.Dispose() }
    }
}

function Find-FreePort([int]$RangeStart, [int]$RangeEnd) {
    for ($p = $RangeStart; $p -le $RangeEnd; $p++) {
        if (-not (Test-PortBusy $p)) { return $p }
        # 上一次部署用的端口本来就被本项目容器占着，可以继续沿用，不必漂移。
        if (Test-PortOwnedByUs $p) { return $p }
    }
    return 0
}

function Test-PortOwnedByUs([int]$Port) {
    # 逐端口判断，而不是"本项目有容器在跑"就认为端口是我们的：
    # 重新部署时 web 容器在跑，但 8000 可能被别的程序（比如开发模式下的 uvicorn）占着。
    $output = & docker ps --filter "publish=$Port" --format '{{.Names}}' 2>&1
    foreach ($line in $output) {
        if ("$line".Trim() -match '^forzh-') { return $true }
    }
    return $false
}

function Set-EnvValue([string]$Name, [string]$Value) {
    $envFile = Join-Path $Root '.env'
    $lines = @()
    if (Test-Path $envFile) { $lines = @(Get-Content $envFile -Encoding UTF8) }
    $found = $false
    $result = @()
    foreach ($line in $lines) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=") {
            $result += "$Name=$Value"
            $found = $true
        } else {
            $result += $line
        }
    }
    if (-not $found) { $result += "$Name=$Value" }
    # 不带 BOM，否则 compose 读到的第一个变量名会多出 BOM 字符。
    [System.IO.File]::WriteAllLines($envFile, $result, (New-Object System.Text.UTF8Encoding($false)))
}

function Resolve-Port([string]$Name, [int]$Port, [int]$RangeStart, [int]$RangeEnd, [bool]$BusyIsOurs) {
    if (-not (Test-PortBusy $Port)) { return $Port }
    if ($BusyIsOurs) {
        Write-Note "端口 $Port 由本项目正在运行的容器占用，本次会更新它们。"
        return $Port
    }
    $alternative = Find-FreePort $RangeStart $RangeEnd
    if ($alternative -eq 0) {
        Write-Bad "端口 $Port 被别的程序占用，且 $RangeStart-$RangeEnd 段也没有空闲端口。"
        Write-Host "   请关掉占用 $Port 的程序（或用记事本改本目录 .env 里的端口），再双击「一键部署.bat」。"
        exit 1
    }
    Write-Note "端口 $Port 被其他程序占用，已自动改用 $alternative。"
    Set-EnvValue $Name $alternative
    return $alternative
}

function Test-ModelPresent {
    $repo = Join-Path $ModelDir 'models--Systran--faster-whisper-base\snapshots'
    if (-not (Test-Path $repo)) { return $false }
    foreach ($snapshot in Get-ChildItem $repo -Directory -ErrorAction SilentlyContinue) {
        if (Test-Path (Join-Path $snapshot.FullName 'model.bin')) { return $true }
    }
    return $false
}

function Import-Images([string]$Tag, $Compose) {
    $needed = @("forzh-api:$Tag", "forzh-web:$Tag")
    $missing = @()
    foreach ($name in $needed) {
        $null = & docker image inspect $name 2>$null
        if ($LASTEXITCODE -ne 0) { $missing += $name }
    }
    if ($missing.Count -eq 0) {
        Write-Ok "镜像已在本机（$Tag），跳过导入"
        return $true
    }

    $tarballs = @()
    if (Test-Path $ImagesDir) {
        $tarballs = Get-ChildItem $ImagesDir -Filter *.tar -File | Sort-Object Name
    }
    if ($tarballs.Count -eq 0) {
        Write-Bad "缺少镜像文件，且本机没有 $Tag 镜像。"
        Write-Host '   请确认部署包里的 images 文件夹完整（应该有 forzh-api-*.tar、forzh-web-*.tar）。'
        return $false
    }

    foreach ($tar in $tarballs) {
        Write-Host "   正在导入镜像：$($tar.Name)（$( [math]::Round($tar.Length / 1MB) ) MB，请耐心等待）"
        $loadOutput = & docker load -i $tar.FullName 2>&1
        $loadCode = $LASTEXITCODE
        foreach ($line in $loadOutput) { Write-Host "     $line" -ForegroundColor DarkGray }
        if ($loadCode -ne 0) {
            Write-Bad "导入失败：$($tar.Name)"
            return $false
        }
    }

    foreach ($name in $needed) {
        $null = & docker image inspect $name 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Bad "导入后仍然找不到镜像 $name"
            Write-Host '   可能是部署包与 .env 里的 FORZH_TAG 不一致；删掉 .env 再试一次。'
            return $false
        }
    }
    Write-Ok '镜像导入完成'
    return $true
}

function Show-ApiLogs($Compose) {
    Write-Host ''
    Write-Host '   最近 40 行接口容器日志：' -ForegroundColor DarkGray
    $logOutput = & $Compose -Arguments @('logs', '--tail', '40', 'api') 2>&1
    foreach ($line in $logOutput) { Write-Host "     $line" -ForegroundColor DarkGray }
}

function Wait-AppReady([int]$ApiPort, [int]$Seconds) {
    $base = "http://127.0.0.1:$ApiPort/api/health"
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200) { return $true }
        } catch { }
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 2
    }
    Write-Host ''
    return $false
}

# ---------------------------------------------------------------------------

$bannerText = switch ($Action) {
    'stop' { '未来梦想剧场 · 停止服务' }
    'logs' { '未来梦想剧场 · 查看日志' }
    default { '未来梦想剧场 · 一键部署' }
}
Write-Host ''
Write-Host "  $bannerText" -ForegroundColor White
Write-Host '  ------------------------------------------------------------'

Write-Head '第 1 步：检查 Docker'

if (-not (Test-Path $ComposeFile)) {
    Write-Bad "找不到 docker-compose.deploy.yml，请确认是在解压后的部署包目录里运行。"
    exit 1
}

$dockerCli = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCli) {
    Write-Bad '这台电脑还没有安装 Docker Desktop。'
    Write-Host ''
    Write-Host '   安装步骤：'
    Write-Host '     1) 打开 https://www.docker.com/products/docker-desktop/ 下载 Windows 版；'
    Write-Host '     2) 双击安装，全程下一步，装完重启电脑；'
    Write-Host '     3) 启动 Docker Desktop，等左下角变成绿色 “Engine running”；'
    Write-Host '     4) 再双击本目录的「一键部署.bat」。'
    Write-Host ''
    try { Start-Process 'https://www.docker.com/products/docker-desktop/' } catch { }
    exit 1
}

if (-not (Test-DockerDaemon)) {
    Write-Note 'Docker 已安装，但引擎没在运行。'
    if (Start-DockerDesktop) {
        if (-not (Wait-DockerDaemon 240)) {
            Write-Bad 'Docker 引擎仍未就绪。'
            Write-Host ''
            Write-Host '   请手动检查：'
            Write-Host '     * 任务栏右下角是否有 Docker 图标？点开它，等状态变成 “Engine running”；'
            Write-Host '     * 如果是刚装好的 Docker，需要重启一次电脑；'
            Write-Host '     * 提示 WSL 相关错误时，在开始菜单搜 “启用或关闭 Windows 功能”，'
            Write-Host '       勾选「适用于 Linux 的 Windows 子系统」和「虚拟机平台」，重启后重试。'
            exit 1
        }
    } else {
        Write-Bad '找不到 Docker Desktop，请从开始菜单手动启动后重试。'
        exit 1
    }
}

$serverVersion = (& docker version --format '{{.Server.Version}}' 2>$null | Out-String).Trim()
Write-Ok "Docker 引擎正常（$serverVersion）"

$Compose = Get-ComposeInvoker
if (-not $Compose) {
    Write-Bad 'docker compose 不可用，请更新 Docker Desktop 到最新版。'
    exit 1
}

# ---- 停止 / 看日志：不碰镜像和配置，直接做完退出 ----

if ($Action -eq 'stop') {
    Write-Head '停止服务'
    $downOutput = & $Compose -Arguments @('down') 2>&1
    foreach ($line in $downOutput) { Write-Host "   $line" -ForegroundColor DarkGray }
    Write-Ok '服务已停止'
    Write-Host ''
    Write-Host '   数据（API Key、设置）仍保留在 Docker 卷 forzh_app-data 中，'
    Write-Host '   下次双击「一键部署.bat」即可恢复，不需要重新配置。'
    Write-Host ''
    if (-not $NoPause) { Read-Host '   按回车键关闭本窗口' }
    exit 0
}

if ($Action -eq 'logs') {
    Write-Head '实时日志（按 Ctrl+C 退出，不会停止服务）'
    & $Compose -Arguments @('logs', '-f', '--tail', '100')
    if (-not $NoPause) { Read-Host '   按回车键关闭本窗口' }
    exit 0
}

# ---------------------------------------------------------------------------

Write-Head '第 2 步：准备镜像与配置'

$Tag = Get-EnvValue 'FORZH_TAG' 'latest'
$WebPort = [int](Get-EnvValue 'WEB_PORT' '8080')
$ApiPort = [int](Get-EnvValue 'API_PORT' '8000')

if (-not (Import-Images -Tag $Tag -Compose $Compose)) { exit 1 }

if (Test-ModelPresent) {
    Write-Ok '本地 Whisper 语音模型已就绪（不需要联网下载）'
} else {
    Write-Note 'whisper-model 文件夹缺失或为空，首次语音识别会联网下载模型。'
}

if (Test-Path (Join-Path $Root '.env')) {
    Write-Ok '.env 配置已存在'
} else {
    Copy-Item (Join-Path $Root '.env.example') (Join-Path $Root '.env') -ErrorAction SilentlyContinue
    if (-not (Test-Path (Join-Path $Root '.env'))) { New-Item -ItemType File -Path (Join-Path $Root '.env') | Out-Null }
    Write-Ok '已生成默认 .env（一般不用改）'
}

# 端口被别的程序占用时自动换一个，并写回 .env，避免"双击就报错"。
$WebPort = Resolve-Port -Name 'WEB_PORT' -Port $WebPort -RangeStart 8081 -RangeEnd 8120 -BusyIsOurs (Test-PortOwnedByUs $WebPort)
$ApiPort = Resolve-Port -Name 'API_PORT' -Port $ApiPort -RangeStart 18000 -RangeEnd 18020 -BusyIsOurs (Test-PortOwnedByUs $ApiPort)

# ---------------------------------------------------------------------------

Write-Head '第 3 步：启动服务'

$upOutput = & $Compose -Arguments @('up', '-d', '--remove-orphans') 2>&1
$upCode = $LASTEXITCODE
foreach ($line in $upOutput) { Write-Host "   $line" -ForegroundColor DarkGray }
if ($upCode -ne 0) {
    Write-Bad '容器启动失败。'
    Show-ApiLogs $Compose
    exit 1
}

Write-Host '   等待服务就绪' -NoNewline
if (-not (Wait-AppReady -ApiPort $ApiPort -Seconds 120)) {
    Write-Bad "接口在 120 秒内没有就绪（端口 $ApiPort）。"
    Show-ApiLogs $Compose
    exit 1
}
Write-Host ''
Write-Ok '接口已就绪'

$webOk = $false
try {
    $webResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort/" -UseBasicParsing -TimeoutSec 10
    $webOk = ($webResponse.StatusCode -eq 200)
} catch { $webOk = $false }

if ($webOk) { Write-Ok '网页已就绪' } else { Write-Note "网页端口 $WebPort 暂时没响应，稍等几秒刷新即可。" }

$url = "http://127.0.0.1:$WebPort/"
try { Start-Process $url } catch { }

# ---------------------------------------------------------------------------

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host '   部署完成！' -ForegroundColor Green
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host ''
Write-Host "   使用地址：$url" -ForegroundColor White
Write-Host '   （浏览器没自动打开的话，手动输入上面这个地址）'
Write-Host ''
Write-Host '   接下来建议做两件事：'
Write-Host '     1) 点页面左上角图标 → 设置，填硅基流动 API Key（不填也能用：'
Write-Host '        对话走内置模板、图片是占位图）；'
Write-Host '     2) 在设置里点一次「测试」或直接走一遍课堂流程，确认摄像头和麦克风正常。'
Write-Host ''
Write-Host '   服务已在后台常驻：关掉这个窗口不影响使用。'
Write-Host '   下次开机只要 Docker Desktop 启动了，服务会自动恢复。'
Write-Host '   停止服务：双击「停止服务.bat」；看日志：双击「查看日志.bat」。'
Write-Host ''
Write-Host '   数据（API Key、临时图片）保存在 Docker 卷 forzh_app-data 里，'
Write-Host '   重启、升级都不会丢；换电脑迁移见「部署说明.md」。'
Write-Host ''
if (-not $NoPause) { Read-Host '   按回车键关闭本窗口' }
