# Antigravity Wallpaper Studio

> **Steam Wallpaper Engine 动态壁纸接入 & 毛玻璃 UI 工作室（Google Antigravity 桌面端插件）**
>
> Auto-discovers your local **Steam Wallpaper Engine** Workshop `.mp4`/`.webm` wallpapers and renders them seamlessly behind a zero-lag glassmorphic UI in **Google Antigravity Desktop** — with full-bleed transparent menu bars, real-time luminance-adaptive font colors, opacity sliders, 10+ chat bubbles, and 8 composer styles.

---

## ✨ Features / 核心特性

- **🔍 自动检索本地 Steam Wallpaper Engine 壁纸**：
  - 安装后自动读取 Windows 注册表（`HKCU\Software\Valve\Steam`）并解析 `steamapps/libraryfolders.vdf`，自动发现所有磁盘上的 SteamLibrary 目录与 `workshop/content/431960` 中的全部 `.mp4` / `.webm` 动态壁纸，无需手动复制文件（也支持通过环境变量 `AGY_STEAM_WORKSHOP_DIR` 指定自定义目录）。
  - 本仓库**不包含任何第三方版权壁纸**，开箱自动导入你自己的 Steam 壁纸库。
- **🎬 4K 60fps 动态视频直连 + 定时轮播**：
  - 内置本地 HTTP Range 流媒体服务（`127.0.0.1:47321`），零卡顿循环播放 4K 动态视频，支持一键**「随机下一张」**与**每 5 / 15 / 30 分钟自动轮播**，同时文字和卡片保持 **100% 不透明清晰**。
- **🪟 菜单栏 & 侧边栏全透覆盖 + 字体亮度自适应**：
  - 壁纸完整覆盖顶部菜单栏与左侧导航栏；内置轻量亮度采样器，根据当前壁纸/视频画面明暗自动切换**深墨黑字**或**纯白字**（也可手动锁定自动/深色/浅色）。
- **🎛️ 统一整合到一个「更换壁纸 / 主题」入口**：
  - 左侧边栏一键打开 **Antigravity Theme Studio**（兼容中/英文界面），集中调节：
    - Steam 动态壁纸切换 / 本地静态图片上传
    - 菜单栏/侧栏不透明度（`0%–85%`）
    - 主界面回答区域白框不透明度（`0%–90%`）
    - 全局背景遮罩浓度（`0%–92%`）
    - 菜单栏字体自适应模式（自动 / 深色字 / 浅色字）
    - **10+ 款 User Chat Bubble**（含原版纯白 `Classic White`、原版纯黑 `Classic Black`、赛博霓虹、樱花玻璃、极光棱镜、京都抹茶等）
    - **8 款 Composer Style**（跟随主题、水晶玻璃、鎏金双框、极简细框、赛博霓虹、极光棱镜、樱花柔光、悬浮胶囊）
    - 自定义用户 / AI 聊天头像与配置 JSON 导入导出
- **♾️ 重启持久化（Windows 计划任务独立守护）**：
  - 守护进程独立运行于 Windows 任务计划程序，完全脱离 Antigravity 进程树，重启 Antigravity 或重启电脑均可自动恢复生效，并原生支持含中文的 Windows 用户名路径。

---

## 📦 Prerequisites / 环境要求

- **Google Antigravity Desktop**（Windows / macOS / Linux）
- **Node.js >= 22**（使用原生 `WebSocket`，零第三方 npm 依赖）
- **Python 3.x**（用于运行 `scripts/build_payload.py` 编译注入脚本）
- **Steam Wallpaper Engine**（可选；若未安装，也可直接上传本地静态图片使用）

---

## 🚀 Quick Install / 一键安装（作为 Antigravity 插件）

### 方式一：克隆到 Antigravity 插件目录（推荐）

```powershell
git clone https://github.com/Hui07193/antigravity-wallpaper-studio.git "$env:USERPROFILE\.gemini\config\plugins\antigravity-wallpaper-studio"
cd "$env:USERPROFILE\.gemini\config\plugins\antigravity-wallpaper-studio"
python scripts/build_payload.py
powershell -ExecutionPolicy Bypass -File scripts/install-win.ps1
```

安装完成后：
1. 如果当前 Antigravity 未开启 CDP 调试端口，请完全退出（系统托盘右键退出）后通过桌面/开始菜单快捷方式重新打开。
2. 点击左侧边栏的 **「更换壁纸 / 主题」**，即可直接从下拉菜单切换你本地自动检索到的 Steam 动态壁纸并调节透明度！

### 方式二：直接让 Antigravity 帮你安装

把本仓库链接发给 Antigravity，说：「帮我安装并启动这个插件」，Agent 会自动读取 `SKILL.md` 完成编译与部署。

---

## 🛠️ Custom Steam Workshop Path / 自定义壁纸目录（可选）

如果希望额外指定非默认目录，可设置环境变量后重新启动守护进程：

```powershell
$env:AGY_STEAM_WORKSHOP_DIR = "E:\MyWallpapers"
```

---

## 🧹 Uninstall / 卸载

```powershell
cd "$env:USERPROFILE\.gemini\config\plugins\antigravity-wallpaper-studio"
powershell -ExecutionPolicy Bypass -File scripts/uninstall-win.ps1
```

---

## 🙏 Credits & License

- Built on top of the zero-live-blur CDP theme engine architecture inspired by [antigravity-custom-theme-skill](https://github.com/giakiet22102006/antigravity-custom-theme-skill).
- Licensed under the **MIT License**.
