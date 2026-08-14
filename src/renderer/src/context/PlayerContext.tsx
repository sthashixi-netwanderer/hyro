import { logger } from '../utils/logger'
import React, { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Track, PlayerState } from '../../../shared/types'

interface AudioOutputDevice {
  deviceId: string
  label: string
  kind: 'audiooutput'
}

interface PlayerContextType extends PlayerState {
  playTrack: (track: Track, queue?: Track[]) => void
  togglePlay: () => void
  nextTrack: () => void
  prevTrack: () => void
  stop: () => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  seek: (time: number) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  rearrangeQueue: (fromIndex: number, toIndex: number) => void
  addToQueue: (track: Track) => void
  playNext: (track: Track) => void
  getAudioElement: () => HTMLAudioElement
  audioOutputDevices: AudioOutputDevice[]
  selectedDeviceId: string | null
  switchAudioOutput: (deviceId: string) => Promise<void>
}

const PlayerContext = createContext<PlayerContextType | null>(null)

export function usePlayer(): PlayerContextType {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(new Audio())
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    queue: [],
    originalQueue: [],
    queueIndex: -1,
    isPlaying: false,
    isShuffled: false,
    repeatMode: 'off',
    volume: 0.8,
    currentTime: 0,
    duration: 0,
    isMuted: false
  })

  // Audio output device state
  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioOutputDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const sinkIdPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previousSinkIdRef = useRef<string | null>(null)

  // Track the cache window so advancing through the queue refreshes the next track.
  const cacheWindowSignatureRef = useRef<string>('')
  const playbackStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveVolumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sourceRequestRef = useRef(0)
  const playbackFailureHandledRef = useRef(false)
  const retryCountRef = useRef(0)
  const currentTrackRef = useRef<Track | null>(null)
  const loadAndPlayTrackRef = useRef<(track: Track) => void>(() => {})
  const downloadedPathsRef = useRef<Map<string, string>>(new Map())
  const seekGuardRef = useRef(false)
  const seekGuardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActuallySeekingRef = useRef(false)
  const fetchingRecommendationsRef = useRef(false)
  const attemptedAnchorsRef = useRef<Set<string>>(new Set())
  const lastPlayTimeRef = useRef(0)
  const accumulatedStreamBytesRef = useRef(0)
  const repeatModeRef = useRef<'off' | 'all' | 'one'>('off')
  const queueRef = useRef<Track[]>([])
  const MAX_RETRIES = 5

  // Keep repeatModeRef and queueRef in sync
  useEffect(() => {
    repeatModeRef.current = state.repeatMode
  }, [state.repeatMode])

  useEffect(() => {
    queueRef.current = state.queue
  }, [state.queue])

  // Build a cache of videoId → filePath for downloaded tracks
  const refreshDownloadedPaths = useCallback(async () => {
    try {
      const tracks = await window.api.getLibraryTracks()
      const map = new Map<string, string>()
      for (const t of tracks as any[]) {
        if (t.videoId && t.filePath) map.set(t.videoId, t.filePath)
      }
      downloadedPathsRef.current = map
    } catch {
      // Library might be empty
    }
  }, [])

  // Load on mount
  useEffect(() => {
    refreshDownloadedPaths()
  }, [refreshDownloadedPaths])

  // Refresh when window gains focus (detect new downloads or deletions)
  useEffect(() => {
    const onFocus = () => refreshDownloadedPaths()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshDownloadedPaths])

  // Also refresh when a download completes so the cache stays current
  useEffect(() => {
    const removeListener = window.api.onDownloadProgress((data: any) => {
      if (data.status === 'done') {
        refreshDownloadedPaths()
      }
    })
    return () => { removeListener() }
  }, [refreshDownloadedPaths])

  // Fetch recommended tracks from the same/similar genre and append to queue
  const fetchAndAppendRecommendations = useCallback(async (
    videoId: string,
    currentQueue: Track[],
    autoPlayIfEnded = false,
    count = 10
  ) => {
    if (fetchingRecommendationsRef.current) return
    fetchingRecommendationsRef.current = true
    try {
      const recommended = await window.api.getUpNexts(videoId)
      if (!recommended || recommended.length === 0) return

      // Filter out tracks already in the queue
      const existingIds = new Set(currentQueue.map((t) => t.videoId))
      const newTracks = recommended
        .filter((t: Track) => t && t.videoId && !existingIds.has(t.videoId))
        .slice(0, count)

      if (newTracks.length === 0) return

      let nextTrackToPlay: Track | null = null
      setState((prev) => {
        const updatedQueue = [...prev.queue, ...newTracks]

        if (autoPlayIfEnded) {
          const nextIndex = prev.queueIndex + 1
          const nextTrack = updatedQueue[nextIndex] || newTracks[0]
          if (!nextTrack) return prev
          nextTrackToPlay = nextTrack
          return {
            ...prev,
            queue: updatedQueue,
            queueIndex: nextIndex,
            currentTrack: nextTrack,
            isPlaying: true,
            currentTime: 0,
            duration: 0
          }
        }

        return {
          ...prev,
          queue: updatedQueue
        }
      })

      if (autoPlayIfEnded && nextTrackToPlay) {
        loadAndPlayTrackRef.current(nextTrackToPlay)
      }
    } catch (err) {
      logger.error('[player] Failed to fetch recommendations:', err)
    } finally {
      fetchingRecommendationsRef.current = false
    }
  }, [])

  /**
   * Resolve the audio source for a track.
   * Fallback chain: local filePath -> pre-cached file -> live stream URL
   */
  const resolveAudioSource = useCallback(async (track: Track): Promise<string> => {
    // 1. Permanently downloaded file (library) — check track object first
    if (track.filePath) {
      return `media://local${track.filePath}`
    }

    // 2. Check downloaded cache (track may not carry filePath but exists locally)
    const cachedPath = downloadedPathsRef.current.get(track.videoId)
    if (cachedPath) {
      return `media://local${cachedPath}`
    }

    // 3. Pre-cached temporary file (stream cache)
    try {
      const streamCached = await window.api.getStreamCachePath(track.videoId)
      if (streamCached) {
        return `media://local${streamCached}`
      }
    } catch {
      // Cache lookup failed, fall through to streaming
    }

    // 4. Live stream URL via yt-dlp
    const streamUrl = await window.api.getStreamUrl(track.videoId)
    return streamUrl
  }, [])

  /**
   * Trigger pre-caching for the next track in the queue.
   * Only pre-caches 1 track ahead — the immediate next track.
   * Skips tracks that are already downloaded (have filePath).
   */
  const triggerPreCache = useCallback((queue: Track[], currentIndex: number) => {
    const nextIndex = currentIndex + 1
    if (nextIndex < queue.length) {
      const track = queue[nextIndex]
      if (!track.filePath) {
        window.api.preCacheTracks([track.videoId]).catch(console.error)
      }
    }
  }, [])

  const clearPlaybackStartTimeout = useCallback(() => {
    if (playbackStartTimeoutRef.current) {
      clearTimeout(playbackStartTimeoutRef.current)
      playbackStartTimeoutRef.current = null
    }
  }, [])

  /**
   * Handle playback failure by retrying with backoff.
   * After MAX_RETRIES, skips to the next track.
   */
  const handlePlaybackFailure = useCallback((track: Track, reason: string) => {
    if (playbackFailureHandledRef.current) return
    playbackFailureHandledRef.current = true

    retryCountRef.current++
    if (retryCountRef.current <= MAX_RETRIES) {
      const delay = Math.min(1000 * retryCountRef.current, 5000)
      logger.warn(`[player] Retry ${retryCountRef.current}/${MAX_RETRIES} for ${track.videoId} in ${delay}ms (${reason})`)
      sourceRequestRef.current++
      clearPlaybackStartTimeout()
      const audio = audioRef.current
      audio.pause()
      audio.src = ''

      setTimeout(() => {
        loadAndPlayTrackRef.current(track)
      }, delay)
      return
    }

    // All retries exhausted — skip to next track
    logger.error(`[player] All ${MAX_RETRIES} retries exhausted for ${track.videoId}, skipping (${reason})`)
    sourceRequestRef.current++
    clearPlaybackStartTimeout()
    retryCountRef.current = 0
    const audio = audioRef.current
    audio.pause()

    setState((prev) => {
      const nextIndex = prev.queueIndex + 1
      if (nextIndex < prev.queue.length) {
        return { ...prev, queueIndex: nextIndex, isPlaying: true }
      }
      return { ...prev, isPlaying: false }
    })
  }, [clearPlaybackStartTimeout])

  const loadAndPlayTrack = useCallback((track: Track) => {
    const audio = audioRef.current
    const requestId = ++sourceRequestRef.current
    playbackFailureHandledRef.current = false
    // Only reset retry count when loading a DIFFERENT track — not when retrying
    // the same track after a playback failure. Without this guard the count resets
    // on every retry, so handlePlaybackFailure never reaches MAX_RETRIES and the
    // player loops on the current track forever instead of advancing.
    if (currentTrackRef.current?.videoId !== track.videoId) {
      retryCountRef.current = 0
      lastPlayTimeRef.current = 0
      window.api.recordDataUsage({ bytes: 0, trackPlayed: true }).catch(() => {})
    }
    currentTrackRef.current = track
    clearPlaybackStartTimeout()
    audio.pause()

    // 30-second timeout — retries happen via handlePlaybackFailure
    playbackStartTimeoutRef.current = setTimeout(() => {
      if (requestId === sourceRequestRef.current) {
        logger.warn(`[player] Audio timeout for ${track.videoId}, retrying...`)
        handlePlaybackFailure(track, 'timeout')
      }
    }, 30000)

    /**
     * Try to resolve and play the audio source. On failure, retry with
     * exponential backoff up to MAX_RETRIES before skipping.
     */
    const attemptResolve = (attempt: number): void => {
      resolveAudioSource(track).then((src) => {
        if (requestId !== sourceRequestRef.current) return
        audio.src = src
        audio.load()
        audio.play().catch((err) => {
          if (requestId === sourceRequestRef.current) {
            logger.warn(`[player] audio.play() failed for ${track.videoId}:`, err?.message || err)
            handlePlaybackFailure(track, 'play rejected')
          }
        })
      }).catch((err) => {
        if (requestId !== sourceRequestRef.current) return
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(1000 * (attempt + 1), 5000)
          logger.warn(`[player] Source resolution failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms:`, err?.message || err)
          setTimeout(() => {
            if (requestId === sourceRequestRef.current) {
              attemptResolve(attempt + 1)
            }
          }, delay)
        } else {
          logger.error(`[player] Source resolution failed after ${MAX_RETRIES + 1} attempts:`, err?.message || err)
          handlePlaybackFailure(track, 'source resolution exhausted')
        }
      })
    }

    attemptResolve(0)
  }, [clearPlaybackStartTimeout, resolveAudioSource, handlePlaybackFailure])

  // Keep the ref in sync so handlePlaybackFailure can call loadAndPlayTrack
  // without a circular dependency.
  loadAndPlayTrackRef.current = loadAndPlayTrack

  // Load saved volume percentage and playback state on startup
  useEffect(() => {
    window.api.getSettings().then((settings) => {
      if (settings && typeof settings.volume === 'number') {
        const savedVolume = settings.volume
        audioRef.current.volume = savedVolume
        setState((prev) => ({
          ...prev,
          volume: savedVolume,
          isMuted: savedVolume === 0
        }))
      }
    }).catch((err) => {
      logger.error('Failed to load saved volume setting:', err)
    })

    window.api.loadPlayerState().then(async (savedState) => {
      if (savedState && savedState.currentTrack && Array.isArray(savedState.queue) && savedState.queue.length > 0) {
        const initialTime = typeof savedState.currentTime === 'number' ? savedState.currentTime : 0
        const initialTrack = savedState.currentTrack
        const initialIndex = typeof savedState.queueIndex === 'number' ? savedState.queueIndex : 0
        const initialVolume = typeof savedState.volume === 'number' ? savedState.volume : 0.8
        const initialRepeat = ['off', 'all', 'one'].includes(savedState.repeatMode) ? savedState.repeatMode : 'off'
        const initialShuffled = !!savedState.isShuffled

        currentTrackRef.current = initialTrack

        setState((prev) => ({
          ...prev,
          currentTrack: initialTrack,
          queue: savedState.queue,
          originalQueue: Array.isArray(savedState.originalQueue) ? savedState.originalQueue : savedState.queue,
          queueIndex: initialIndex,
          currentTime: initialTime,
          duration: initialTrack.duration || 0,
          volume: initialVolume,
          repeatMode: initialRepeat,
          isShuffled: initialShuffled,
          isPlaying: false
        }))

        try {
          const src = await resolveAudioSource(initialTrack)
          audioRef.current.src = src
          audioRef.current.currentTime = initialTime
        } catch (err) {
          logger.warn('[player] Could not pre-resolve audio source for saved track:', err)
        }
      }
    }).catch((err) => {
      logger.error('Failed to load saved player state:', err)
    })
  }, [resolveAudioSource])

  // Auto-save player state on track, queue, or settings changes
  const savePlayerStateRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.currentTrack) return

    if (savePlayerStateRef.current) {
      clearTimeout(savePlayerStateRef.current)
    }

    savePlayerStateRef.current = setTimeout(() => {
      const stateToSave = {
        currentTrack: state.currentTrack,
        queue: state.queue,
        originalQueue: state.originalQueue,
        queueIndex: state.queueIndex,
        currentTime: audioRef.current.currentTime || state.currentTime || 0,
        volume: state.volume,
        repeatMode: state.repeatMode,
        isShuffled: state.isShuffled
      }
      window.api.savePlayerState(stateToSave).catch(() => {})
    }, 1000)

    return () => {
      if (savePlayerStateRef.current) {
        clearTimeout(savePlayerStateRef.current)
      }
    }
  }, [state.currentTrack, state.queueIndex, state.queue, state.repeatMode, state.isShuffled, state.volume])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state.currentTrack) {
        const stateToSave = {
          currentTrack: state.currentTrack,
          queue: state.queue,
          originalQueue: state.originalQueue,
          queueIndex: state.queueIndex,
          currentTime: audioRef.current.currentTime || state.currentTime || 0,
          volume: state.volume,
          repeatMode: state.repeatMode,
          isShuffled: state.isShuffled
        }
        window.api.savePlayerState(stateToSave).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state.currentTrack, state.queue, state.originalQueue, state.queueIndex, state.currentTime, state.volume, state.repeatMode, state.isShuffled])

  // Cleanup save volume timeout on unmount
  useEffect(() => {
    return () => {
      if (saveVolumeTimeoutRef.current) {
        clearTimeout(saveVolumeTimeoutRef.current)
      }
    }
  }, [])

  // Sync audio element with state
  useEffect(() => {
    const audio = audioRef.current
    audio.volume = state.volume

    const onTimeUpdate = () => {
      const currentTime = audio.currentTime
      if (lastPlayTimeRef.current > 0 && currentTime > lastPlayTimeRef.current) {
        const delta = currentTime - lastPlayTimeRef.current
        if (delta > 0 && delta < 5) {
          accumulatedStreamBytesRef.current += Math.round(delta * 20000)
          if (accumulatedStreamBytesRef.current >= 400000) {
            const toRecord = accumulatedStreamBytesRef.current
            accumulatedStreamBytesRef.current = 0
            window.api.recordDataUsage({ bytes: toRecord, type: 'stream' }).catch(() => {})
          }
        }
      }
      lastPlayTimeRef.current = currentTime
      setState((prev) => ({ ...prev, currentTime }))
    }
    const onDurationChange = () => {
      setState((prev) => ({ ...prev, duration: audio.duration || 0 }))
    }
    const onPlaying = () => {
      clearPlaybackStartTimeout()
    }
    const onSeeking = () => {
      // Track native seeking so we can suppress spurious errors
      isActuallySeekingRef.current = true
    }
    const onSeeked = () => {
      // Seek completed successfully — clear the guard early
      isActuallySeekingRef.current = false
      seekGuardRef.current = false
      if (seekGuardTimeoutRef.current) {
        clearTimeout(seekGuardTimeoutRef.current)
        seekGuardTimeoutRef.current = null
      }
    }
    const onEnded = () => {
      // Ignore ended events that fire during/after seeking (stream URL quirk)
      if (isActuallySeekingRef.current) return
      clearPlaybackStartTimeout()

      if (repeatModeRef.current === 'one') {
        audio.currentTime = 0
        audio.play().catch(console.error)
        setState((prev) => ({ ...prev, currentTime: 0, isPlaying: true }))
        return
      }

      // Auto-play next track, or fetch recommendations if queue is done
      let queueExhausted = false
      let loopBack = false
      setState((prev) => {
        const nextIndex = prev.queueIndex + 1
        if (nextIndex < prev.queue.length) {
          return { ...prev, queueIndex: nextIndex, isPlaying: true }
        }
        if (repeatModeRef.current === 'all' && prev.queue.length > 0) {
          if (prev.queueIndex === 0) {
            loopBack = true
          }
          return { ...prev, queueIndex: 0, isPlaying: true }
        }
        queueExhausted = true
        return { ...prev, isPlaying: false }
      })

      if (loopBack) {
        audio.currentTime = 0
        audio.play().catch(console.error)
        setState((prev) => ({ ...prev, currentTime: 0, isPlaying: true }))
        return
      }

      // Fetch recommendations when the queue runs out.
      // Must live OUTSIDE the setState updater — updater functions must be pure;
      // kicking off an async side-effect inside one causes race conditions where
      // the returned state object and the eventual nested setState canlobber
      // each other, leaving the queue in an inconsistent state.
      if (queueExhausted) {
        const current = currentTrackRef.current
        if (current) {
          fetchAndAppendRecommendations(current.videoId, queueRef.current, true, 10)
        }
      }
    }
    const onError = () => {
      if (seekGuardRef.current) return
      const track = currentTrackRef.current
      if (track) {
        logger.warn(`[player] Audio error for ${track.videoId}, retrying...`)
        handlePlaybackFailure(track, 'media error')
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('seeking', onSeeking)
    audio.addEventListener('seeked', onSeeked)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      if (accumulatedStreamBytesRef.current > 0) {
        const toRecord = accumulatedStreamBytesRef.current
        accumulatedStreamBytesRef.current = 0
        window.api.recordDataUsage({ bytes: toRecord, type: 'stream' }).catch(() => {})
      }
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('seeking', onSeeking)
      audio.removeEventListener('seeked', onSeeked)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [clearPlaybackStartTimeout, fetchAndAppendRecommendations, handlePlaybackFailure])

  // Spacebar to play/pause
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        setState((prev) => {
          if (!prev.currentTrack && prev.queue.length > 0) {
            return { ...prev, queueIndex: 0, isPlaying: true }
          }
          return { ...prev, isPlaying: !prev.isPlaying }
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Load track when queueIndex changes
  useEffect(() => {
    if (state.queueIndex >= 0 && state.queueIndex < state.queue.length) {
      const track = state.queue[state.queueIndex]
      if (track && track.videoId !== state.currentTrack?.videoId) {
        setState((prev) => ({ ...prev, currentTrack: track, currentTime: 0, duration: 0 }))
        loadAndPlayTrack(track)
      }
    }
  }, [state.queueIndex, state.queue, state.currentTrack?.videoId, loadAndPlayTrack])

  // Keep the moving next-three-track window available locally.
  useEffect(() => {
    const signature = `${state.queueIndex}:${state.queue.map(t => t.videoId).join(',')}`
    if (signature === cacheWindowSignatureRef.current) return
    cacheWindowSignatureRef.current = signature

    if (state.queue.length > 0 && state.queueIndex >= 0) {
      triggerPreCache(state.queue, state.queueIndex)
    }
  }, [state.queue, state.queueIndex, triggerPreCache])

  // Continuously fetch recommended tracks from the same/similar genre when remaining tracks in queue <= 3
  useEffect(() => {
    if (state.queue.length === 0 || state.queueIndex < 0) return
    const remaining = state.queue.length - 1 - state.queueIndex
    if (remaining <= 3 && !fetchingRecommendationsRef.current) {
      const anchorTrack = state.queue[state.queue.length - 1] || state.currentTrack
      if (anchorTrack && anchorTrack.videoId && !attemptedAnchorsRef.current.has(anchorTrack.videoId)) {
        attemptedAnchorsRef.current.add(anchorTrack.videoId)
        fetchAndAppendRecommendations(anchorTrack.videoId, state.queue, false, 10)
      }
    }
  }, [state.queue, state.queueIndex, state.currentTrack, fetchAndAppendRecommendations])

  // Handle play/pause state changes
  useEffect(() => {
    const audio = audioRef.current
    if (state.isPlaying && audio.src) {
      audio.play().catch(console.error)
    } else {
      audio.pause()
    }
  }, [state.isPlaying])

  const playTrack = useCallback((track: Track, queue?: Track[]) => {
    const isSingleTrack = !queue || queue.length <= 1
    const newQueue = queue && queue.length > 0 ? queue : [track]
    const index = newQueue.findIndex((t) => t.videoId === track.videoId)
    const originalQueue = queue ? [...queue] : [track]

    attemptedAnchorsRef.current.clear()

    setState((prev) => ({
      ...prev,
      queue: newQueue,
      originalQueue: prev.isShuffled ? prev.originalQueue : originalQueue,
      queueIndex: index >= 0 ? index : 0,
      currentTrack: track,
      isPlaying: true,
      currentTime: 0,
      duration: 0
    }))

    loadAndPlayTrack(track)

    if (isSingleTrack) {
      fetchAndAppendRecommendations(track.videoId, [track], false, 10)
    }
  }, [loadAndPlayTrack, fetchAndAppendRecommendations])

  const togglePlay = useCallback(() => {
    setState((prev) => {
      if (!prev.currentTrack && prev.queue.length > 0) {
        // Start playing from beginning of queue
        return { ...prev, queueIndex: 0, isPlaying: true }
      }
      return { ...prev, isPlaying: !prev.isPlaying }
    })
  }, [])

  const nextTrack = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.queueIndex + 1
      if (nextIndex < prev.queue.length) {
        return { ...prev, queueIndex: nextIndex, isPlaying: true }
      }
      if (repeatModeRef.current === 'all' && prev.queue.length > 0) {
        if (prev.queueIndex === 0) {
          const audio = audioRef.current
          audio.currentTime = 0
          audio.play().catch(console.error)
          return { ...prev, currentTime: 0, isPlaying: true }
        }
        return { ...prev, queueIndex: 0, isPlaying: true }
      }
      return prev
    })
  }, [])

  const prevTrack = useCallback(() => {
    const audio = audioRef.current
    // If more than 3 seconds in, restart current track
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    setState((prev) => {
      const prevIndex = prev.queueIndex - 1
      if (prevIndex >= 0) {
        return { ...prev, queueIndex: prevIndex, isPlaying: true }
      }
      if (repeatModeRef.current === 'all' && prev.queue.length > 0) {
        const lastIndex = prev.queue.length - 1
        if (prev.queueIndex === lastIndex) {
          audio.currentTime = 0
          audio.play().catch(console.error)
          return { ...prev, currentTime: 0, isPlaying: true }
        }
        return { ...prev, queueIndex: lastIndex, isPlaying: true }
      }
      return prev
    })
  }, [])

  // Listen for System Tray player actions (toggle-play, next, prev)
  useEffect(() => {
    const cleanup = window.api.onTrayPlayerAction((action) => {
      if (action === 'toggle-play') {
        togglePlay()
      } else if (action === 'next') {
        nextTrack()
      } else if (action === 'prev') {
        prevTrack()
      }
    })
    return cleanup
  }, [togglePlay, nextTrack, prevTrack])

  const stop = useCallback(() => {
    const audio = audioRef.current
    audio.pause()
    audio.currentTime = 0
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: 0
    }))
  }, [])

  const toggleShuffle = useCallback(() => {
    setState((prev) => {
      const newShuffled = !prev.isShuffled
      if (newShuffled) {
        // Shuffle: preserve current track, shuffle the rest
        const current = prev.queue[prev.queueIndex]
        const rest = prev.queue.filter((_, i) => i !== prev.queueIndex)
        const shuffled = shuffleArray(rest)
        const newQueue = current ? [current, ...shuffled] : shuffled
        return {
          ...prev,
          isShuffled: true,
          queue: newQueue,
          queueIndex: 0,
          originalQueue: prev.originalQueue.length > 0 ? prev.originalQueue : prev.queue
        }
      } else {
        // Unshuffle: restore original order
        const current = prev.queue[prev.queueIndex]
        const newQueue = prev.originalQueue.length > 0 ? prev.originalQueue : prev.queue
        const newIndex = current
          ? newQueue.findIndex((t) => t.videoId === current.videoId)
          : 0
        return {
          ...prev,
          isShuffled: false,
          queue: newQueue,
          queueIndex: newIndex >= 0 ? newIndex : 0
        }
      }
    })
  }, [])

  const toggleRepeat = useCallback(() => {
    setState((prev) => {
      let nextMode: 'off' | 'all' | 'one' = 'off'
      if (prev.repeatMode === 'off') nextMode = 'all'
      else if (prev.repeatMode === 'all') nextMode = 'one'
      else nextMode = 'off'
      return { ...prev, repeatMode: nextMode }
    })
  }, [])

  const setVolume = useCallback((volume: number) => {
    audioRef.current.volume = volume
    setState((prev) => ({ ...prev, volume, isMuted: volume === 0 }))

    // Debounce saving to disk
    if (saveVolumeTimeoutRef.current) {
      clearTimeout(saveVolumeTimeoutRef.current)
    }
    saveVolumeTimeoutRef.current = setTimeout(() => {
      window.api.saveSettings({ volume }).catch((err) => {
        logger.error('Failed to save volume setting:', err)
      })
    }, 500)
  }, [])

  const toggleMute = useCallback(() => {
    setState((prev) => {
      const newMuted = !prev.isMuted
      audioRef.current.volume = newMuted ? 0 : prev.volume
      return { ...prev, isMuted: newMuted }
    })
  }, [])

  const seek = useCallback((time: number) => {
    // Guard against error/handlers that misinterpret seeking as a failure.
    // YouTube stream URLs may fire transient errors when seeking.
    isActuallySeekingRef.current = true
    seekGuardRef.current = true
    if (seekGuardTimeoutRef.current) clearTimeout(seekGuardTimeoutRef.current)
    // 2-second guard: covers seeking → buffering → stalled → error window
    seekGuardTimeoutRef.current = setTimeout(() => {
      seekGuardRef.current = false
      isActuallySeekingRef.current = false
    }, 2000)
    audioRef.current.currentTime = time
    setState((prev) => ({ ...prev, currentTime: time }))
  }, [])

  const removeFromQueue = useCallback((index: number) => {
    setState((prev) => {
      const newQueue = prev.queue.filter((_, i) => i !== index)
      let newQueueIndex = prev.queueIndex
      if (index < prev.queueIndex) {
        newQueueIndex = prev.queueIndex - 1
      } else if (index === prev.queueIndex) {
        // Removing current track
        if (newQueue.length === 0) {
          return { ...prev, queue: [], queueIndex: -1, currentTrack: null, isPlaying: false }
        }
        newQueueIndex = Math.min(prev.queueIndex, newQueue.length - 1)
      }
      return { ...prev, queue: newQueue, queueIndex: newQueueIndex }
    })
  }, [])

  const clearQueue = useCallback(() => {
    const audio = audioRef.current
    sourceRequestRef.current++
    clearPlaybackStartTimeout()
    audio.pause()
    audio.src = ''
    attemptedAnchorsRef.current.clear()
    // Cancel any active pre-caching
    window.api.cancelPreCache([]).catch(console.error)
    setState((prev) => ({
      ...prev,
      queue: [],
      originalQueue: [],
      queueIndex: -1,
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0
    }))
  }, [clearPlaybackStartTimeout])

  const rearrangeQueue = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.queue.length || toIndex < 0 || toIndex >= prev.queue.length) {
        return prev
      }
      const newQueue = [...prev.queue]
      const [movedItem] = newQueue.splice(fromIndex, 1)
      newQueue.splice(toIndex, 0, movedItem)

      let newQueueIndex = prev.queueIndex
      if (fromIndex === prev.queueIndex) {
        newQueueIndex = toIndex
      } else if (fromIndex < prev.queueIndex && toIndex >= prev.queueIndex) {
        newQueueIndex--
      } else if (fromIndex > prev.queueIndex && toIndex <= prev.queueIndex) {
        newQueueIndex++
      }
      return { ...prev, queue: newQueue, queueIndex: newQueueIndex }
    })
  }, [])

  const addToQueue = useCallback((track: Track) => {
    setState((prev) => {
      // If nothing is playing / queue is empty, play it right away
      if (!prev.currentTrack || prev.queue.length === 0) {
        setTimeout(() => loadAndPlayTrackRef.current(track), 0)
        return {
          ...prev,
          queue: [track],
          queueIndex: 0,
          currentTrack: track,
          isPlaying: true
        }
      }
      return { ...prev, queue: [...prev.queue, track] }
    })
  }, [])

  const playNext = useCallback((track: Track) => {
    setState((prev) => {
      if (!prev.currentTrack || prev.queue.length === 0) {
        setTimeout(() => loadAndPlayTrackRef.current(track), 0)
        return {
          ...prev,
          queue: [track],
          queueIndex: 0,
          currentTrack: track,
          isPlaying: true
        }
      }
      const newQueue = [...prev.queue]
      const insertIdx = prev.queueIndex + 1
      newQueue.splice(insertIdx, 0, track)
      return { ...prev, queue: newQueue }
    })
  }, [])

  const getAudioElement = useCallback(() => audioRef.current, [])

  // Enumerate available audio output devices
  const enumerateAudioDevices = useCallback(async (): Promise<AudioOutputDevice[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices
        .filter((d) => d.kind === 'audiooutput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Device ${d.deviceId.slice(0, 8)}`,
          kind: 'audiooutput' as const
        }))
    } catch {
      return []
    }
  }, [])

  // Switch the audio element's output to a specific device
  const switchAudioOutput = useCallback(async (deviceId: string): Promise<void> => {
    const audio = audioRef.current
    try {
      await audio.setSinkId(deviceId)
      setSelectedDeviceId(deviceId)
      logger.info(`[player] Switched audio output to: ${deviceId}`)
    } catch (err) {
      logger.warn('[player] setSinkId failed, attempting permission flow:', err)
      // Try requesting audio output permission via the browser API
      try {
        if (typeof (navigator.mediaDevices as any).selectAudioOutput === 'function') {
          await (navigator.mediaDevices as any).selectAudioOutput()
        }
        // Re-enumerate after permission grant
        const devices = await enumerateAudioDevices()
        setAudioOutputDevices(devices)
        // Retry the sink switch
        await audio.setSinkId(deviceId)
        setSelectedDeviceId(deviceId)
        logger.info(`[player] Switched audio output after permission grant: ${deviceId}`)
      } catch (retryErr) {
        logger.error('[player] Audio output device switch failed:', retryErr)
      }
    }
  }, [enumerateAudioDevices])

  // Enumerate devices on mount, listen for hardware changes, and poll sinkId for OS-level changes
  useEffect(() => {
    let cancelled = false

    async function loadDevices() {
      const devices = await enumerateAudioDevices()
      if (cancelled) return
      setAudioOutputDevices(devices)
      const currentSink = audioRef.current.sinkId
      setSelectedDeviceId(currentSink)
      previousSinkIdRef.current = currentSink
    }

    loadDevices()

    // Re-enumerate when devices are plugged/unplugged
    const onDeviceChange = async () => {
      const devices = await enumerateAudioDevices()
      if (cancelled) return
      setAudioOutputDevices(devices)
      const currentSink = audioRef.current.sinkId
      const stillAvailable = devices.some((d) => d.deviceId === currentSink)
      if (!stillAvailable && devices.length > 0) {
        // Current device gone — switch to the first available one
        try {
          await audioRef.current.setSinkId(devices[0].deviceId)
          setSelectedDeviceId(devices[0].deviceId)
          previousSinkIdRef.current = devices[0].deviceId
        } catch {
          // ignore
        }
      }
    }

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    }

    // Poll sinkId every 3s to detect OS-level default changes
    sinkIdPollRef.current = setInterval(() => {
      if (cancelled) return
      const currentSink = audioRef.current.sinkId
      if (currentSink !== previousSinkIdRef.current) {
        previousSinkIdRef.current = currentSink
        setSelectedDeviceId(currentSink)
      }
    }, 3000)

    return () => {
      cancelled = true
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
      }
      if (sinkIdPollRef.current) {
        clearInterval(sinkIdPollRef.current)
        sinkIdPollRef.current = null
      }
    }
  }, [enumerateAudioDevices])

  return (
    <PlayerContext.Provider
      value={{
        ...state,
        playTrack,
        togglePlay,
        nextTrack,
        prevTrack,
        stop,
        toggleShuffle,
        toggleRepeat,
        setVolume,
        toggleMute,
        seek,
        removeFromQueue,
        clearQueue,
        rearrangeQueue,
        addToQueue,
        playNext,
        getAudioElement,
        audioOutputDevices,
        selectedDeviceId,
        switchAudioOutput
      }}
    >
      {children}
    </PlayerContext.Provider>
  )
}
