import { useRef, useEffect, useCallback } from 'react'

interface SpectrumVisualizerProps {
  getAudioElement: () => HTMLAudioElement
}

// Module-level shared state — reused across mount/unmount cycles.
// Uses captureStream() side-chain so the analyser never intercepts playback.
let sharedCtx: AudioContext | null = null
let sharedAnalyser: AnalyserNode | null = null
let sharedSource: MediaStreamAudioSourceNode | null = null
let sharedAudioElement: HTMLAudioElement | null = null

/**
 * Connect an audio element to the spectrum analyser via captureStream().
 * This creates a passive side-chain: audio keeps playing directly from the
 * HTMLAudioElement to the speakers, while the MediaStream tap feeds the
 * AnalyserNode for visualisation only. The AudioContext is never in the
 * playback path, so suspensions (e.g. during fullscreen transitions) cannot
 * cause silence.
 *
 * Call from a user gesture so the AudioContext starts in the running state.
 */
export function initSpectrumAnalyser(audio: HTMLAudioElement): AnalyserNode | null {
  // Reuse existing graph if same audio element
  if (sharedAudioElement === audio && sharedAnalyser && sharedCtx) {
    if (sharedCtx.state === 'suspended') {
      sharedCtx.resume()
    }
    return sharedAnalyser
  }

  // Tear down old graph
  try { sharedSource?.disconnect() } catch { /* noop */ }
  sharedSource = null
  try { sharedCtx?.close() } catch { /* noop */ }
  sharedCtx = null
  sharedAnalyser = null
  sharedAudioElement = null

  try {
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.82

    // captureStream() taps the audio element's output without intercepting it.
    // Audio continues to play directly to speakers through the HTMLAudioElement.
    const stream = (audio as any).captureStream() as MediaStream
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
    // Do NOT connect analyser to ctx.destination — that would double-play audio.

    sharedCtx = ctx
    sharedAnalyser = analyser
    sharedSource = source
    sharedAudioElement = audio

    // Should already be running because init() is called from a user gesture,
    // but resume() is safe to call regardless.
    ctx.resume()

    console.log('[SpectrumVisualizer] Analyser connected via captureStream, state:', ctx.state)
    return analyser
  } catch (err) {
    console.warn('[SpectrumVisualizer] Failed to create analyser:', err)
    return null
  }
}

export function SpectrumVisualizer({ getAudioElement }: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const cssSizeRef = useRef({ width: 0, height: 0 })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = sharedAnalyser
    if (!canvas || !analyser) {
      rafRef.current = requestAnimationFrame(draw)
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = cssSizeRef.current
    if (width === 0 || height === 0) {
      rafRef.current = requestAnimationFrame(draw)
      return
    }

    // Reset transform and clear in pixel space
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Scale for HiDPI
    const dpr = window.devicePixelRatio || 1
    ctx.scale(dpr, dpr)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)

    const barCount = 64
    const step = Math.floor(bufferLength / barCount)
    const barWidth = width / barCount
    const centerY = height * 0.75
    const maxHeight = height * 0.55

    for (let i = 0; i < barCount; i++) {
      let sum = 0
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j] || 0
      }
      const value = sum / step / 255
      const boosted = Math.pow(value, 0.85)
      const barHeight = boosted * maxHeight

      const x = i * barWidth
      const halfWidth = barWidth * 0.55
      const hue = 180 + (i / barCount) * 140
      const saturation = 70 + boosted * 30
      const lightness = 50 + boosted * 25
      const alpha = 0.5 + boosted * 0.5

      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`

      const bx = x + (barWidth - halfWidth * 2) / 2
      const by = centerY - barHeight
      const radius = Math.min(halfWidth, barHeight / 2, 5)

      ctx.beginPath()
      ctx.moveTo(bx + radius, by)
      ctx.lineTo(bx + halfWidth * 2 - radius, by)
      ctx.quadraticCurveTo(bx + halfWidth * 2, by, bx + halfWidth * 2, by + radius)
      ctx.lineTo(bx + halfWidth * 2, centerY)
      ctx.lineTo(bx, centerY)
      ctx.lineTo(bx, by + radius)
      ctx.quadraticCurveTo(bx, by, bx + radius, by)
      ctx.fill()

      // Mirror reflection
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha * 0.2})`
      ctx.fillRect(bx, centerY, halfWidth * 2, barHeight * 0.35)
    }

    // Baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      if (w > 0 && h > 0) {
        cssSizeRef.current = { width: w, height: h }
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
    }

    const frame = requestAnimationFrame(() => {
      resize()
      setTimeout(resize, 200)
    })

    window.addEventListener('resize', resize)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement || document.body)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      observer.disconnect()
    }
  }, [])

  // Start draw loop — analyser will be connected when init() is called
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [draw])

  return (
    // relative wrapper ensures absolute positioning works inside any container
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
      />
    </div>
  )
}
