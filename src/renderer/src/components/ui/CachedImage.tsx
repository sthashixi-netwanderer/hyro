import React, { useState, useEffect } from 'react'
import { Music } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CachedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null
  alt?: string
  className?: string
  fallbackIcon?: React.ReactNode
}

export default function CachedImage({
  src,
  alt = '',
  className,
  fallbackIcon,
  onError,
  ...props
}: CachedImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)
  const [retryAttempt, setRetryAttempt] = useState(0)

  useEffect(() => {
    setHasError(false)
    setRetryAttempt(0)

    if (!src) {
      setCurrentSrc(null)
      return
    }

    if (src.startsWith('media://') || src.startsWith('data:') || src.startsWith('blob:')) {
      setCurrentSrc(src)
      return
    }

    let isMounted = true
    window.api
      .getCachedImageUrl(src)
      .then((resolved) => {
        if (isMounted) {
          setCurrentSrc(resolved)
        }
      })
      .catch(() => {
        if (isMounted) {
          setCurrentSrc(src)
        }
      })

    return () => {
      isMounted = false
    }
  }, [src])

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (!currentSrc) {
      setHasError(true)
      if (onError) onError(e)
      return
    }

    // Try fallback URLs for Google/YouTube images
    if (retryAttempt === 0) {
      if (currentSrc.includes('=w1200-h1200')) {
        setRetryAttempt(1)
        setCurrentSrc(currentSrc.replace('=w1200-h1200', '=w540-h540'))
        return
      }
      if (currentSrc.includes('ytimg.com/vi/') && currentSrc.includes('/hqdefault.jpg')) {
        setRetryAttempt(1)
        setCurrentSrc(currentSrc.replace('/hqdefault.jpg', '/default.jpg'))
        return
      }
    } else if (retryAttempt === 1) {
      if (currentSrc.includes('=w540-h540')) {
        setRetryAttempt(2)
        setCurrentSrc(currentSrc.replace('=w540-h540', '=s500'))
        return
      }
    }

    setHasError(true)
    if (onError) onError(e)
  }

  if (hasError || !currentSrc) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted/60 text-muted-foreground/50 select-none overflow-hidden',
          className
        )}
      >
        {fallbackIcon || <Music className="size-1/3 opacity-50" />}
      </div>
    )
  }

  return (
    <img
      {...props}
      src={currentSrc}
      alt={alt}
      className={className}
      onError={handleError}
      loading="lazy"
    />
  )
}
