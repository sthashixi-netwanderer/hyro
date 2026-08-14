# Playlist Marker & Move Feature — Design Spec

## Overview

Add a persistent visual indicator on track rows wherever a track belongs to one or more user playlists. Clicking the indicator opens a dropdown that shows which playlists contain the track and allows the user to move it to a different playlist.

## Requirements

1. **Playlist membership indicator**: A `ListMusic` icon appears on any track row that is in ≥1 user playlist. Always visible (not hover-gated).
2. **Click interaction**: Clicking the icon opens a dropdown with two sections:
   - **"In these playlists"** — lists every playlist currently containing the track (informational, with checkmarks)
   - **"Move to"** — lists all playlists that do NOT contain the track; clicking one moves the track there
3. **Move semantics**: Moving a track removes it from all current playlists and adds it to the target playlist.
4. **New playlist option**: The dropdown includes a "New Playlist" action that creates a playlist, adds the track, and removes it from old playlists.
5. **Scope**: The indicator appears on all track rows — TrackList (queue, album, playlist, library), Search results, and any other view using TrackList or equivalent track rendering.

## Architecture

### New Component: `PlaylistMarker`

**File**: `src/renderer/src/components/ui/PlaylistMarker.tsx`

A self-contained component that:
- Receives a `Track` prop
- Reads `playlists` and `videoIdsInPlaylists` from `PlaylistsContext`
- Renders nothing if the track is not in any playlist
- Renders a green `ListMusic` icon (Lucide) that opens a `DropdownMenu`
- The dropdown partitions playlists into "current" (contains track) and "available" (does not contain track)
- On selecting an available playlist: calls `moveTrackToPlaylist(track, currentPlaylistIds, targetPlaylistId)`
- Includes a "New Playlist" option at the bottom

### Context Enhancement: `PlaylistsContext`

**File**: `src/renderer/src/context/PlaylistsContext.tsx`

Add two new members:

1. **`videoIdsInPlaylists: Set<string>`** — A memoized `Set` derived from the `playlists` array. Contains every `videoId` that appears in at least one playlist. Used by `PlaylistMarker` for O(1) membership checks.

2. **`moveTrackToPlaylist(track: Track, fromPlaylistIds: string[], toPlaylistId: string): Promise<void>`** — Performs the move operation:
   - Calls `removeTrackFromPlaylist(fromPlaylistId, track.videoId)` for each `fromPlaylistId`
   - Calls `addTrackToPlaylist(toPlaylistId, track)`
   - The context's existing `setPlaylists` updates propagate automatically

### Integration Points

| File | Change |
|---|---|
| `src/renderer/src/components/TrackList/TrackList.tsx` | Import and render `<PlaylistMarker track={track} />` before the existing `AddToPlaylistDropdown` |
| `src/renderer/src/components/Search/Search.tsx` | Import and render `<PlaylistMarker track={track} />` in song result rows, before `AddToPlaylistDropdown` |
| `src/renderer/src/components/Queue/Queue.tsx` | Import and render `<PlaylistMarker track={track} />` in the hover actions `div` (the `hidden group-hover:flex` area), alongside the existing move up/down/remove buttons. Queue renders tracks directly (not via TrackList). |

## UI Layout

### Track Row (with marker)

```
  ▶  Song Name            Artist Name   ♫  3:45   [playlist] [+]
                              └─ always visible ─┘   └─ hover only ─┘
```

- `PlaylistMarker` sits between duration and the existing `+` (AddToPlaylist) button
- Always visible (no opacity transition), green `ListMusic` icon
- The `+` button remains for adding to playlists / liked songs

### Dropdown Layout

```
┌─────────────────────────────┐
│ In these playlists          │  ← section header (muted text)
│   🖼 Playlist A         ✓  │  ← checkmark = current
│   🖼 Playlist B         ✓  │
├─────────────────────────────┤
│ Move to                     │  ← section header (muted text)
│   🖼 Playlist C             │  ← click = move here
│   🖼 Playlist D             │
│   ─────────────────────     │
│   ➕ New Playlist            │
└─────────────────────────────┘
```

- Dropdown opens with `side="top"` and `align="start"` (consistent with existing `AddToPlaylistDropdown`)
- Max height with overflow scroll for many playlists
- Section headers use `text-xs text-muted-foreground` styling
- Playlist rows match existing `AddToPlaylistDropdown` row styling (thumbnail, name, indicator)

## Data Flow

1. `PlaylistsContext` loads playlists on mount → computes `videoIdsInPlaylists` Set
2. Every `PlaylistMarker` checks `videoIdsInPlaylists.has(track.videoId)` → renders icon or nothing
3. On click, dropdown reads `playlists` array → partitions into current vs available
4. On move: `moveTrackToPlaylist()` → IPC calls → context state updates → all `PlaylistMarker` instances re-render with new membership

## Edge Cases

- **Track in multiple playlists**: The "In these playlists" section lists all of them. Moving removes from ALL current playlists.
- **Track in only one playlist**: "In these playlists" shows one entry. "Move to" shows all other playlists.
- **No playlists exist**: `PlaylistMarker` renders nothing (no playlists to show).
- **Track not in any playlist**: `PlaylistMarker` renders nothing.
- **Playlist deleted while dropdown open**: The dropdown closes on outside click; stale state is handled by context refresh.

## Files to Create/Modify

| Action | File |
|---|---|
| CREATE | `src/renderer/src/components/ui/PlaylistMarker.tsx` |
| MODIFY | `src/renderer/src/context/PlaylistsContext.tsx` |
| MODIFY | `src/renderer/src/components/TrackList/TrackList.tsx` |
| MODIFY | `src/renderer/src/components/Search/Search.tsx` |
