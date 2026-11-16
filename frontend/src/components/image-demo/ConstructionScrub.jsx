import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useFramePreloader from './useFramePreloader'
import useScrollProgress from './useScrollProgress'
import StageCaption from './StageCaption'

function getStageIndex(stages, progress) {
  let index = 0
  for (let cursor = 0; cursor < stages.length; cursor += 1) {
    if (progress >= stages[cursor].start) index = cursor
  }
  return index
}

function drawCover(context, image, width, height) {
  if (!image?.complete || !image.naturalWidth) return
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

export default function ConstructionScrub({ manifest, project }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const renderedFrameRef = useRef(null)
  const framesRef = useRef([])
  const scheduleDrawRef = useRef(() => {})
  const { progress, progressRef } = useScrollProgress(containerRef)
  const { frames, loaded, failed, totalFrames, progress: loadProgress, isLoading } = useFramePreloader(manifest)
  const [canvasReady, setCanvasReady] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const stages = useMemo(() => manifest?.stages || [], [manifest?.stages])
  const activeStageIndex = stages.length
    ? reducedMotion ? stages.length - 1 : getStageIndex(stages, progress)
    : 0

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = event => setReducedMotion(event.matches)
    preference.addEventListener?.('change', updatePreference)
    return () => preference.removeEventListener?.('change', updatePreference)
  }, [])

  useEffect(() => {
    framesRef.current = frames
    scheduleDrawRef.current()
  }, [frames])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const context = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !container || !context) return undefined

    let width = 0
    let height = 0
    let animationFrame = 0
    let currentFrame = 0
    let disposed = false
    let isVisible = !('IntersectionObserver' in window)
    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(width * pixelRatio))
      canvas.height = Math.max(1, Math.round(height * pixelRatio))
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      renderedFrameRef.current = null
      scheduleDraw()
    }
    const scheduleDraw = () => {
      if (!disposed && isVisible && framesRef.current.length && !animationFrame) {
        animationFrame = window.requestAnimationFrame(render)
      }
    }
    const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : null
    const intersectionObserver = 'IntersectionObserver' in window
      ? new IntersectionObserver(entries => {
        isVisible = entries.some(entry => entry.isIntersecting)
        if (isVisible) scheduleDraw()
        else if (animationFrame) {
          window.cancelAnimationFrame(animationFrame)
          animationFrame = 0
        }
      }, { rootMargin: '100px 0px' })
      : null
    resizeObserver?.observe(container)
    intersectionObserver?.observe(container)
    window.addEventListener('resize', resize)
    scheduleDrawRef.current = scheduleDraw
    resize()

    function render() {
      animationFrame = 0
      if (disposed) return
      const availableFrames = framesRef.current
      if (availableFrames.length && width && height) {
        const lastFrameIndex = totalFrames - 1
        const targetFrame = reducedMotion
          ? lastFrameIndex
          : progressRef.current * lastFrameIndex
        currentFrame += (targetFrame - currentFrame) * (reducedMotion ? 1 : 0.12)
        const frameIndex = Math.max(0, Math.min(lastFrameIndex, Math.round(currentFrame)))
        const frame = availableFrames[frameIndex]
          || availableFrames.find((candidate, index) => candidate && Math.abs(index - frameIndex) <= 2)
          || availableFrames.find(Boolean)
        if (frame && renderedFrameRef.current !== frame) {
          context.clearRect(0, 0, width, height)
          drawCover(context, frame, width, height)
          renderedFrameRef.current = frame
          setCanvasReady(true)
        }
      }
      if (!reducedMotion) scheduleDraw()
    }
    scheduleDraw()

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      window.removeEventListener('resize', resize)
      window.cancelAnimationFrame(animationFrame)
      scheduleDrawRef.current = () => {}
    }
  }, [reducedMotion, totalFrames, progressRef])

  const fallbackImage = project.coverImage || project.gallery?.[0]?.url
  const activeStage = stages[activeStageIndex]

  return (
    <section className="image-demo-scrub" ref={containerRef} aria-label="Demonstração de imagens da construção">
      <div className="image-demo-stage">
        {fallbackImage && <img className={`image-demo-fallback${canvasReady ? ' is-covered' : ''}`} src={fallbackImage} alt="" aria-hidden="true" decoding="async" />}
        <canvas
          className={`image-demo-canvas${canvasReady ? ' is-ready' : ''}`}
          ref={canvasRef}
          role="img"
          aria-label="Sequência visual da construção da casa"
        />
        <div className="image-demo-shade" />

        <div className="image-demo-topbar">
          <span className="image-demo-brand">ARQCONS <small>DO PROJECTO À OBRA</small></span>
          <div className="image-demo-top-actions">
            <span className="image-demo-pill">Desde 2004 <i /> Casas personalizadas</span>
            <Link to="/orcamento" className="image-demo-cta">Inicie a sua obra <span aria-hidden="true">↗</span></Link>
          </div>
        </div>

        <StageCaption
          stage={activeStage}
          index={activeStageIndex}
          total={stages.length}
          progress={reducedMotion ? 1 : progress}
        />

        {totalFrames === 0 && (
          <p className="image-demo-asset-notice" role="status">
            Adicione os frames da construção em <code>Backend/public/frames/construction</code> para activar a animação.
          </p>
        )}
        {failed > 0 && (
          <p className="image-demo-asset-notice" role="status">
            {failed} frame(s) não carregaram. Verifique os ficheiros WebP e volte a gerar o manifest.
          </p>
        )}

        {totalFrames > 0 && (isLoading || !canvasReady) && (
          <div className="image-demo-preload" role="status" aria-live="polite">
            <span>A carregar imagens</span>
            <progress max="100" value={loadProgress} />
            <span>{loadProgress}%</span>
          </div>
        )}
      </div>
    </section>
  )
}
