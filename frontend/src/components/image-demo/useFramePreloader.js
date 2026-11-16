import { useEffect, useState } from 'react'

const preloadConcurrency = 4

function getFrameUrl(manifest, frameNumber, mobile) {
  const pattern = (mobile && manifest.frames?.mobile) || manifest.frames?.desktop
  if (!pattern) return ''
  const frame = String(frameNumber).padStart(4, '0')
  const source = pattern.replace('{frame}', frame).replace('{version}', String(manifest.version || 1))
  return new URL(source, manifest.assetBase).href
}

export default function useFramePreloader(manifest) {
  const [frames, setFrames] = useState([])
  const [loaded, setLoaded] = useState(0)
  const [failed, setFailed] = useState(0)
  const totalFrames = Math.max(0, Number(manifest?.totalFrames) || 0)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const requestedFrames = totalFrames && reducedMotion ? 1 : totalFrames

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = event => setReducedMotion(event.matches)
    preference.addEventListener?.('change', updatePreference)
    return () => preference.removeEventListener?.('change', updatePreference)
  }, [])

  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 767px)')
    const updateBreakpoint = event => setMobile(event.matches)
    breakpoint.addEventListener?.('change', updateBreakpoint)
    return () => breakpoint.removeEventListener?.('change', updateBreakpoint)
  }, [])

  useEffect(() => {
    if (!manifest || totalFrames === 0) {
      setFrames([])
      setLoaded(0)
      setFailed(0)
      return undefined
    }

    let cancelled = false
    const loadedFrames = new Array(totalFrames)
    const activeImages = new Set()
    const frameNumbers = reducedMotion
      ? [totalFrames]
      : Array.from({ length: totalFrames }, (_value, index) => index + 1)

    setFrames([])
    setLoaded(0)
    setFailed(0)

    function loadFrame(frameNumber) {
      return new Promise(resolve => {
        const image = new Image()
        activeImages.add(image)
        image.decoding = 'async'
        image.crossOrigin = 'anonymous'
        image.onload = () => {
          activeImages.delete(image)
          if (cancelled) return resolve(false)
          loadedFrames[frameNumber - 1] = image
          setFrames([...loadedFrames])
          setLoaded(current => current + 1)
          resolve(true)
        }
        image.onerror = () => {
          activeImages.delete(image)
          if (!cancelled) setFailed(current => current + 1)
          resolve(false)
        }
        image.src = getFrameUrl(manifest, frameNumber, mobile)
      })
    }

    async function preload() {
      await loadFrame(frameNumbers[0])
      const remaining = frameNumbers.slice(1)
      let nextIndex = 0
      await Promise.all(Array.from({ length: Math.min(preloadConcurrency, remaining.length) }, async () => {
        while (!cancelled && nextIndex < remaining.length) {
          const frameNumber = remaining[nextIndex]
          nextIndex += 1
          await loadFrame(frameNumber)
        }
      }))
    }

    preload()
    return () => {
      cancelled = true
      activeImages.forEach(image => { image.src = '' })
      activeImages.clear()
    }
  }, [manifest, mobile, reducedMotion, totalFrames])

  return {
    frames,
    loaded,
    failed,
    totalFrames,
    progress: requestedFrames ? Math.round(((loaded + failed) / requestedFrames) * 100) : 0,
    isLoading: totalFrames > 0 && loaded + failed < requestedFrames,
  }
}
