import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OptionPanel from './OptionPanel'

function getImageUrl(option, hardwareId, assetBase, version) {
  const source = option.variants?.[hardwareId] || option.src
  if (!source) return ''
  const url = new URL(source, assetBase)
  url.searchParams.set('v', String(version || 1))
  return url.href
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('A imagem da variante não está configurada.'))
      return
    }
    const image = new Image()
    image.decoding = 'async'
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(url)
    image.onerror = () => reject(new Error(`Não foi possível carregar ${url}.`))
    image.src = url
  })
}

function preloadScene(scene, assetBase, version) {
  const sources = scene.options.flatMap(option => [
    option.src,
    ...Object.values(option.variants || {}),
  ]).filter(Boolean)
  return Promise.allSettled(sources.map(source => {
    const url = new URL(source, assetBase)
    url.searchParams.set('v', String(version || 1))
    return preloadImage(url.href)
  }))
}

export default function ConfiguratorScene({ scene, nextScene, index, assetBase, version, fallbackImage }) {
  const sectionRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const [selectedOption, setSelectedOption] = useState(scene.options[0])
  const [hardwareId, setHardwareId] = useState(scene.hardwareOptions?.[0]?.id || '')
  const [shownUrl, setShownUrl] = useState('')
  const [pendingUrl, setPendingUrl] = useState('')
  const [crossfadeStarted, setCrossfadeStarted] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [selectionError, setSelectionError] = useState('')
  const currentUrl = useMemo(
    () => getImageUrl(selectedOption, hardwareId, assetBase, version),
    [selectedOption, hardwareId, assetBase, version],
  )

  useEffect(() => {
    const element = sectionRef.current
    if (!element) return undefined
    if (!('IntersectionObserver' in window)) {
      setIsVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver(entries => {
      setIsVisible(entries.some(entry => entry.isIntersecting))
    }, { rootMargin: '20% 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible) return
    preloadScene(scene, assetBase, version)
    if (nextScene) preloadScene(nextScene, assetBase, version)
  }, [assetBase, isVisible, nextScene, scene, version])

  useEffect(() => {
    if (!isVisible || !currentUrl) return
    let active = true
    preloadImage(currentUrl).then(url => {
      if (!active) return
      setPendingUrl(url)
      setCrossfadeStarted(false)
      setImageError(false)
      setSelectionError('')
    }).catch(error => {
      if (!active) return
      setImageError(true)
      setSelectionError(error.message)
    })
    return () => { active = false }
  }, [currentUrl, isVisible])

  useEffect(() => {
    if (!pendingUrl) return undefined
    const frame = window.requestAnimationFrame(() => setCrossfadeStarted(true))
    return () => window.cancelAnimationFrame(frame)
  }, [pendingUrl])

  useEffect(() => {
    if (!pendingUrl || !crossfadeStarted) return undefined
    const timeout = window.setTimeout(() => {
      setShownUrl(pendingUrl)
      setPendingUrl('')
      setCrossfadeStarted(false)
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [crossfadeStarted, pendingUrl])

  const selectOption = useCallback(option => {
    setSelectedOption(option)
  }, [])

  const showFallback = !shownUrl || imageError

  return (
    <section className="image-demo-configurator" ref={sectionRef} aria-label={scene.title}>
      <div className="image-demo-configurator-stage">
        <div className="image-demo-configurator-images" aria-hidden="true">
          {fallbackImage && <img className={`image-demo-configurator-fallback${showFallback ? ' is-visible' : ''}`} src={fallbackImage} alt="" loading="lazy" decoding="async" />}
          {shownUrl && <img className={`image-demo-configurator-image${crossfadeStarted ? ' is-leaving' : ' is-entering'}`} src={shownUrl} alt="" loading="lazy" decoding="async" />}
          {pendingUrl && <img className={`image-demo-configurator-image${crossfadeStarted ? ' is-entering' : ''}`} src={pendingUrl} alt="" loading="lazy" decoding="async" />}
        </div>
        <div className="image-demo-configurator-shade" />
        <div className="image-demo-configurator-copy">
          <span>PERSONALIZE A SUA CASA · {String(index + 1).padStart(2, '0')} / 03</span>
          <h2>{scene.title}</h2>
          <p>{scene.description}</p>
        </div>
        <OptionPanel
          scene={scene}
          activeOptionId={selectedOption.id}
          activeHardwareId={hardwareId}
          onSelectOption={selectOption}
          onSelectHardware={setHardwareId}
          visible={isVisible}
        />
        {selectionError && (
          <p className="image-demo-configurator-notice" role="status">
            Variante indisponível. Adicione a imagem indicada no manifest.
          </p>
        )}
      </div>
    </section>
  )
}
