import { useState, useEffect } from 'react'
import { usePlaylists } from '../../context/PlaylistsContext'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PlaylistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'rename'
  playlistId?: string
  initialName?: string
  onCreate?: (name: string) => void
}

export default function PlaylistDialog({ open, onOpenChange, mode, playlistId, initialName, onCreate }: PlaylistDialogProps) {
  const { createPlaylist, renamePlaylist } = usePlaylists()
  const [name, setName] = useState(initialName || '')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialName || '')
      setDescription('')
    }
  }, [open, initialName])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (mode === 'create') {
        if (onCreate) {
          onCreate(name.trim())
        } else {
          await createPlaylist(name.trim(), description.trim())
        }
      } else if (mode === 'rename' && playlistId) {
        await renamePlaylist(playlistId, name.trim())
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && name.trim()) {
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Playlist' : 'Rename Playlist'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Give your playlist a name.' : 'Enter a new name for this playlist.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Input
              placeholder="Playlist name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              maxLength={100}
            />
          </div>
          {mode === 'create' && (
            <div className="space-y-2">
              <Input
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={300}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? 'Saving...' : mode === 'create' ? 'Create' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
