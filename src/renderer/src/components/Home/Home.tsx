import { useEffect, useState } from 'react'
import type { HomeSection, Track, Album, Playlist, ViewType } from '../../../../shared/types'
import { bestThumbnailUrl } from '../../../../shared/utils'
import { usePlayer } from '../../context/PlayerContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import FavoriteButton from '@/components/ui/FavoriteButton'
import { Music, Disc3, ListMusic, RefreshCw, User } from 'lucide-react'

interface HomeProps {
  onNavigate: (type: ViewType, id?: string) => void
}

export default function Home({ onNavigate }: HomeProps) {
  const [sections, setSections] = useState<HomeSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { playTrack } = usePlayer()

  useEffect(() => {
    loadHomeSections()
  }, [])

  async function loadHomeSections() {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.getHomeSections()
      setSections(data)
    } catch (err) {
      setError('Failed to load content. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handlePlayTrack(track: Track, tracks: Track[]) {
    playTrack(track, tracks)
  }

  function getPlaceholderIcon(item: Track | Album | Playlist) {
    if ('videoId' in item) return <Music className="size-8 text-muted-foreground" />
    if ('albumId' in item) return <Disc3 className="size-8 text-muted-foreground" />
    return <ListMusic className="size-8 text-muted-foreground" />
  }

  function renderContentItem(item: Track | Album | Playlist, index: number, tracks: Track[]) {
    if ('videoId' in item) {
      return (
        <Card
          key={`${item.videoId}-${index}`}
          className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
          onClick={() => handlePlayTrack(item, tracks)}
        >
          <CardContent className="p-0 relative">
            <div className="w-[180px] h-[180px] bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
              {bestThumbnailUrl(item.thumbnails) ? (
                <img src={bestThumbnailUrl(item.thumbnails)} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                getPlaceholderIcon(item)
              )}
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <FavoriteButton
                id={item.videoId}
                type="track"
                data={item}
                size="md"
                className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm"
              />
            </div>
            <div className="px-3 py-3">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p
                className="text-xs text-muted-foreground truncate hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.artist?.artistId) onNavigate('artist', item.artist.artistId)
                }}
              >
                {item.artist?.name}
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    if ('albumId' in item) {
      return (
        <Card
          key={`${item.albumId}-${index}`}
          className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
          onDoubleClick={() => onNavigate('album', item.albumId)}
        >
          <CardContent className="p-0 relative">
            <div className="w-[180px] h-[180px] bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
              {bestThumbnailUrl(item.thumbnails) ? (
                <img src={bestThumbnailUrl(item.thumbnails)} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                getPlaceholderIcon(item)
              )}
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <FavoriteButton
                id={item.albumId}
                type="album"
                data={item}
                size="md"
                className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm"
              />
            </div>
            <div className="px-3 py-3">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p
                className="text-xs text-muted-foreground truncate hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.artist?.artistId) onNavigate('artist', item.artist.artistId)
                }}
              >
                {item.artist?.name}
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    if ('playlistId' in item) {
      return (
        <Card
          key={`${item.playlistId}-${index}`}
          className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
          onDoubleClick={() => onNavigate('playlist', item.playlistId)}
        >
          <CardContent className="p-0 relative">
            <div className="w-[180px] h-[180px] bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
              {bestThumbnailUrl(item.thumbnails) ? (
                <img src={bestThumbnailUrl(item.thumbnails)} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                getPlaceholderIcon(item)
              )}
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <FavoriteButton
                id={item.playlistId}
                type="playlist"
                data={item}
                size="md"
                className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm"
              />
            </div>
            <div className="px-3 py-3">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {item.artist?.artistId ? (
                  <span
                    className="hover:underline cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onNavigate('artist', item.artist!.artistId!)
                    }}
                  >
                    {item.artist?.name || 'Playlist'}
                  </span>
                ) : (
                  item.artist?.name || 'Playlist'
                )}
                {item.videoCount != null && ` \u00B7 ${item.videoCount} songs`}
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    if ('artistId' in item && (item as any).type === 'ARTIST') {
      const artistItem = item as any
      return (
        <Card
          key={`${artistItem.artistId}-${index}`}
          className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
          onClick={() => onNavigate('artist', artistItem.artistId)}
        >
          <CardContent className="p-0 relative flex flex-col items-center pt-6 pb-4">
            <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-muted flex items-center justify-center mb-3">
              {bestThumbnailUrl(artistItem.thumbnails) ? (
                <img src={bestThumbnailUrl(artistItem.thumbnails)} alt={artistItem.name} className="w-full h-full object-cover" />
              ) : (
                <User className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <FavoriteButton
                id={artistItem.artistId}
                type="artist"
                data={artistItem}
                size="md"
                className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm"
              />
            </div>
            <p className="text-sm font-medium truncate px-3 text-center">{artistItem.name}</p>
            <p className="text-xs text-muted-foreground">Artist</p>
          </CardContent>
        </Card>
      )
    }

    return null
  }

  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-48 mb-6" />
        {[1, 2, 3].map((section) => (
          <div key={section} className="mb-8">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map((card) => (
                <div key={card} className="shrink-0">
                  <Skeleton className="w-[180px] h-[180px] rounded-xl mb-3" />
                  <Skeleton className="h-4 w-28 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={loadHomeSections}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Good Evening</h2>
      <div>
        {sections.map((section, sIdx) => {
          const tracks = section.contents.filter(
            (item): item is Track => 'videoId' in item
          )
          return (
            <section key={sIdx} className="mb-8">
              <h3 className="text-lg font-bold mb-3">{section.title}</h3>
              <div className="section-scroll">
                {section.contents.map((item, idx) =>
                  renderContentItem(item, idx, tracks)
                )}
              </div>
            </section>
          )
        })}
        {sections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Music className="size-12 mb-4" />
            <p>No content available. Try searching for something!</p>
          </div>
        )}
      </div>
    </div>
  )
}
