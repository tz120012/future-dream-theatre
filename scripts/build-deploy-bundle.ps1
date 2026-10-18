# 未来梦想剧场 —— 打离线部署包（在开发机上运行，不是给老师的脚本）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-deploy-bundle.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-deploy-bundle.ps1 -Version 1.0.1 -Zip
#
# 产出：
#   dist\Forzh-Deploy\            直接拷到 U 盘 / 另一台电脑即可
#   dist\Forzh-Deploy-<版本>.zip  可选压缩包（-Zip）
#
# 前置条件：本机 Docker Desktop 正在运行；backend\data\whisper 里有 base 模型缓存
# （没有的话脚本会尝试用 backend\.venv 或系统 Python 下载一次）。

[CmdletBinding()]
param(
    [string]$Version = '1.0.0',
    [string]$OutDir = '',
    [switch]$SkipBuild,
    [switch]$Zip
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $RepoRoot 'dist' }
$BundleName = 'Forzh-Deploy'
$BundleDir = Join-Path $OutDir $BundleName
$DeploySrc = Join-Path $RepoRoot 'deploy'
$ImagesDir = Join-Path $BundleDir 'images'
$ModelSrc = Join-Path $RepoRoot 'backend\data\whisper'
$ModelDst = Join-Path $BundleDir 'whisper-model'

function Write-Section([string]$Text) {
    Write-Host ''
    Write-Host "=== $Text ===" -ForegroundColor Cyan
}
function Fail([string]$Text) {
    Write-Host "    [错误] $Text" -ForegroundColor Red
    exit 1
}

function Test-DockerDaemon {
    try {
        $null = & docker version --format '{{.Server.Version}}' 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

function Get-FolderSizeMb([string]$Path) {
    if (-not (Test-Path $Path)) { return 0 }
    $sum = (Get-ChildItem $Path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    if (-not $sum) { return 0 }
    return [math]::Round($sum / 1MB)
}

# ---------------------------------------------------------------------------

Write-Section "0. 环境检查"
if (-not (Test-DockerDaemon)) {
    Fail 'Docker 引擎没有运行。请先启动 Docker Desktop（等左下角变绿）再重试。'
}
Write-Host "    Docker: $(((& docker version --format '{{.Server.Version}}') | Out-String).Trim())"
Write-Host "    版本号: $Version"
Write-Host "    输出目录: $OutDir"

Write-Section "1. 准备 Whisper base 模型"
$hasModel = Test-Path (Join-Path $ModelSrc 'models--Systran--faster-whisper-base\snapshots')
if (-not $hasModel) {
    Write-Host '    本地没有模型缓存，尝试下载（只需一次，约 145MB）……'
    $venvPython = Join-Path $RepoRoot 'backend\.venv\Scripts\python.exe'
    $python = if (Test-Path $venvPython) { $venvPython } else { 'python' }
    $snippet = "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8', download_root=r'$ModelSrc')"
    & $python -c $snippet
    if ($LASTEXITCODE -ne 0) {
        Fail '下载模型失败。可手动执行：docker run --rm 跑一次转写，或设置 HF_ENDPOINT 镜像后重试。'
    }
}
if (-not (Test-Path (Join-Path $ModelSrc 'models--Systran--faster-whisper-base\snapshots'))) {
    Fail "模型目录不完整：$ModelSrc"
}
Write-Host "    模型已就绪（约 $(Get-FolderSizeMb $ModelSrc) MB）"

# ---------------------------------------------------------------------------

if (-not $SkipBuild) {
    Write-Section '2. 构建镜像（首次约 5~15 分钟）'
    # 不写 provenance/SBOM 证明，导出的 tar 更干净，老版本 docker load 也能吃。
    $env:BUILDX_NO_DEFAULT_ATTESTATIONS = '1'
    Push-Location $RepoRoot
    try {
        & docker compose -p forzh -f (Join-Path $RepoRoot 'docker-compose.yml') build --provenance=false
        if ($LASTEXITCODE -ne 0) { Fail 'docker compose build 失败，请看上面的报错。' }
    } finally {
        Pop-Location
    }
} else {
    Write-Section '2. 跳过构建（-SkipBuild），直接使用本机已有镜像'
}

Write-Section '3. 打版本标签'
foreach ($service in @('api', 'web')) {
    $image = "forzh-$service"
    $null = & docker image inspect $image 2>$null
    if ($LASTEXITCODE -ne 0) { Fail "本机找不到镜像 $image，请先构建（去掉 -SkipBuild）。" }
    & docker tag "${image}:latest" "${image}:$Version"
    if ($LASTEXITCODE -ne 0) { Fail "打标签失败：${image}:$Version" }
    Write-Host "    ${image}:$Version"
}

# ---------------------------------------------------------------------------

Write-Section '4. 导出离线镜像'
New-Item -ItemType Directory -Force -Path $ImagesDir | Out-Null
Get-ChildItem $ImagesDir -Filter *.tar -File -ErrorAction SilentlyContinue | Remove-Item -Force
foreach ($service in @('api', 'web')) {
    $image = "forzh-$service"
    $target = Join-Path $ImagesDir "${image}-$Version.tar"
    Write-Host "    docker save -> $(Split-Path -Leaf $target)"
    & docker save -o $target "${image}:$Version" "${image}:latest"
    if ($LASTEXITCODE -ne 0) { Fail "导出失败：$image" }
    Write-Host "    完成，$([math]::Round((Get-Item $target).Length / 1MB)) MB"
}

# ---------------------------------------------------------------------------

Write-Section '5. 组装部署包'
Get-ChildItem $BundleDir -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notin @('images', 'whisper-model') } |
    Remove-Item -Recurse -Force
New-Item -ItemType Directory -Force -Path $BundleDir | Out-Null

foreach ($file in @(
        'docker-compose.deploy.yml',
        '.env.example',
        'deploy.ps1',
        '一键部署.bat',
        '停止服务.bat',
        '查看日志.bat',
        '部署说明.md'
    )) {
    $source = Join-Path $DeploySrc $file
    if (-not (Test-Path $source)) { Fail "缺少文件：$source" }
    Copy-Item $source (Join-Path $BundleDir $file) -Force
}

# Windows PowerShell 5.1 按 ANSI 读取无 BOM 的脚本，中文会变乱码甚至语法报错，
# 所以进包前强制补上 UTF-8 BOM。
$scriptCopy = Join-Path $BundleDir 'deploy.ps1'
$scriptBytes = [System.IO.File]::ReadAllBytes($scriptCopy)
$hasBom = $scriptBytes.Length -ge 3 -and $scriptBytes[0] -eq 0xEF -and $scriptBytes[1] -eq 0xBB -and $scriptBytes[2] -eq 0xBF
if (-not $hasBom) {
    $scriptText = [System.Text.Encoding]::UTF8.GetString($scriptBytes)
    [System.IO.File]::WriteAllText($scriptCopy, $scriptText, (New-Object System.Text.UTF8Encoding($true)))
    Write-Host '    已为 deploy.ps1 补上 UTF-8 BOM'
}

# 模型缓存：只带需要的仓库目录和 refs，去掉锁文件等噪声。
if (Test-Path $ModelDst) { Remove-Item $ModelDst -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ModelDst | Out-Null
foreach ($entry in Get-ChildItem $ModelSrc -Force) {
    if ($entry.Name -in @('.locks', 'CACHEDIR.TAG')) { continue }
    if ($entry.Name -like '.DS_Store') { continue }
    Copy-Item $entry.FullName (Join-Path $ModelDst $entry.Name) -Recurse -Force
}
Write-Host "    已复制模型：$(Get-FolderSizeMb $ModelDst) MB"

# 给老师看的说明文件放到最外层，避免藏在子目录里找不到。
$quickStart = Join-Path $BundleDir '先看我-三步部署.txt'
@"
未来梦想剧场 —— 三步部署
====================================

第 1 步：装 Docker Desktop（只需一次）
    下载：https://www.docker.com/products/docker-desktop/
    双击安装（全程下一步），装完重启电脑，启动 Docker Desktop，
    等左下角状态变成绿色 Engine running。

第 2 步：把这个文件夹整个拷到目标电脑（建议 D:\Forzh-Deploy）
    必须整个文件夹一起拷，images 和 whisper-model 都不能少。

第 3 步：双击 一键部署.bat
    脚本会自动导入镜像、启动服务、打开浏览器。
    看到"部署完成"就可以了。

之后：
    打开地址   http://127.0.0.1:8080/
    停止服务   双击 停止服务.bat
    看日志     双击 查看日志.bat
    详细说明   部署说明.md
"@ | Set-Content -Path $quickStart -Encoding UTF8

# 版本标记：几个包放在一起时分得清哪份是哪份。
$versionFile = Join-Path $BundleDir '版本.txt'
@"
未来梦想剧场 —— 部署包
====================================

版本号   $Version
打包时间 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
镜像     forzh-api:$Version  /  forzh-web:$Version

升级到本版本（目标电脑上）：
    1) 双击旧包的 停止服务.bat
    2) 用本包的 images、脚本、文档覆盖过去（.env 可以保留）
    3) 双击 一键部署.bat
    设置里的 API Key 存在 Docker 卷里，不会丢。
"@ | Set-Content -Path $versionFile -Encoding UTF8

$bundleMb = Get-FolderSizeMb $BundleDir
Write-Host "    部署包大小：$bundleMb MB"

# ---------------------------------------------------------------------------

if ($Zip) {
    Write-Section '6. 压缩'
    $zipPath = Join-Path $OutDir "Forzh-Deploy-$Version.zip"
    Remove-Item $zipPath -ErrorAction SilentlyContinue
    $sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
    if ($sevenZip) {
        & $sevenZip.Source a -tzip -mx=1 $zipPath (Join-Path $OutDir $BundleName) | Out-Null
    } else {
        Write-Host '    没有 7z，用 Compress-Archive（1GB+ 时较慢）……'
        Compress-Archive -Path (Join-Path $OutDir $BundleName) -DestinationPath $zipPath -CompressionLevel Fastest
    }
    Write-Host "    $zipPath（$([math]::Round((Get-Item $zipPath).Length / 1MB)) MB）"
}

Write-Host ''
Write-Host "完成：$BundleDir" -ForegroundColor Green
Write-Host '把整个文件夹拷到目标电脑，双击里面的「一键部署.bat」即可。'
