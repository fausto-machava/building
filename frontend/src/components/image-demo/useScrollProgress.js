import { useEffect, useRef, useState } from 'react'

export default function useScrollProgress(containerRef) {
  const progressRef = useRef(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    let active = false
    let frameId = 0
    const update = () => {
      frameId = 0
      if (!active) return
      const bounds = container.getBoundingClientRect()
      const scrollRange = Math.max(1, bounds.height - window.innerHeight)
      const nextProgress = Math.min(1, Math.max(0, -bounds.top / scrollRange))
      progressRef.current = nextProgress
      setProgress(current => Math.abs(current - nextProgress) > 0.002 ? nextProgress : current)
    }
    const scheduleUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(update)
    }
    const onIntersection = entries => {
      active = entries.some(entry => entry.isIntersecting)
      if (active) scheduleUpdate()
    }
    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(onIntersection, { rootMargin: '100% 0px' })
      : null

    observer?.observe(container)
    active = !observer
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    scheduleUpdate()

    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [containerRef])

  return { progress, progressRef }
}
