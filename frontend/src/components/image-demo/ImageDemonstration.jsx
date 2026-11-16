import { useEffect, useState } from 'react'
import api from '../../services/api'
import ConfiguratorScene from './ConfiguratorScene'
import ConstructionScrub from './ConstructionScrub'

function getAssetBase() {
  const configuredApiUrl = new URL(api.defaults.baseURL, window.location.origin)
  return `${configuredApiUrl.origin}/`
}

export default function ImageDemonstration({ project }) {
  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/demo/manifest')
      .then(({ data }) => {
        if (!active) return
        setManifest({ ...data, assetBase: data.assetBase || getAssetBase() })
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar a configuração da demonstração.')
      })
    return () => { active = false }
  }, [])

  if (!manifest) {
    return (
      <section className="image-demonstration" aria-label="Demonstração de imagens">
        <div className={`image-demo-reserved${error ? ' is-error' : ''}`} role="status">
          <span>{error || 'A preparar a demonstração de imagens...'}</span>
        </div>
      </section>
    )
  }

  const scenes = manifest.configuratorScenes || []
  const fallbackImage = project.coverImage || project.gallery?.[0]?.url

  return (
    <section className="image-demonstration" aria-label="Demonstração de imagens">
      <ConstructionScrub manifest={manifest} project={project} />
      {scenes.map((scene, index) => (
        <ConfiguratorScene
          key={scene.id}
          scene={scene}
          nextScene={scenes[index + 1]}
          index={index}
          assetBase={manifest.assetBase}
          version={manifest.version}
          fallbackImage={fallbackImage}
        />
      ))}
    </section>
  )
}
