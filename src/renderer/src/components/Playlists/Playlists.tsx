import { useState } from 'react'
import { usePlaylists } from '../../context/PlaylistsContext'
import type { ViewType } from '../../../../shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, ListMusic, Music, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import PlaylistDialog from '../ui/PlaylistDialog'

interface PlaylistsProps {
  onNavigate: (view: ViewType, id?: string) => void
}

export default function Playlists({ onNavigate }: PlaylistsProps) {
  const { playlists, loading, deletePlaylist } = usePlaylists()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingPlaylist, setEditingPlaylist] = useState<{ id: string; name: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playlistId: string; playlistName: string } | null>(null)

  function handleContextMenu(e: React.MouseEvent, playlistId: string, playlistName: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, playlistId, playlistName })
  }

  function handleDelete(id: string) {
    deletePlaylist(id)
    setContextMenu(null)
  }

  function handleRename(id: string, name: string) {
    setEditingPlaylist({ id, name })
    setContextMenu(null)
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
          <h1 className="text-2xl font-bold">Your Playlists</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your Playlists</h1>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="size-4" />
            New Playlist
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ListMusic className="size-12 mb-4" />
            <p className="text-lg">No playlists yet</p>
            <p className="text-sm mb-4">Create your first playlist to organize your music</p>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="size-4 mr-2" />
              Create Playlist
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {/* Liked Songs as first "playlist" */}
            <Card
              className="bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
              onDoubleClick={() => onNavigate('likedSongs')}
            >
              <CardContent className="p-0">
                <div className="aspect-square bg-gradient-to-br from-primary/30 to-primary/10 rounded-t-xl overflow-hidden flex items-center justify-center">
                  <Music className="size-10 text-primary" />
                </div>
                <div className="px-3 py-3">
                  <p className="text-sm font-medium truncate">Liked Songs</p>
                  <p className="text-xs text-muted-foreground">Your favorite tracks</p>
                </div>
              </CardContent>
            </Card>

            {/* User Playlists */}
            {playlists.map((playlist) => (
              <Card
                key={playlist.id}
                className="bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
                onDoubleClick={() => onNavigate('userPlaylist', playlist.id)}
                onContextMenu={(e) => handleContextMenu(e, playlist.id, playlist.name)}
              >
                <CardContent className="p-0">
                  <div className="aspect-square bg-muted rounded-t-xl overflow-hidden flex items-center justify-center relative">
                    {playlist.thumbnailUrl ? (
                      <img src={playlist.thumbnailUrl} alt={playlist.name} className="w-full h-full object-cover" />
                    ) : (
                      <ListMusic className="size-10 text-muted-foreground" />
                    )}
                    <button
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleContextMenu(e, playlist.id, playlist.name)
                      }}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </div>
                  <div className="px-3 py-3">
                    <p className="text-sm font-medium truncate">{playlist.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {playlist.tracks.length} song{playlist.tracks.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              onClick={() => handleRename(contextMenu.playlistId, contextMenu.playlistName)}
            >
              <Pencil className="size-4" />
              Rename
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left text-destructive"
              onClick={() => handleDelete(contextMenu.playlistId)}
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        </>
      )}

      {/* Create Dialog */}
      <PlaylistDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        mode="create"
      />

      {/* Rename Dialog */}
      {editingPlaylist && (
        <PlaylistDialog
          open={true}
          onOpenChange={(open) => { if (!open) setEditingPlaylist(null) }}
          mode="rename"
          playlistId={editingPlaylist.id}
          initialName={editingPlaylist.name}
        />
      )}
    </div>
  )
}
