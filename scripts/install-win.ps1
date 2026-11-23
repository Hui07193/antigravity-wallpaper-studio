# Antigravity Wallpaper Studio - Windows Installer
# Builds payload, patches CDP flag on Antigravity shortcuts, and registers a detached Windows Scheduled Task.
$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$NodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) {
    throw "Node.js (>= 22) is required. Please install Node.js and retry."
}

# 1. Build payload if not built yet
if (-not (Test-Path "$RootDir\dist\theme_payload.js")) {
    Write-Host "[install] Building dist/theme_payload.js..."
    Push-Location $RootDir
    python scripts/build_payload.py
    & $NodeExe --check dist/theme_payload.js
    Pop-Location
}

# 2. Patch --remote-debugging-port=0 on Antigravity shortcuts
$shell = New-Object -ComObject WScript.Shell
$shortcutPaths = @(
    "$env:USERPROFILE\Desktop\Antigravity.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Antigravity.lnk",
    "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Antigravity.lnk"
)
foreach ($lnk in $shortcutPaths) {
    if (Test-Path $lnk) {
        try {
            $s = $shell.CreateShortcut($lnk)
            if ($s.Arguments -notmatch "--remote-debugging-port") {
                $s.Arguments = ("$($s.Arguments) --remote-debugging-port=0").Trim()
                $s.Save()
                Write-Host "[install] Patched CDP flag: $lnk"
            }
        } catch {
            Write-Warning "[install] Could not patch shortcut $lnk : $_"
        }
    }
}

# 3. Stop existing daemon if running
$pidFile = "$RootDir\daemon.pid"
if (Test-Path $pidFile) {
    $oldPid = (Get-Content $pidFile -Raw).Trim()
    if ($oldPid) { Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 400
}

# 4. Generate Unicode-safe hidden launcher VBS (uses runtime script directory, no hardcoded username)
$vbsPath = "$RootDir\silent-start.vbs"
$vbsContent = @"
Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
themeDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = themeDir
WshShell.Run """$NodeExe"" """ & themeDir & "\daemon\theme_daemon.js""", 0, False
"@
[System.IO.File]::WriteAllText($vbsPath, $vbsContent, [System.Text.Encoding]::Unicode)

# 5. Register detached Windows Scheduled Task (survives Antigravity restarts & Windows reboots)
$taskName = "AntigravityWallpaperStudioDaemon"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

if (Test-Path $pidFile) {
    $newPid = (Get-Content $pidFile -Raw).Trim()
    Write-Host "[install] Daemon running independently (PID $newPid). Steam Workshop videos auto-discovered!"
    Write-Host "[install] Open Antigravity and click '更换壁纸 / 主题' in the left sidebar."
} else {
    Write-Warning "[install] Daemon started via Task Scheduler; check $RootDir\daemon.log if theme does not appear."
}
