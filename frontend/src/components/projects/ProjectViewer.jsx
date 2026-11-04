import { Component, Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Center, OrbitControls, useGLTF } from '@react-three/drei'
import { Box, RotateCcw } from 'lucide-react'

const cameraViews = {
  plan: { position: [0, 14, 0.01], target: [0, 0, 0] },
  exterior: { position: [10, 7, 11], target: [0, 1, 0] },
  interior: { position: [3.7, 2.2, 3.8], target: [0, 1, 0] },
}

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

function ProjectModel({ url }) {
  const { scene } = useGLTF(url)
  return <Center><primitive object={scene} /></Center>
}

class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.props.children(this.state.failed)
  }
}

export default function ProjectViewer({ modelUrl, floorPlanUrl, title }) {
  const [mode, setMode] = useState('plan')
  const [reset, setReset] = useState(0)
  const hasModel = Boolean(modelUrl)
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
        <div className="project-canvas">
          <ModelErrorBoundary key={`${modelUrl || 'demo'}-${mode}-${reset}`}>
            {(failed) => (
              <Canvas
                key={`${mode}-${reset}-${failed}`}
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
                  {hasModel && !failed ? <ProjectModel url={modelUrl} /> : <DemoHouse mode={mode} />}
                </Suspense>
                <OrbitControls
                  key={`${mode}-${reset}`}
                  makeDefault
                  target={cameraViews[mode].target}
                  enableDamping
                  minDistance={mode === 'interior' ? 0.4 : 2}
                  maxDistance={mode === 'interior' ? 12 : 30}
                  maxPolarAngle={mode === 'plan' ? Math.PI / 2.05 : Math.PI / 1.9}
                  autoRotate={mode === 'exterior'}
                  autoRotateSpeed={0.45}
                />
              </Canvas>
            )}
          </ModelErrorBoundary>
          {hasModel && <span className="viewer-model-badge">{mode === 'interior' ? 'Interior · use um modelo com paredes/tecto em corte' : 'Modelo 3D do projecto'}</span>}
          {!hasModel && <span className="viewer-model-badge">Modelo demonstrativo · substitua pelo modelo 3D do projecto</span>}
        </div>
      </div>
      <div className="project-viewer-footnote">
        {floorPlanUrl ? <a href={floorPlanUrl} target="_blank" rel="noreferrer">Ver planta técnica em tamanho completo <Box size={14} /></a> : <span>Esta visualização é ilustrativa. Carregue um modelo GLB para apresentar o projecto real.</span>}
        {hasModel && <span>Para um tour interior visível, o modelo GLB deve incluir a casa em corte ou os espaços interiores expostos.</span>}
      </div>
      {floorPlanUrl && <figure className="project-floorplan"><figcaption><span className="eyebrow">DOCUMENTAÇÃO TÉCNICA</span><strong>Planta do projecto</strong></figcaption><a href={floorPlanUrl} target="_blank" rel="noreferrer"><img src={floorPlanUrl} alt={`Planta técnica de ${title}`} loading="lazy" /></a></figure>}
      <span className="sr-only">{title}</span>
    </section>
  )
}
