# Hyro Music — AI Agent Guide

> **MANDATORY**: Before implementing any feature, fixing any bug, or modifying any code in this project, you MUST first read the relevant documentation for the packages and technologies involved. Use the documentation references below to look up correct APIs, types, usage patterns, and known pitfalls. Do not guess or rely on memory — always verify against the official docs.

## Documentation References

### Languages and Runtimes

| Technology | Documentation URL |
|---|---|
| TypeScript 5.6 | https://www.typescriptlang.org/docs/ |
| TypeScript Configuration | https://www.typescriptlang.org/tsconfig |
| Node.js (child_process, etc.) | https://nodejs.org/docs/latest/api/ |
| ES Modules | https://nodejs.org/api/esm.html |

### Core Frameworks and Libraries

| Package | Documentation URL |
|---|---|
| Electron 33 | https://www.electronjs.org/docs |
| Electron — BrowserWindow | https://www.electronjs.org/docs/latest/api/browser-window |
| Electron — ipcMain / ipcRenderer | https://www.electronjs.org/docs/latest/api/ipc-main |
| Electron — contextBridge | https://www.electronjs.org/docs/latest/api/context-bridge |
| Electron — app | https://www.electronjs.org/docs/latest/api/app |
| electron-vite 2 | https://electron-vite.org/guide/ |
| electron-vite — Config | https://electron-vite.org/config/ |
| Vite 6 | https://vite.dev/guide/ |
| React 18 | https://react.dev/learn |
| React — Hooks (useState, useContext, useRef, useCallback, useEffect) | https://react.dev/reference/react/hooks |
| React — Context | https://react.dev/learn/passing-data-deeply-with-context |
| react-dom | https://react.dev/reference/react-dom/client |

### Music and Audio

| Package / Tool | Documentation URL |
|---|---|
| youtubei.js (InnerTube) | https://github.com/LuanRT/YouTube.js |
| youtubei.js — Guide & API | https://ytjs.dev |
| ytmusic-api v5 (fallback) | https://github.com/zS1L3NT/ts-npm-ytmusic-api |
| ytmusic-api — README & Usage | https://www.npmjs.com/package/ytmusic-api |
| yt-dlp (CLI) | https://github.com/yt-dlp/yt-dlp#readme |
| Groq API — Chat Completions | https://console.groq.com/docs/api-reference |
| Groq API — Models | https://console.groq.com/docs/models |
| yt-dlp — Audio Extraction | https://github.com/yt-dlp/yt-dlp#extracting-audio |
| HTMLAudioElement (Web API) | https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement |
| Audio (Web API) | https://developer.mozilla.org/en-US/docs/Web/API/Audio |
| MediaSession API | https://developer.mozilla.org/en-US/docs/Web/API/MediaSession |

### Electron Tooling

| Package | Documentation URL |
|---|---|
| @electron-toolkit/preload | https://github.com/alex8088/quick-start/tree/master/packages/toolkit/preload |
| @electron-toolkit/utils | https://github.com/alex8088/quick-start/tree/master/packages/toolkit/utils |

### Build and Dev Tools

| Package | Documentation URL |
|---|---|
| @vitejs/plugin-react | https://github.com/vitejs/vite-plugin-react |
| Vite — Environment Variables | https://vite.dev/guide/env-and-mode |
| Rollup (used by Vite internally) | https://rollupjs.org/ |

### Web APIs (used in renderer)

| API | Documentation URL |
|---|---|
| Fetch API | https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API |
| CSS Custom Properties | https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties |
| CSS flexbox | https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout |
| CSS Grid | https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout |
| Tailwind CSS v4 | https://tailwindcss.com/docs |
| shadcn/ui | https://ui.shadcn.com/docs |
| Lucide React | https://lucide.dev/guide/packages/lucide-react |

## Project Overview

Hyro Music is an **Electron desktop application** that provides a music streaming experience powered by YouTube Music. It lets users search for songs, browse home sections, manage a playback queue, and stream audio — all through a dark, Spotify-inspired UI.

The app uses `youtubei.js` (direct InnerTube API client) as the primary source for music metadata and stream URLs, with `ytmusic-api` as a fallback. `yt-dlp` (CLI) serves as a secondary fallback for stream URL resolution and is still used for file downloads. Audio plays via the browser's built-in `HTMLAudioElement`.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 33 |
| Build tooling | electron-vite 2 + Vite 6 |
| Frontend framework | React 18 |
| Language | TypeScript 5.6 (strict mode) |
| Styling | Tailwind CSS v4 + shadcn/ui (New York style, dark theme) |
| Music metadata | `youtubei.js` (InnerTube) primary, `ytmusic-api` v5 fallback |
| Audio streams | `youtubei.js` Player (primary), `yt-dlp` CLI fallback |
| Audio playback | Native `HTMLAudioElement` in the renderer |

There is **no testing framework**, **no linter/formatter config**, and **no CI/CD pipeline** currently in the project.

## Architecture

The application follows Electron's standard three-process model:

### Main Process (`src/main/`)

- **`index.ts`** — App entry point. Creates the `BrowserWindow`, initializes `ytmusic-api` (in background as fallback), registers IPC handlers, and manages the window lifecycle. InnerTube (`youtubei.js`) initializes lazily on first use.
- **`innertube/`** — InnerTube API module (direct YouTube Music API client via `youtubei.js`):
  - `client.ts` — Singleton `Innertube` instance with lazy initialization. Provides `getInnertube()` (creates/caches instance), `resetInnertube()` (forces re-initialization on failure), and `isInnertubeReady()` (status check).
  - `helpers.ts` — Type mappers that convert youtubei.js response objects (`MusicResponsiveListItem`, `MusicTwoRowItem`, `MusicMultiRowListItem`, `MusicCardShelf`, `PlaylistPanelVideo`, headers, detail objects) to Hyro's shared types (`Track`, `Album`, `Playlist`, `Artist`, `HomeSection`, `SearchResults`). Includes `extractThumbnails()` (universal recursive cover art extractor that handles wrapper shapes like `MusicThumbnail`, `header`, `background`, and getter properties across all endpoints), `extractArtistsFromItem()` (extracts all artists associated with a track, album, or playlist from different endpoint models), universal search results mapper (`mapSearchResults` traversing both built-in shelves and raw `search.contents` across Top Result cards and item sections), home feed mapper, album/playlist/artist detail mappers (including async `mapArtistDetail` which fetches all songs via `artistResponse.getAllSongs()` and expands all albums and singles via `more_content` endpoint calls and continuation token pagination), and up-next track mapper.
  - `index.ts` — Barrel export.
- **`ipc/music.ts`** — All IPC handler registrations. Exposes these channels to the renderer via `ipcMain.handle()`:
  - `music:search` — Search YouTube Music (returns songs, artists, albums, playlists). Uses InnerTube primary, ytmusic-api fallback.
  - `music:getHomeSections` — Fetch the YouTube Music home feed. Uses InnerTube primary, ytmusic-api fallback.
  - `music:getSong` — Get detailed song info by `videoId`. Uses InnerTube primary, ytmusic-api fallback.
  - `music:getAlbum` — Get album details and its song list. Uses InnerTube primary, ytmusic-api fallback.
  - `music:getPlaylist` — Get playlist details and its video list. Uses InnerTube primary, ytmusic-api fallback.
  - `music:getArtist` — Get artist info, top songs, albums, and singles. Uses InnerTube primary, ytmusic-api fallback.
  - `music:getUpNexts` — Get "up next" recommendations and same-genre related tracks for continuous playback (`yt.music.getUpNext` + `yt.music.getRelated`). Uses InnerTube primary, ytmusic-api fallback.
  - `music:getSearchSuggestions` — Get autocomplete suggestions. Uses InnerTube primary, ytmusic-api fallback.
  - `music:getLyrics` — Fetch lyrics from Musixmatch (synced) → LRCLIB (synced) → YouTube Music (plain). YouTube Music lyrics use InnerTube primary, ytmusic-api fallback. Title cleaning uses Groq API (when configured) or regex fallback.
  - `player:getStreamUrl` — Resolve a streamable audio URL. Uses InnerTube multi-client format resolution (`ANDROID_VR` → `IOS` → `ANDROID` → `TV` → `WEB` via `getBasicInfo` and `chooseFormat`) to obtain direct pre-deciphered audio URLs that return 200 OK in Chromium without 403 Forbidden throttling or JavaScript signature evaluation failures, falling back to `yt-dlp -f bestaudio --get-url` (30s timeout). Resets Innertube on failure to force re-initialization.
- **`ipc/download.ts`** — Download IPC handlers for track/album/playlist downloads via `yt-dlp`:
  - `download:track` — Download a single track (spawns `yt-dlp` with `--extractor-args 'youtube:player_client=android_vr'` as primary client, falling back to `web_creator,mweb` then `web`; `--cookies-from-browser BROWSER+basictext` (appending `+basictext` for Chromium browsers to bypass GNOME Keyring AES-CBC encryption issues) when configured in settings, sends progress with clean trackName via `download:progress`)
  - `download:album` — Download all tracks in an album sequentially (downloads album cover art once as `cover.jpg` and uses it for all tracks' `thumbnailPath` in the registry)
  - `download:playlist` — Download all tracks in a playlist sequentially (downloads playlist cover art once as `cover.jpg` and uses it for all tracks' `thumbnailPath` in the registry)
  - `download:cancel` — Kill an active `yt-dlp` process by download ID
  - `download:progress` — Main-to-renderer push channel for progress/status updates
  - After each download completes, registers the track to the centralized `downloaded-tracks.json` registry in the app config directory
- **`ipc/download-queue.ts`** — Download queue persistence (saves to `app.getPath('userData')/download-queue.json`):
  - `download-queue:save` — Persist the download queue array to disk
  - `download-queue:load` — Load the persisted download queue from disk
- **`ipc/stream-cache.ts`** — Pre-caching system for smooth streaming. Temporarily downloads the next 3 tracks in the queue to `app.getPath('userData')/stream-cache/`:
  - `stream-cache:getPath` — Returns cached file path for a videoId (or null)
  - `stream-cache:preCache` — Replaces any stale cache request and downloads its tracks sequentially
  - `stream-cache:cancel` — Cancels pre-caching for specific videoIds; an empty list cancels all active work
  - `stream-cache:clear` — Clears the entire cache directory
  - Uses lightweight yt-dlp args (`--audio-quality 64K`, no metadata/thumbnails) for fast caching
  - Cache is cleared on app launch (crash recovery) and app quit (cleanup)
- **`ipc/library.ts`** — Library management using a centralized `downloaded-tracks.json` registry in `app.getPath('userData')`:
  - `library:getTracks` — Return all downloaded tracks from the registry (only those with files still on disk)
  - `library:getContainers` — Group downloaded tracks by container (artist/album/playlist/single)
  - `library:getContainerTracks` — Get tracks for a specific container
  - `library:deleteTrack` — Delete MP3, sidecar JSON, thumbnail JPG, and remove from registry
  - `library:deleteContainer` — Delete container directory and remove tracks from registry
  - Exports `addToRegistry()` used by download.ts to register completed downloads
- **`ipc/settings.ts`** — App settings persistence (saves to `app.getPath('userData')/settings.json`):
  - `settings:get` — Load all app settings
  - `settings:save` — Persist app settings
  - Exports `getGroqApiKey()` used by music.ts to access the Groq API key for lyrics title cleaning
- **`ipc/data-usage.ts`** — Bandwidth consumption tracker (saves to `app.getPath('userData')/data-usage.json`):
  - `data-usage:get` — Return `DataUsageStats` (totalBytes, streamingBytes, cacheBytes, downloadBytes, tracksPlayedCount, sessionBytes, lastResetDate, today, thisWeek, thisMonth, dailyHistory)
  - `data-usage:record` — Record bandwidth consumption bytes for live streams, pre-caches, downloads, or track play counts into daily history logs
  - `data-usage:reset` — Reset all data usage metrics and daily history logs back to zero
- **`ipc/ytdlp.ts`** — yt-dlp binary management and update engine:
  - `ytdlp:getVersion` — Detect current installed version
  - `ytdlp:checkUpdate` — Check latest GitHub release tag and environment install method (`pip`, `pipx`, `homebrew`, `standalone`)
  - `ytdlp:update` — Multi-tier fallback updater executing pip/pipx/homebrew/native updates sequentially
- **`ipc/update.ts`** — App auto-update system via GitHub Releases:
  - `update:check` — Check GitHub releases for a newer version than the current app version
  - `update:getVersion` — Return the current app version from `app.getVersion()`
  - `update:download` — Download the distro-appropriate platform asset to `tmpdir()/hyro-updates/` and install it
  - Pushes `update:available` events to all renderer windows when a new release is detected
  - Pushes `update:download-progress` events during asset download
  - Periodically checks for updates every hour (initial check after 30 seconds)
  - Platform-specific asset matching: `.deb` (Debian/Ubuntu family) / `.rpm` (Fedora/RHEL/openSUSE family) with arch filtering (`amd64`/`arm64` for deb, `x86_64`/`aarch64` for rpm) on Linux — AppImage is never auto-downloaded (manual runs only), `.dmg` (macOS), `.exe` (Windows). Linux distro is detected via `/etc/os-release` (`ID` + `ID_LIKE` + fallback probe of `apt`/`dpkg`/`dnf`/`yum`/`zypper`/`rpm`)
  - Linux install flow: downloads native package to `tmpdir()/hyro-updates/`, then installs via `pkexec` (graphical sudo password prompt) — `apt install -y`/`dpkg -i + apt-get install -f -y` for `.deb`, `dnf`/`yum`/`zypper`/`rpm -Uvh` for `.rpm` — cleans the temp directory and restarts the app via a detached `hyro-restart.sh` helper; if `pkexec` is unavailable falls back to `shell.openPath()` (system package handler); if no matching native asset exists opens the releases page
  - Exports `registerUpdateIPC()` and `stopUpdateChecks()` for lifecycle management

### Preload (`src/preload/`)

- **`index.ts`** — Uses `contextBridge.exposeInMainWorld` to expose a safe `window.api` object with typed methods that proxy to IPC channels. Also exposes `window.electron` (from `@electron-toolkit/preload`). Context isolation is enabled; `nodeIntegration` is disabled. Includes stream cache methods: `getStreamCachePath`, `preCacheTracks`, `cancelPreCache`. Includes settings methods: `getSettings`, `saveSettings`.

### Renderer (`src/renderer/`)

- **`index.html`** — Minimal HTML shell with a `#root` div.
- **`src/main.tsx`** — React entry. Wraps the app in `<React.StrictMode>` and `<PlayerProvider>`.
- **`src/App.tsx`** — Root component. Manages view routing (`home`, `search`, `queue`, `album`, `playlist`, `artist`, `library`, `libraryContainer`, `downloads`, `history`, `favorites`, `settings`) via simple `useState`. Wraps content in `<NavigationProvider>`. Layout: `Sidebar | MainContent | Player`. Enforces `flex-1 flex flex-col min-h-0 overflow-hidden` container layout for view pages.
- **`src/context/PlayerContext.tsx`** — Central state management via React Context. Manages: current track, queue, shuffle state, repeat state (off, all, one), volume, playback progress. Handles audio source resolution with fallback chain: local filePath -> pre-cached file -> live stream URL. Refreshes the local cache for the moving next-three-track queue window as playback advances. Automatically fetches and appends 10 same-genre recommended tracks via `getUpNexts` (powered by youtubei.js InnerTube automix radio and related recommendations) immediately when a single track is played, and continuously appends more 10s of recommended tracks as playback progresses (when remaining queue tracks <= 3 or when queue is exhausted) to ensure infinite seamless playback. Exposes actions: `playTrack`, `togglePlay`, `nextTrack`, `prevTrack`, `stop`, `toggleShuffle`, `toggleRepeat`, `setVolume`, `toggleMute`, `seek`, `removeFromQueue`, `clearQueue`, `rearrangeQueue`, `addToQueue`, `playNext`.
- **`src/context/DownloadContext.tsx`** — Download state management via React Context. Manages: download queue, progress tracking, downloaded video IDs. Persists the download queue to disk (via `download-queue:save`/`load` IPC) with debounced saves. Restores interrupted downloads on mount. Exposes actions: `downloadTrack`, `downloadAlbum`, `downloadPlaylist`, `cancelDownload`, `retryDownload`, `dismissCompleted`, `dismissDownload`, `refreshDownloaded`, `isDownloaded`, `allDownloaded`, `someDownloaded`, `isDownloading`, `getProgress`.
- **`src/context/NavigationContext.tsx`** — Navigation context that exposes `navigateTo(type, id?)` to any component in the tree without prop drilling. Used by TrackList, Player, Queue, AlbumDetail, PlaylistDetail, ContainerDetail to make artist names navigable.
- **`src/components/Sidebar/`** — Navigation sidebar with Home, Search, Queue (with real-time remaining track counter badge), Library, Downloads, History, Favorites links, a dedicated scrollable Followed Artists section (showing circular profile images, realtime track count badges, and names with one-click navigation to the artist profile), and a Settings button at the bottom.
- **`src/components/Home/`** — Home feed display. Uses fixed header (`shrink-0 bg-background/95 backdrop-blur-md z-20 border-b border-border/10`) and scrollable body. Fetches sections from `window.api.getHomeSections()` and renders them as horizontal scrollable card rows (including track, album, playlist, and artist cards with quick `+` follow support). Artist names are double-clickable to navigate to artist profile.
- **`src/components/Search/`** — Search interface with fixed header search bar and scrollable body results. Features autocomplete suggestions, category results (songs, artists, albums, playlists), and interactive right-click context menu with options to Go to Artist, Go to Album, Go to Playlist, Play, Add to Queue, Save to Favorites, and Download. Artist results and artist names are double-clickable to navigate to artist profile, and feature a quick `+` follow button (`FavoriteButton`).
- **`src/components/Queue/`** — Queue view with fixed header (title, count badge, keyword filter input, clear queue button) and scrollable body tracks. Shows "Now Playing" and "Up Next" tracks with drag-and-drop reordering, up/down buttons (`rearrangeQueue`), track removal (`removeFromQueue`), and click-to-play. Artist names are double-clickable to navigate to artist profile.
- **`src/components/TrackList/`** — Reusable track list component for displaying rows of tracks with thumbnails, names, artists, and durations. Includes an "Add to Queue" button (`addToQueue`), favorite button, and download controls. Artist names are double-clickable to navigate to artist profile.
- **`src/components/Player/`** — Floating glassmorphic bottom player bar with track info, playback controls, progress bar, volume, and lyrics panel. Also supports a Spotify-inspired Full Screen overlay view displaying high-quality blurred backdrops, large cover art, large synchronized scrolling lyrics, dedicated large playback controls, and a bold watermark backdrop of the ASCII project logo. Artist name is double-clickable to navigate to artist profile.
- **`src/components/ArtistDetail/`** — Artist profile page with fixed header (hero, subscriber count, follow button, play all, tab buttons, in-page search input) and scrollable body content. Shows top songs (via TrackList) and albums/singles (card grid). Tab toggle between songs, albums, and singles. Album/singles cards double-click to navigate to album detail.
- **`src/components/AlbumDetail/`** — Album detail page with fixed header (album hero & action buttons) and scrollable tracklist body. Artist name in hero is double-clickable to navigate to artist profile.
- **`src/components/PlaylistDetail/`** — Playlist detail page with fixed header (playlist hero & action buttons) and scrollable tracklist body. Artist name in hero is double-clickable to navigate to artist profile.
- **`src/components/Library/`** — Library view with fixed header and scrollable body showing downloaded content organized by containers (albums, playlists). ContainerDetail shows individual tracks with play/delete controls and fixed header hero. Artist names in track rows are double-clickable to navigate to artist profile.
- **`src/components/Downloads/DownloadPopup.tsx`** — Download status dropdown integrated with the TitleBar download progress indicator button. Only opens when clicking the title bar progress button during active downloads, and automatically disappears when no active downloads exist.
- **`src/components/Downloads/Downloads.tsx`** — Dedicated Downloads screen view with fixed header (stats summary & clear/cancel buttons) and scrollable body displaying the complete persistent download queue (active, completed, cancelled, interrupted items). Supports retrying items, canceling active downloads, and clearing rows.
- **`src/components/Settings/Settings.tsx`** — Settings page with fixed header and scrollable body cards for Groq API key input, Data Usage tracking modal, and App Updates section (version display, check button, install controls). Persists settings to disk via `settings:save` IPC.
- **`src/components/TitleBar/TitleBar.tsx`** — Custom window title bar component containing spinning app icon, title metadata details, update notification badge (green pulsing dot with version), and custom minimize, maximize, and close controls to support unified dark styling.
- **`src/styles/globals.css`** — Tailwind CSS v4 imports + Spotify-dark theme via CSS custom properties (e.g., `--color-primary: #1db954`, `--color-background: #0a0a0a`). Minimal custom utilities for scrollbar, Electron drag regions, and animations.
- **`src/components/ui/`** — shadcn/ui base components (button, input, card, slider, skeleton, badge, scroll-area, separator). Installed via `npx shadcn@latest add`.
- **`src/lib/utils.ts`** — `cn()` helper (clsx + tailwind-merge).
- **`components.json`** — shadcn/ui configuration (New York style, zinc base, Lucide icons).
- **`src/types/electron.d.ts`** — TypeScript declaration for `window.api` (the `ElectronAPI` interface).

### Shared (`src/shared/`)

- **`types.ts`** — TypeScript interfaces shared between main and renderer: `Track`, `Album`, `Playlist`, `Artist`, `HomeSection`, `SearchResults`, `PlayerState`, `ViewType`, `Thumbnail`, `ArtistBasic`, `AlbumBasic` (featuring multiple-artist properties for track/album/playlist entities).
- **`utils.ts`** — Thumbnail utility functions: `bestThumbnail()` (picks highest-resolution thumbnail with defensive fallback when dimensions are missing or 0), `bestThumbnailUrl()` (wraps bestThumbnail + highResUrl), `getTrackThumbnailUrl()` (prefers local `thumbnailPath` for downloaded tracks, falls back to `bestThumbnailUrl`), `highResUrl()` (upgrades YouTube/Google thumbnail URLs (`=w\d+-h\d+` or `=s\d+`) to high-resolution square cover art `=w1200-h1200` without corrupting compound URL parameters).
- **`asciiLogo.ts`** — Holds the escaped preformatted ASCII art representation of the project logo used for screen branding headers and backdrops.

## Key Configuration Files

| File | Purpose |
|---|---|
| `package.json` | Project metadata, dependencies, npm scripts |
| `electron.vite.config.ts` | Build config for main, preload, and renderer (separate Rollup entries, React plugin for renderer) |
| `tsconfig.json` | Root TS config; references `tsconfig.node.json` and `tsconfig.web.json` |
| `tsconfig.node.json` | TS config for main + preload + shared (Node types, ESNext target) |
| `tsconfig.web.json` | TS config for renderer + shared (DOM + React JSX, path alias `@/` → `src/renderer/src/`) |

## Build and Development Commands

```bash
# Development (starts electron-vite dev server + Electron)
npm run dev

# Production build
npm run build

# Preview the production build
npm run preview
npm run start   # alias for preview

# Type checking (both main/preload and renderer)
npm run typecheck

# Individual type checks
npm run typecheck:node   # main + preload + shared
npm run typecheck:web    # renderer + shared
```

There are **no test commands** configured.

## Agent Workflow Rules

1. **Documentation first**: Before touching any code, use `FetchURL` or `WebSearch` to read the relevant docs from the table above. Especially important for `youtubei.js` (InnerTube), `ytmusic-api`, `yt-dlp`, `electron-vite`, and Electron IPC APIs.
2. **Check existing code**: Use `Read`, `Grep`, and `Glob` to understand the current implementation before making changes. Never assume what a file contains.
3. **Minimal changes**: Fix the specific issue or implement the specific feature requested. Do not refactor surrounding code, reformat files, or make unrelated improvements.
4. **Verify after changes**: Run `npm run typecheck` after any TypeScript changes and `npm run build` after significant modifications. Report build/type errors to the user.
5. **Post-implementation documentation check**: After every implementation or fix, verify the approach against the official package documentation. Confirm that the APIs, method signatures, return types, and usage patterns used in the code match what the documentation specifies. If the docs describe a different or better approach, adopt it. This prevents subtle bugs from incorrect assumptions about library behavior.
6. **Never guess APIs**: If unsure about a library's method signature, return type, or behavior — read its docs. The `ytmusic-api` types are particularly tricky because many properties are optional or differently named than expected.
7. **Prevent Credential Leaks**: Review all code changes before saving or proposing them to ensure no credentials, secrets, API keys, or personal access tokens are leaked, hardcoded, or accidentally committed.
8. **Update documentation**: After any change to the project — new files, removed files, renamed files, new dependencies, changed scripts, updated architecture, modified IPC channels, or altered conventions — you MUST update this `AGENTS.md` to reflect the current state. Keep the documentation accurate and complete at all times. Also update the `README.md` file if the notable changes made are worth including in the project's user-facing document.

## Code Style and Conventions

- **TypeScript strict mode** is enabled across all tsconfig files.
- **React functional components** with hooks exclusively — no class components.
- **State management** uses React Context (`PlayerContext`); no external state library.
- **IPC pattern**: Main process registers handlers with `ipcMain.handle()`; preload exposes typed methods via `contextBridge`; renderer calls `window.api.methodName()`.
- **CSS**: Tailwind CSS v4 with shadcn/ui design tokens. Theme defined via CSS custom properties in `globals.css`. Use `cn()` utility for conditional class merging. shadcn components live in `components/ui/`.
- **Component structure**: Each component lives in its own folder (e.g., `components/Player/Player.tsx`).
- **File naming**: PascalCase for React components, camelCase for utilities.
- **Icons**: Lucide React (`lucide-react`) for all UI icons (Home, Search, Play, Pause, etc.).
- **No linter or formatter** is configured (biome is in `node_modules` as a transitive dependency but has no project config).

## Project-Specific Notes

- **External tool dependency**: The app requires `yt-dlp` to be installed on the system PATH for audio streaming to work. The main process shells out to it via `child_process.execFile`.
- **`ytmusic-api` initialization**: The YouTube Music API is initialized in the background (non-blocking) as a fallback. InnerTube (`youtubei.js`) initializes lazily on first use via `getInnertube()`. If InnerTube fails, the fallback automatically uses `ytmusic-api`.
- **No `.gitignore`**: The `out/`, `node_modules/`, and the two stray `*-player-script.js` files in the project root (which are minified YouTube player scripts, likely debug artifacts) are not currently gitignored.
- **Window config**: 1200×800 default size, 900×600 minimum, `titleBarStyle: 'hiddenInset'` (macOS-style hidden title bar), `autoHideMenuBar: true`, dark background (`#0a0a0a`).
- **Security**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`. External links open in the system browser. A custom `media://` protocol (registered via `protocol.registerSchemesAsPrivileged` + `protocol.handle`) serves local files (downloaded tracks, pre-cached streams, thumbnails) to the renderer securely — the `file://` protocol is blocked by Chromium's cross-origin security model.
- **Path alias**: `@/` resolves to `src/renderer/src/` in the renderer tsconfig and Vite config.
- **Stream URL resolution**: The app uses `youtubei.js` (InnerTube) as the primary method for resolving streamable audio URLs. The library handles cipher deobfuscation, PoToken generation, and n-parameter transformation natively. If InnerTube fails, the app falls back to `yt-dlp` CLI (via `child_process.execFile`). Previous attempts to use `ytdl-core`, `@distube/ytdl-core`, and `play-dl` failed because YouTube's player obfuscation broke their decoders. The InnerTube integration provides direct access to YouTube's internal API with automatic client fallback (ANDROID_VR → IOS → ANDROID → TV → WEB).
- **Download queue persistence**: The download queue is persisted to `app.getPath('userData')/download-queue.json` (e.g. `~/.config/hyro/download-queue.json` on Linux, `~/Library/Application Support/hyro/download-queue.json` on macOS). Interrupted downloads (in-progress when the app closed) are restored with an `interrupted` status and can be retried from the download popup.
- **Downloaded tracks registry & physical file verification**: Completed downloads are registered to a centralized `downloaded-tracks.json` in `app.getPath('userData')`. The library reads from this registry instead of scanning the filesystem. Each entry contains the full track metadata including `filePath` (absolute path to the local MP3). When calling `library:getTracks`, the main process verifies that the local MP3 files physically exist on disk; if any registered tracks are missing (e.g. manually deleted outside the app), they are automatically and permanently purged from the registry. Additionally, the React frontend listens to window focus events and component deletions to instantly refresh the cached downloaded track list state.
- **Metadata JSON sidecars**: Track metadata JSON files are stored in the application's configuration directory under `app.getPath('userData')/metadata/` using the same folder structure and naming convention as the track downloads.
- **Track cover art storage rules**: During downloads, cover art (.jpg) is preserved ONLY for tracks that belong to an album or playlist (to support local container art). For single tracks, the cover art JPG file is deleted from the download folder after embedding, and the app displays the cover art by falling back to the YouTube Music online thumbnail URL.
- **Stream pre-caching**: The player maintains the next track in the queue in `app.getPath('userData')/stream-cache/` for smooth playback, refreshing the cache whenever playback advances. Uses lightweight yt-dlp args (64K quality, no metadata) for fast caching with default client selection. Cache is cleared on app launch (crash recovery) and app quit (cleanup). Audio source resolution follows a fallback chain: local filePath → pre-cached file → live stream URL. Local and cached files are served via the custom `media://` protocol (e.g. `media://local/path/to/file.mp3`) which uses `net.fetch` + `pathToFileURL` in the main process handler. A selected track must emit `playing` within 10 seconds; otherwise it is skipped, as are source-resolution and media failures.
- **Lyrics title cleaning**: Before querying LRCLIB for synced lyrics, track/artist titles are cleaned to strip YouTube suffixes like "(Official Video)", "4K", "[Official Music Video]" etc. that cause LRCLIB lookups to fail. When a Groq API key is configured (via the Settings page), the app calls the Groq chat completions API (`llama-3.3-70b-versatile`) with a structured prompt to extract clean song/artist names. Without an API key, a built-in regex-based cleaner handles common cases. Settings are persisted to `app.getPath('userData')/settings.json`.
- **LRCLIB lyrics matching**: The app uses LRCLIB's `/api/search` endpoint (returns an array of candidates) rather than `/api/get` (single result). Each result is scored by: synced-lyric availability (+100), duration proximity to the track's duration (+50 for near-exact, +35 for within 10s, +15 for within 30s), and album name match (+10). The highest-scoring result is selected. This ensures the best matched lyrics are chosen when multiple versions exist (e.g. radio edit vs album version). The full keyword list for title cleaning is maintained in `src/shared/video-keywords.ts`.
- **Video keyword filtering**: Search and home feed results are filtered to exclude tracks whose titles contain video-related keywords (e.g. "Official Music Video", "Lyric Video", "Live Performance", "Behind the Scenes"). The comprehensive keyword list lives in `src/shared/video-keywords.ts` (~150 keywords across English, French, Spanish, German, Italian, Portuguese, Japanese, and Korean). Filtering is applied in `ipc/music.ts` for the `music:search` and `music:getHomeSections` handlers.
- **OS Fullscreen Support**: The player triggers native OS-level device fullscreen for the application window (`setFullScreen` via IPC in the main process). Main-to-renderer window listeners (`enter-full-screen` and `leave-full-screen`) ensure the React overlay UI stays perfectly in sync with the hardware/OS window states.
- **Play History Tracking**: The `HistoryProvider` context listens to `currentTrack` changes from `PlayerContext` and automatically records plays through the `addHistory` IPC interface. This ensures that manually clicked tracks and automatically advanced tracks are both correctly logged, sorted, and refreshed in real-time on the history screen.
- **Play History Search**: The history view provides a real-time search interface. Toggling the Search button displays an input field that filters history entries by song title, artist, or album matching keywords in real-time, adapting empty state messaging, selection operations, and play queues to the active filtered set.
- **View Navigation Back-stack**: The application maintains a navigation history stack state (`navHistory`) in `App.tsx`. When navigating to new views, we push the route step to the stack (skipping duplicate consecutive navigation actions). When the user clicks the "Go Back" button in a detail component (Album, Playlist, Artist, or Container detail views), it pops the current view and restores the previous view and metadata state, enabling proper user backtracking.
- **Recent Searches Dropdown**: The search page logs completed queries to persistent storage (`localStorage`) and presents them as a "Recent Searches" dropdown whenever the search field is focused (while empty). The list layout is set to a max-height fitting exactly 5 items, making additional historical entries scrollable, and supports clear-all buttons or removing specific elements individually.
- **App Icon & Brand Mark**: The app's visual identity is a bespoke “H + Waveform” mark — two white pill-shaped stems (the H) fused by a vivid green (`#1DB954`) live waveform with a central node, set on a charcoal squircle (`#0A0A0A`, `rx≈232`) with subtle gloss and depth. The master vector lives at `resources/icon.svg` and is rasterized via `rsvg-convert` to `1024` down to `16`. The build produces `resources/icon.png` (1024², primary), `resources/icon.ico` (Win: 16–256, 7 layers), `resources/icon.icns` (macOS: 16–1024 with @2x), `resources/icons/` & `build/icons/` hicolor sets (16/32/48/64/128/256/512/1024), plus `src/renderer/public/icon.png|favicon*.png|favicon.ico` and `src/renderer/src/assets/icon-*.png` for in-app use. `package.json` `build` maps `linux→build/icons` (a hicolor directory of `16x16`→`1024x1024` PNGs, so the installed `.deb`/`.rpm` ships a complete hicolor theme), `win→resources/icon.ico`, `mac→resources/icon.icns` and declares `extraResources` for `icon.png|ico|icns` so `src/main/index.ts#getIconPath()` can resolve per-platform (`icon.ico` on Win, `icon.icns` on macOS, `icon.png` on Linux). `getIconPath()` returns the first candidate that physically exists on disk (window, tray, and dock never receive a broken path) and logs a warning if none are found. Linux also sets the top-level `desktopName: "hyro.desktop"` plus `linux.syncDesktopName: true`, so the installed `.desktop` uses `StartupWMClass=hyro` matching Electron's app_id/WM_CLASS and desktop environments link running windows to the launcher entry. `createTray()` sizes the tray icon to 16px (Win/Linux) or 22px (macOS). On macOS the dock icon is explicitly set via `app.dock.setIcon(nativeImage.createFromPath(getIconPath()))` and `appId`/`setAppUserModelId` is `com.hyro.music` so the icon appears correctly in the Linux app grid/dock/desktop (`.deb`/`.AppImage` hicolor + `.desktop` `Icon`), Windows Start menu/Taskbar/Explorer/Alt-Tab (embedded ICO), and macOS Dock/Launchpad/Finder/⌘-Tab (ICNS + `app.dock`). The renderer header (`TitleBar`) and sidebar (`Sidebar`) both render the mark as `<img src="/icon.png">` (20px title bar squircle, 48px sidebar hero) alongside the wordmark, with favicon links in `src/renderer/index.html` and asset copies for Vite.
- **Custom Frameless Title Bar**: The application is configured as a frameless Electron window (`frame: false` in `src/main/index.ts`). A custom React `<TitleBar />` component is rendered at the absolute top of the viewport. It displays the brand app icon (20px squircle), app title, current playing track metadata, and provides custom buttons to minimize, maximize/unmaximize, and close the window, mapped through custom IPC channels. The title bar automatically hides when in native OS fullscreen mode. Additionally, when downloads are active, it shows a circular progress indicator displaying the average percentage completion of active tasks; clicking this circle toggles open the main downloads list popup.
- **ASCII Project Logo**: The application features a custom preformatted ASCII text representation of the project logo (`HYRO`) as the main branding. It is displayed centered beneath the brand icon at the top of the Sidebar navigation, highlighted with subtle emerald neon drop-shadows, styled in the custom TitleBar header, and showcased as a bold watermark backdrop inside the Player's fullscreen Now Playing view.
- **Volume Persistence**: The application automatically persists the playback volume percentage across new launches. The volume value is loaded on application startup from `settings.json` and dynamically updated with a 500ms debounce whenever the user adjusts the volume slider in the player controls.
- **InnerTube Integration**: The app uses `youtubei.js` as the primary InnerTube API client for all YouTube Music operations (search, home feed, album/playlist/artist details, up-next recommendations, stream URLs, and lyrics). The library is initialized lazily on first use via `getInnertube()` and cached as a singleton. To prevent Node `undici` socket errors (`ETIMEDOUT` / `connect ENETUNREACH`) caused by unreachable IPv6 routes during initialization and requests, `dns.setDefaultResultOrder('ipv4first')` is applied globally and inside `getInnertube()`. If InnerTube fails (network error, YouTube API changes, etc.), the app automatically falls back to `ytmusic-api` for metadata and `yt-dlp` for stream URLs. Stream URL resolution specifically uses a multi-client format selection chain (`ANDROID_VR` → `IOS` → `ANDROID` → `TV` → `WEB` via `getBasicInfo` and `chooseFormat({ type: 'audio', quality: 'best' })`) to obtain direct pre-deciphered audio URLs (`200 OK`) without triggering `403 Forbidden` checks or JavaScript signature evaluation errors (`PlayerError: No valid URL to decipher`). The `resetInnertube(force)` function safely resets the instance and deduplicates resets while an initialization is in flight, and `withInnertubeRetry` applies a short backoff before retrying to ensure clean session recovery. Type mappers in `src/main/innertube/helpers.ts` convert youtubei.js response objects (`MusicResponsiveListItem`, `MusicTwoRowItem`, `MusicMultiRowListItem`, `MusicCardShelf`) to Hyro's shared types, with universal search results extraction traversing both built-in shelves (`search.songs`, etc.) and raw `search.contents` (`MusicCardShelf` Top Result cards and `ItemSection` node lists) to guarantee accurate search results across all query types. Additionally, `mapArtistDetail` operates asynchronously to fetch the artist's full discography by calling `artistResponse.getAllSongs()` for complete tracklists and calling `more_content.endpoint.call(yt.actions, { client: 'YTMUSIC', parse: true })` on shelf headers to expand full lists of albums and singles under their respective tabs.
- **Auto-Update System**: The app checks GitHub Releases (`sthashixi-netwanderer/hyro`) for newer versions. The main process pushes `update:available` events to the renderer when a newer release is detected. The TitleBar shows a green pulsing notification badge with the new version; clicking it reveals a dropdown with release notes, an Install Update button, and a View Release link. The Settings page has an "App Updates" section showing the current version, a check button, and install controls. Updates are downloaded to `tmpdir()/hyro-updates/` via Electron's `net` module with progress via `update:download-progress`. On Linux the updater detects the distro from `/etc/os-release` and downloads the native package (`.deb` for Debian/Ubuntu/Mint/Pop etc. with `amd64`/`arm64` arch filtering, `.rpm` for Fedora/RHEL/openSUSE with `x86_64`/`aarch64` filtering) — AppImage is never auto-downloaded and remains manual-only. After download the Linux flow invokes `pkexec` to show the system sudo password dialog and installs via `apt`/`dpkg` (deb) or `dnf`/`yum`/`zypper`/`rpm` (rpm), cleans the temp dir, and restarts via a detached `hyro-restart.sh`; if `pkexec` is missing it falls back to `shell.openPath()` and if no native asset exists it opens the releases page. macOS (`.dmg`) and Windows (`.exe`) flows are unchanged. Periodic background checks run every hour (initial check after 30 seconds).

## Versioning Conventions

This project uses **Semantic Versioning (semver)** for all app releases. When preparing a release, follow these guidelines:

| Version Bump | When to Use | Example |
|---|---|---|
| **Major** (`X.0.0`) | Breaking changes, complete UI redesigns, migration to new platform, removal of features | `1.0.0` → `2.0.0` |
| **Minor** (`x.Y.0`) | New features, new IPC channels, new UI sections, significant enhancements | `1.2.0` → `1.3.0` |
| **Patch** (`x.y.Z`) | Bug fixes, dependency updates, performance improvements, documentation updates | `1.3.0` → `1.3.1` |

### Release Naming Convention

When creating a GitHub Release, use the format: `v{major}.{minor}.{patch}` (e.g., `v1.3.0`).

### When to Release

- **Patch release**: After fixing bugs, updating yt-dlp compatibility, fixing download issues, or improving stream URL resolution.
- **Minor release**: After adding new features (e.g., lyrics, data usage tracking, auto-updates), new UI sections, or significant improvements to existing features.
- **Major release**: Only for fundamental changes that alter how users interact with the app or break backward compatibility.

### Platform Assets

Each release should include platform-specific build artifacts:
- **Linux**: `Hyro-{version}.AppImage`
- **macOS**: `Hyro-{version}.dmg`
- **Windows**: `Hyro-{version}-x64.exe` or `Hyro-{version}-arm64.exe`

The auto-update system matches assets by filename pattern to find the correct download for the user's platform.
