import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Center, OrbitControls } from '@react-three/drei'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { Sphere } from 'three'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/three/plugins'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { Box, RotateCcw } from 'lucide-react'

const cameraViews = {
  plan: { position: [0, 14, 0.01], target: [0, 0, 0] },
  exterior: { position: [10, 7, 11], target: [0, 1, 0] },
  interior: { position: [3.7, 2.2, 3.8], target: [0, 1, 0] },
}
const maxViewerModelBytes = 50 * 1024 * 1024
const tilesetPluginOptions = { meshoptDecoder: MeshoptDecoder }

function DemoHouse({ mode }) {
  const cutaway = mode !== 'exterior'
  const wallHeight = mode === 'plan' ? 0.16 : 2.7
  const transparentWall = mode === 'plan' ? 0.92 : 1

  return (
    <group>
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[8, 0.24, 6]} />
        <meshStandardMaterial color="#d7cdbb" roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.28, 0]}>
        <boxGeometry args={[8.5, 0.08, 6.5]} />
        <meshStandardMaterial color="#b99a62" />
      </mesh>
      {[
        { position: [0, wallHeight / 2, -2.95], size: [8, wallHeight, 0.16] },
        { position: [-3.95, wallHeight / 2, 0], size: [0.16, wallHeight, 6] },
        { position: [3.95, wallHeight / 2, 0], size: [0.16, wallHeight, 6] },
        ...(!cutaway ? [{ position: [0, wallHeight / 2, 2.95], size: [8, wallHeight, 0.16] }] : []),
        ...(cutaway && mode === 'plan' ? [{ position: [0, wallHeight / 2, 2.95], size: [3, wallHeight, 0.16] }] : []),
      ].map((wall, index) => (
        <mesh key={index} position={wall.position} castShadow>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color={mode === 'plan' ? '#b5aa98' : '#f1ede5'} transparent opacity={transparentWall} roughness={0.82} />
        </mesh>
      ))}
      {mode === 'exterior' && (
        <>
          <mesh position={[0, 2.86, 0]} castShadow>
            <boxGeometry args={[8.25, 0.22, 6.25]} />
            <meshStandardMaterial color="#263c4b" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.15, 3.04]}>
            <boxGeometry args={[1.15, 2.3, 0.05]} />
            <meshStandardMaterial color="#a47c4c" roughness={0.55} />
          </mesh>
          {[-2.2, -0.7, 1.3, 2.8].map(x => (
            <mesh key={x} position={[x, 1.75, 3.045]}>
              <boxGeometry args={[0.85, 0.82, 0.04]} />
              <meshStandardMaterial color="#94b7c1" metalness={0.18} roughness={0.2} />
            </mesh>
          ))}
          <mesh position={[0, -0.58, 0]}>
            <boxGeometry args={[80, 0.45, 80]} />
            <meshStandardMaterial color="#d9d4c9" />
          </mesh>
        </>
      )}
      {mode !== 'exterior' && (
        <>
          <mesh position={[-1.95, 0.42, -1.05]} castShadow>
            <boxGeometry args={[2.8, 0.5, 1.15]} />
            <meshStandardMaterial color="#71838a" roughness={0.92} />
          </mesh>
          <mesh position={[-1.95, 0.73, -1.55]} castShadow>
            <boxGeometry args={[2.8, 0.14, 0.18]} />
            <meshStandardMaterial color="#546970" />
          </mesh>
          <mesh position={[1.55, 0.42, -1.7]} castShadow>
            <boxGeometry args={[1.55, 0.72, 0.62]} />
            <meshStandardMaterial color="#b99a62" roughness={0.76} />
          </mesh>
          <mesh position={[1.2, 0.35, 1.18]} castShadow>
            <boxGeometry args={[2.2, 0.45, 1.75]} />
            <meshStandardMaterial color="#b9a895" roughness={0.9} />
          </mesh>
          <mesh position={[1.2, 0.61, 1.18]}>
            <boxGeometry args={[2.25, 0.1, 1.8]} />
            <meshStandardMaterial color="#eee5d7" roughness={0.95} />
          </mesh>
          <mesh position={[-1.8, 0.54, 1.1]}>
            <boxGeometry args={[1.2, 0.16, 1.15]} />
            <meshStandardMaterial color="#b99a62" roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.2, 1.2]} />
            <meshBasicMaterial color="#b99a62" transparent opacity={0.2} />
          </mesh>
        </>
      )}
    </group>
  )
}

function hasMeshes(node) {
  if (node.isMesh) return true
  return node.children.some(hasMeshes)
}

function getNamedParts(root) {
  const parts = []
  let index = 0
  const genericNames = new Set(['default', 'mesh', 'group', 'object', 'scene'])

  function visit(node, hasNamedParent = false) {
    const name = node.name?.trim()
    const isNamedPart = node !== root && name && !genericNames.has(name.toLowerCase()) && hasMeshes(node)
    if (isNamedPart && !hasNamedParent) {
      parts.push({ id: `part-${index++}`, name, node })
      return
    }
    node.children.forEach(child => visit(child, hasNamedParent || Boolean(isNamedPart)))
  }

  visit(root)
  return parts
}

function ProjectModel({ url, format, selectedPart, onPartsChange, onModelLoaded }) {
  const loadedModel = useLoader(format === 'obj' ? OBJLoader : GLTFLoader, url)
  const source = format === 'obj' ? loadedModel : loadedModel.scene
  const scene = useMemo(() => source.clone(true), [source])
  const parts = useMemo(() => getNamedParts(scene), [scene])
  const selectedNode = parts.find(part => part.id === selectedPart)
  const displayedScene = useMemo(
    () => selectedNode ? selectedNode.node.clone(true) : scene,
    [scene, selectedNode],
  )

  useEffect(() => {
    onPartsChange(parts.map(({ id, name }) => ({ id, name })))
  }, [onPartsChange, parts])

  useEffect(() => {
    onModelLoaded(url)
  }, [onModelLoaded, url])

  return <Center key={selectedPart || 'all'}><primitive object={displayedScene} /></Center>
}

function setTilesCameraView(camera, controls, bounds, mode) {
  const radius = Math.max(bounds.radius, 0.5)
  const distance = radius * 2.8
  const position = mode === 'plan'
    ? [bounds.center.x, bounds.center.y + distance * 1.8, bounds.center.z + 0.01]
    : mode === 'interior'
      ? [bounds.center.x + radius * 0.8, bounds.center.y + radius * 0.45, bounds.center.z + radius * 0.8]
      : [bounds.center.x + distance, bounds.center.y + distance * 0.7, bounds.center.z + distance]
  controls.target.copy(bounds.center)
  camera.position.set(...position)
  camera.fov = mode === 'plan' ? 42 : 46
  camera.near = Math.max(radius / 1000, 0.01)
  camera.far = Math.max(radius * 100, 1000)
  camera.updateProjectionMatrix()
  controls.update()
}

function ProjectTiles({ url, mode, reset, controlsRef, onModelLoaded, onError }) {
  const rendererRef = useRef(null)
  const bounds = useMemo(() => new Sphere(), [])
  const fitted = useRef(false)
  const fittedView = useRef('')
  const reportedError = useRef(false)
  const hasLoadedTile = useRef(false)
  const { camera } = useThree()

  useEffect(() => {
    fitted.current = false
    fittedView.current = ''
    reportedError.current = false
    hasLoadedTile.current = false
  }, [url])

  useFrame(() => {
    if (!controlsRef.current) return
    const tilesRenderer = rendererRef.current
    if (!tilesRenderer) return
    const tilesGroup = tilesRenderer.group
    if (tilesGroup.rotation.x !== -Math.PI / 2) {
      tilesGroup.rotation.x = -Math.PI / 2
      tilesGroup.updateMatrixWorld(true)
    }
    if (!fitted.current) {
      if (!tilesRenderer.getBoundingSphere(bounds) || bounds.radius <= 0) return
      bounds.applyMatrix4(tilesGroup.matrixWorld)
      fitted.current = true
    }
    const view = `${mode}-${reset}`
    if (fittedView.current !== view) {
      setTilesCameraView(camera, controlsRef.current, bounds, mode)
      fittedView.current = view
    }
  })

  return (
    <TilesRenderer
      ref={rendererRef}
      url={url}
      errorTarget={24}
      lruCache-maxBytesSize={128 * 1024 * 1024}
      lruCache-minBytesSize={32 * 1024 * 1024}
      onLoadModel={() => {
        hasLoadedTile.current = true
        onModelLoaded(url)
      }}
      onLoadError={event => {
        if (!reportedError.current && !hasLoadedTile.current) {
          reportedError.current = true
          onError(event.error)
        }
      }}
    >
      <TilesPlugin plugin={GLTFExtensionsPlugin} args={tilesetPluginOptions} />
    </TilesRenderer>
  )
}

class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    this.props.onError(error)
  }

  render() {
    return this.props.children(this.state.error)
  }
}

export default function ProjectViewer({ modelUrl, modelFormat, modelSize, floorPlanUrl, title }) {
  const [mode, setMode] = useState('plan')
  const [reset, setReset] = useState(0)
  const [parts, setParts] = useState([])
  const [selectedPart, setSelectedPart] = useState('')
  const [readyModelUrl, setReadyModelUrl] = useState('')
  const [loadableModelUrl, setLoadableModelUrl] = useState('')
  const [loadedModelUrl, setLoadedModelUrl] = useState('')
  const [modelError, setModelError] = useState(null)
  const [modelSizeStatus, setModelSizeStatus] = useState('idle')
  const [checkedModelSize, setCheckedModelSize] = useState(0)
  const [sizeCheckError, setSizeCheckError] = useState('')
  const [sizeCheckAttempt, setSizeCheckAttempt] = useState(0)
  const canvasRef = useRef(null)
  const controlsRef = useRef(null)
  const hasModel = Boolean(modelUrl)
  const format = modelFormat || (/\.obj(?:$|[?#])/i.test(modelUrl || '') ? 'obj' : 'glb')
  const updateParts = useCallback(nextParts => setParts(nextParts), [])

  useEffect(() => {
    setParts([])
    setSelectedPart('')
    setLoadableModelUrl('')
    setLoadedModelUrl('')
    setModelError(null)
    setModelSizeStatus('idle')
    setCheckedModelSize(0)
    setSizeCheckError('')
    if (!modelUrl) return undefined

    const canvasElement = canvasRef.current
    if (!canvasElement || !('IntersectionObserver' in window)) {
      setReadyModelUrl(modelUrl)
      return undefined
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReadyModelUrl(modelUrl)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(canvasElement)
    return () => observer.disconnect()
  }, [modelUrl, format])

  useEffect(() => {
    if (!modelUrl || readyModelUrl !== modelUrl) return undefined

    if (format === '3dtiles') {
      setModelSizeStatus('loading')
      setLoadableModelUrl(modelUrl)
      return () => setLoadableModelUrl('')
    }

    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 10000)

    async function checkModelSize() {
      setModelSizeStatus('checking')
      setSizeCheckError('')
      try {
        let size = Number(modelSize)
        if (!Number.isSafeInteger(size) || size <= 0) {
          const response = await fetch(modelUrl, { method: 'HEAD', mode: 'cors', signal: controller.signal })
          if (!response.ok) throw new Error(`O servidor respondeu com HTTP ${response.status}.`)
          size = Number(response.headers.get('content-length'))
        }

        if (!Number.isSafeInteger(size) || size <= 0) {
          throw new Error('O servidor não informou o tamanho do ficheiro.')
        }
        if (!active) return

        setCheckedModelSize(size)
        if (size > maxViewerModelBytes) {
          setModelSizeStatus('too-large')
          return
        }

        setModelSizeStatus('loading')
        setLoadableModelUrl(modelUrl)
      } catch (error) {
        if (!active || controller.signal.aborted) {
          if (active) {
            setModelSizeStatus('error')
            setSizeCheckError('A verificação do tamanho excedeu o tempo limite.')
          }
          return
        }
        setModelSizeStatus('error')
        setSizeCheckError(error.message || 'Não foi possível verificar o tamanho do ficheiro.')
      } finally {
        window.clearTimeout(timeout)
      }
    }

    checkModelSize()
    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [modelUrl, modelSize, format, readyModelUrl, sizeCheckAttempt])

  function retryModel() {
    if (modelSizeStatus === 'error') {
      setSizeCheckAttempt(value => value + 1)
      return
    }
    if (format !== '3dtiles') useLoader.clear(format === 'obj' ? OBJLoader : GLTFLoader, modelUrl)
    setModelError(null)
    setLoadedModelUrl('')
    setLoadableModelUrl('')
    setModelSizeStatus('checking')
    setSizeCheckAttempt(value => value + 1)
    setReset(value => value + 1)
  }

  const views = [
    { id: 'plan', label: 'Planta 3D' },
    { id: 'exterior', label: 'Exterior' },
    { id: 'interior', label: 'Interior' },
  ]

  return (
    <section className="project-viewer-section">
      <div className="project-viewer-heading">
        <div>
          <span className="eyebrow">EXPERIÊNCIA IMERSIVA</span>
          <h2>Explore o projecto em <em>3D.</em></h2>
        </div>
        <span className="viewer-hint"><Box size={15} /> Arraste para rodar · scroll para aproximar</span>
      </div>
      <div className="project-viewer">
        <div className="project-viewer-toolbar">
          <div className="viewer-modes" role="tablist" aria-label="Vistas do projecto">
            {views.map(view => (
              <button key={view.id} role="tab" aria-selected={mode === view.id} className={mode === view.id ? 'viewer-mode active' : 'viewer-mode'} onClick={() => setMode(view.id)}>
                {view.label}
              </button>
            ))}
          </div>
          <button className="viewer-reset" onClick={() => setReset(value => value + 1)}><RotateCcw size={14} /> Repor vista</button>
        </div>
        {parts.length > 0 && (
          <div className="viewer-part-selector">
            <label htmlFor="viewer-part">Compartimento</label>
            <select id="viewer-part" value={selectedPart} onChange={event => setSelectedPart(event.target.value)}>
              <option value="">Todos os compartimentos</option>
              {parts.map(part => <option key={part.id} value={part.id}>{part.name}</option>)}
            </select>
            <span>Os compartimentos são identificados pelos nomes dos grupos no modelo 3D.</span>
          </div>
        )}
        <div className="project-canvas" ref={canvasRef}>
          {hasModel && readyModelUrl !== modelUrl && (
            <div className="viewer-model-loading" role="status">O modelo 3D será carregado quando esta área estiver próxima do ecrã.</div>
          )}
          {hasModel && readyModelUrl === modelUrl && ['checking', 'loading'].includes(modelSizeStatus) && loadedModelUrl !== modelUrl && !modelError && (
            <div className="viewer-model-loading" role="status">{modelSizeStatus === 'checking' ? 'A verificar o tamanho do modelo 3D...' : 'A carregar modelo 3D...'}</div>
          )}
          {hasModel && modelSizeStatus === 'too-large' && (
            <div className="viewer-model-error" role="alert">
              <p>Este modelo tem {(checkedModelSize / (1024 * 1024)).toLocaleString('pt-PT', { maximumFractionDigits: 0 })} MiB. Para evitar bloquear o navegador, a visualização interactiva está limitada a 50 MiB.</p>
              <a href={modelUrl} target="_blank" rel="noreferrer">Abrir o ficheiro original</a>
            </div>
          )}
          {hasModel && modelSizeStatus === 'error' && (
            <div className="viewer-model-error" role="alert">
              <p>Não foi possível verificar o tamanho do modelo. Por segurança, não será carregado no navegador. {sizeCheckError}</p>
              <button type="button" onClick={retryModel}>Tentar novamente</button>
            </div>
          )}
          {modelError && (
            <div className="viewer-model-error" role="alert">
              <p>Não foi possível carregar o modelo 3D.{modelError.message ? ` ${modelError.message}` : ''}</p>
              <button type="button" onClick={retryModel}>Tentar novamente</button>
            </div>
          )}
          <ModelErrorBoundary key={`${modelUrl || 'demo'}-${format}-${reset}`} onError={setModelError}>
            {(error) => (
              <Canvas
                key={format === '3dtiles' ? 'tiles' : `${mode}-${reset}-${Boolean(error)}`}
                camera={{ position: cameraViews[mode].position, fov: mode === 'plan' ? 42 : 46 }}
                shadows
                dpr={[1, 1.5]}
                gl={{ antialias: true, alpha: false }}
              >
                <color attach="background" args={['#edf0ef']} />
                <ambientLight intensity={1.2} />
                <directionalLight position={[7, 10, 5]} intensity={2} castShadow />
                <directionalLight position={[-5, 4, -4]} intensity={0.55} />
                <Suspense fallback={null}>
                  {hasModel && loadableModelUrl === modelUrl && !error
                    ? format === '3dtiles'
                      ? <ProjectTiles url={modelUrl} mode={mode} reset={reset} controlsRef={controlsRef} onModelLoaded={setLoadedModelUrl} onError={setModelError} />
                      : <ProjectModel url={modelUrl} format={format} selectedPart={selectedPart} onPartsChange={updateParts} onModelLoaded={setLoadedModelUrl} />
                    : !hasModel ? <DemoHouse mode={mode} /> : null}
                </Suspense>
                <OrbitControls
                  ref={controlsRef}
                  key={`${mode}-${reset}`}
                  makeDefault
                  target={cameraViews[mode].target}
                  enableDamping
                  minDistance={format === '3dtiles' ? 0.1 : mode === 'interior' ? 0.4 : 2}
                  maxDistance={format === '3dtiles' ? 1000000 : mode === 'interior' ? 12 : 30}
                  maxPolarAngle={mode === 'plan' ? Math.PI / 2.05 : Math.PI / 1.9}
                  autoRotate={mode === 'exterior'}
                  autoRotateSpeed={0.45}
                />
              </Canvas>
            )}
          </ModelErrorBoundary>
          {hasModel && loadedModelUrl === modelUrl && <span className="viewer-model-badge">{mode === 'interior' ? 'Interior · use um modelo com paredes/tecto em corte' : 'Modelo 3D do projecto'}</span>}
          {!hasModel && <span className="viewer-model-badge">Modelo demonstrativo · substitua pelo modelo 3D do projecto</span>}
        </div>
      </div>
      <div className="project-viewer-footnote">
        {floorPlanUrl ? <a href={floorPlanUrl} target="_blank" rel="noreferrer">Ver planta técnica em tamanho completo <Box size={14} /></a> : <span>Esta visualização é ilustrativa. Carregue um modelo GLB ou OBJ para apresentar o projecto real.</span>}
        {hasModel && <span>Para seleccionar compartimentos, os elementos do modelo devem ter nomes distintos.</span>}
      </div>
      {floorPlanUrl && <figure className="project-floorplan"><figcaption><span className="eyebrow">DOCUMENTAÇÃO TÉCNICA</span><strong>Planta do projecto</strong></figcaption><a href={floorPlanUrl} target="_blank" rel="noreferrer"><img src={floorPlanUrl} alt={`Planta técnica de ${title}`} loading="lazy" /></a></figure>}
      <span className="sr-only">{title}</span>
    </section>
  )
}
