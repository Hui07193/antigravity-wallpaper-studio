# Antigravity Wallpaper Studio - Windows Uninstaller
$RootDir = Split-Path -Parent $PSScriptRoot
$taskName = "AntigravityWallpaperStudioDaemon"

Write-Host "[uninstall] Removing Scheduled Task $taskName..."
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$pidFile = "$RootDir\daemon.pid"
if (Test-Path $pidFile) {
    $dpid = (Get-Content $pidFile -Raw).Trim()
    if ($dpid) { Stop-Process -Id $dpid -Force -ErrorAction SilentlyContinue }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

Remove-Item "$RootDir\silent-start.vbs" -Force -ErrorAction SilentlyContinue
Write-Host "[uninstall] Done. Restart Antigravity to return to the stock UI."
