---
name: antigravity-wallpaper-studio
description: Install, configure, and troubleshoot Antigravity Wallpaper Studio — auto-discovers the user's local Steam Wallpaper Engine Workshop videos, applies full-bleed transparent menu bars with adaptive luminance font colors, and provides a unified Theme Studio UI inside Google Antigravity Desktop.
---

# Antigravity Wallpaper Studio

A standalone Antigravity Desktop UI customization plugin that automatically discovers your local **Steam Wallpaper Engine** `.mp4`/`.webm` Workshop wallpapers and streams them behind a crisp, high-readability glassmorphic interface.

## Installation & Setup (Windows)

1. Build the payload:
   ```powershell
   python scripts/build_payload.py
   node --check dist/theme_payload.js
   ```
2. Install the persistent background daemon (Windows Scheduled Task, survives Antigravity restarts & Windows reboots, Unicode-safe):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/install-win.ps1
   ```
3. Verify live injection via CDP:
   ```powershell
   node scripts/verify_cdp.js
   ```

## Auto-Discovery of Steam Wallpaper Engine Videos

The daemon automatically discovers the user's Steam installation via:
1. Windows Registry (`HKCU\Software\Valve\Steam\SteamPath`)
2. Parsing `steamapps/libraryfolders.vdf` to locate all secondary SteamLibrary drives
3. Scanning every `steamapps/workshop/content/431960` folder for `.mp4` / `.webm` files and reading titles from `project.json`
4. Optional override via environment variable `AGY_STEAM_WORKSHOP_DIR`

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File scripts/uninstall-win.ps1
```
