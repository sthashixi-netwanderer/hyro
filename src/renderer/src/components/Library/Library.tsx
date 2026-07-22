import { useState, useEffect } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import type { LibraryContainer } from '../../../../shared/types'
import { Card } from '@/components/ui/card'
import { Music, Disc3, ListMusic, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bestThumbnailUrl } from '../../../../shared/utils'

interface LibraryProps {
  onNavigate: (type: 'libraryContainer', id: string) => void
}

function getContainerThumbnail(container: LibraryContainer): string | null {
  if (container.thumbnailPath) {
    return `media://local${container.thumbnailPath}`
  }
  return bestThumbnailUrl(container.thumbnails) || null
}

export default function Library({ onNavigate }: LibraryProps) {
  const [containers, setContainers] = useState<LibraryContainer[]>([])
  const [loading, setLoading] = useState(true)
  const { playTrack } = usePlayer()

  useEffect(() => {
    loadContainers()
  }, [])

  async function loadContainers() {
    try {
      const data = await window.api.getLibraryContainers()
      setContainers(data)
    } catch (err) {
      console.error('Failed to load library:', err)
    } finally {
      setLoading(false)
    }
  }

  function getContainerIcon(type: string) {
    switch (type) {
      case 'album': return <Disc3 className="size-8" />
      case 'playlist': return <ListMusic className="size-8" />
      case 'artist': return <User className="size-8" />
      default: return <Music className="size-8" />
    }
  }

  function handlePlayContainer(container: LibraryContainer) {
    if (container.tracks.length > 0) {
      const tracks = container.tracks.map(t => ({
        videoId: t.videoId,
        name: t.name,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        thumbnails: t.thumbnails,
        type: t.type,
        filePath: t.filePath,
        thumbnailPath: t.thumbnailPath
      }))
      playTrack(tracks[0], tracks)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Library</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="aspect-square bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (containers.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Library</h1>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Music className="size-12 mb-4" />
          <p className="text-lg">No downloaded tracks yet</p>
          <p className="text-sm">Download music from the home, search, or playlist views</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Library</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {containers.map((container) => (
          <Card
            key={container.name}
            className="group aspect-square bg-card hover:bg-accent cursor-pointer overflow-hidden relative"
            onClick={() => onNavigate('libraryContainer', container.name)}
          >
            {/* Cover Art */}
            <div className="w-full h-full flex items-center justify-center">
              {getContainerThumbnail(container) ? (
                <img
                  src={getContainerThumbnail(container)!}
                  alt={container.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />
              ) : (
                <div className="text-muted-foreground">
                  {getContainerIcon(container.type)}
                </div>
              )}
            </div>

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                className="size-12 rounded-full bg-primary flex items-center justify-center hover:scale-105 transition-transform"
                onClick={(e) => {
                  e.stopPropagation()
                  handlePlayContainer(container)
                }}
              >
                <Music className="size-5 text-primary-foreground" />
              </button>
            </div>

            {/* Info */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
              <p className="text-sm font-medium truncate text-white">{container.name}</p>
              <p className="text-xs text-white/70 capitalize">
                {container.type} • {container.trackCount} track{container.trackCount !== 1 ? 's' : ''}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
