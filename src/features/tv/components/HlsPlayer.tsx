import Hls from 'hls.js'
import { useEffect, useReducer, useRef } from 'react'

type HlsPlayerProps = {
  src: string
  muted: boolean
  playing: boolean
  onError?: (message: string) => void
}

type PlayerState = { error: string | null }
type PlayerAction = { type: 'error'; message: string }

function playerReducer(_state: PlayerState, action: PlayerAction): PlayerState {
  return { error: action.message }
}

function HlsPlayerInner({ src, muted, playing, onError }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [state, dispatch] = useReducer(playerReducer, { error: null })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Direct playback for non-HLS streams or native HLS support
    if (!src.includes('.m3u8') && !src.includes('.m3u')) {
      video.src = src
      return
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      return
    }

    if (!Hls.isSupported()) {
      const msg = 'HLS desteklenmiyor'
      onError?.(msg)
      dispatch({ type: 'error', message: msg })
      return
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: 15,
      maxMaxBufferLength: 30,
    })

    hlsRef.current = hls

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        let msg = 'Stream yüklenemedi'
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          msg = 'Ağ hatası — stream erişilemez veya CORS engeli olabilir'
          hls.startLoad()
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          msg = 'Medya hatası — codec desteklenmiyor olabilir'
          hls.recoverMediaError()
        } else {
          hls.destroy()
        }
        dispatch({ type: 'error', message: msg })
        onError?.(msg)
      }
    })

    hls.loadSource(src)
    hls.attachMedia(video)

    return () => {
      hls.destroy()
      hlsRef.current = null
    }
  }, [src, onError])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = muted
  }, [muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (playing) {
      video.play().catch(() => {
        // Autoplay blocked — will need user interaction
      })
    } else {
      video.pause()
    }
  }, [playing])

  if (state.error) {
    return (
      <div className="tv-player-error">
        <span className="tv-player-error-icon">!</span>
        <p>{state.error}</p>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      className="tv-player-video"
      muted={muted}
      playsInline
    />
  )
}

/**
 * Wrapper that remounts HlsPlayerInner when src changes,
 * resetting state cleanly without calling setState in an effect.
 */
export function HlsPlayer(props: HlsPlayerProps) {
  return <HlsPlayerInner key={props.src} {...props} />
}
