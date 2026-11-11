import api, { getErrorMessage } from './api'

const maxModelBytes = 1024 * 1024 * 1024
const maxTilesetBytes = maxModelBytes * 3
const concurrentParts = 4
const maxAttempts = 3
const concurrentTiles = 2

export function getTilesetFilePath(file) {
  const relativePath = file.webkitRelativePath || file.name
  const segments = relativePath.split(/[\\/]/)
  return segments.slice(1).join('/') || file.name
}

function validateTilesetFiles(files) {
  const expectedPaths = ['tileset.json', 'lod-0.glb', 'lod-1.glb', 'lod-2.glb']
  const mapped = files.map(file => ({ file, path: getTilesetFilePath(file) }))
  const paths = mapped.map(item => item.path)
  const totalSize = mapped.reduce((total, item) => total + item.file.size, 0)
  if (mapped.length !== expectedPaths.length
    || expectedPaths.some(path => !paths.includes(path))
    || mapped.some(({ file, path }) => !expectedPaths.includes(path) || !file.size || file.size > maxModelBytes)
    || mapped.find(item => item.path === 'tileset.json').file.size > 1024 * 1024
    || totalSize > maxTilesetBytes) {
    throw new Error('Seleccione uma pasta com tileset.json e lod-0.glb, lod-1.glb e lod-2.glb, até 3 GiB no total.')
  }
  return { mapped, totalSize }
}

function uploadTileFile(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    request.setRequestHeader('Content-Type', contentType)
    request.setRequestHeader('Cache-Control', 'public, max-age=31536000, immutable')
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded)
    }
    request.onerror = () => reject(new Error('Falha de rede ao enviar um nível de detalhe para o Cloudflare R2.'))
    request.onabort = () => reject(new Error('O envio do tileset foi cancelado.'))
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`O Cloudflare R2 rejeitou um ficheiro do tileset (HTTP ${request.status}).`))
        return
      }
      resolve()
    }
    request.send(file)
  })
}

function uploadPart(url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded)
    }
    request.onerror = () => reject(new Error('Falha de rede ao enviar uma parte do modelo para o Cloudflare R2.'))
    request.onabort = () => reject(new Error('O envio de uma parte do modelo foi cancelado.'))
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        const error = new Error(`O Cloudflare R2 rejeitou uma parte do modelo (HTTP ${request.status}).`)
        error.status = request.status
        reject(error)
        return
      }
      const etag = request.getResponseHeader('ETag')
      if (!etag) {
        reject(new Error('O bucket R2 precisa expor o cabeçalho ETag na configuração CORS.'))
        return
      }
      resolve(etag)
    }
    request.send(blob)
  })
}

function wait(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds))
}

async function uploadProjectModelAttempt(projectId, file, format, onProgress) {
  const { data: session } = await api.post(`/projects/${projectId}/3d-assets/model-multipart/initiate`, {
    name: file.name,
    format,
    size: file.size,
  })

  let uploadStage = 'a obter os endereços das partes'
  try {
    const partNumbers = Array.from({ length: session.partCount }, (_value, index) => index + 1)
    const { data } = await api.post(`/projects/${projectId}/3d-assets/model-multipart/parts`, {
      uploadId: session.uploadId,
      uploadToken: session.uploadToken,
      partNumbers,
    })
    const urls = new Map(data.parts.map(part => [part.partNumber, part.url]))
    uploadStage = 'a enviar as partes para o R2'
    const uploadedParts = new Array(session.partCount)
    const loadedBytes = new Array(session.partCount).fill(0)
    let nextPart = 0
    let failure
    const updateProgress = () => {
      const uploadedBytes = loadedBytes.reduce((total, loaded) => total + loaded, 0)
      onProgress(Math.min(99, Math.floor((uploadedBytes / file.size) * 100)))
    }

    const workers = Array.from({ length: Math.min(concurrentParts, session.partCount) }, async () => {
      while (!failure) {
        const partIndex = nextPart
        nextPart += 1
        if (partIndex >= session.partCount) return

        const partNumber = partIndex + 1
        const start = partIndex * session.chunkSize
        const end = Math.min(file.size, start + session.chunkSize)
        const blob = file.slice(start, end)
        let partUrl = urls.get(partNumber)
        let lastError
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          try {
            const etag = await uploadPart(partUrl, blob, loaded => {
              loadedBytes[partIndex] = loaded
              updateProgress()
            })
            loadedBytes[partIndex] = blob.size
            uploadedParts[partIndex] = { partNumber, etag }
            updateProgress()
            lastError = null
            break
          } catch (error) {
            lastError = error
            loadedBytes[partIndex] = 0
            updateProgress()
            if (error.status && error.status < 500 && error.status !== 429) break
            if (attempt < maxAttempts - 1) {
              try {
                await wait(400 * (2 ** attempt) + Math.floor(Math.random() * 250))
                const { data: refreshed } = await api.post(`/projects/${projectId}/3d-assets/model-multipart/parts`, {
                  uploadId: session.uploadId,
                  uploadToken: session.uploadToken,
                  partNumbers: [partNumber],
                })
                partUrl = refreshed.parts[0]?.url
              } catch (refreshError) {
                lastError = refreshError
                break
              }
            }
          }
        }
        if (lastError) {
          const partError = lastError.response ? getErrorMessage(lastError) : lastError.message || getErrorMessage(lastError)
          failure = new Error(`Falha ao enviar a parte ${partNumber} de ${session.partCount}: ${partError}`, { cause: lastError })
          return
        }
      }
    })

    await Promise.all(workers)
    if (failure) throw failure
    uploadStage = 'a concluir o envio do modelo'
    const { data: result } = await api.post(`/projects/${projectId}/3d-assets/model-multipart/complete`, {
      uploadId: session.uploadId,
      uploadToken: session.uploadToken,
      parts: uploadedParts,
    })
    onProgress(100)
    return result
  } catch (error) {
    try {
      await api.post(`/projects/${projectId}/3d-assets/model-multipart/abort`, {
        uploadId: session.uploadId,
        uploadToken: session.uploadToken,
      })
    } catch (cleanupError) {
      if (cleanupError.response?.status !== 404) {
        const uploadError = error.response ? getErrorMessage(error) : error.message || getErrorMessage(error)
        throw new Error(`${uploadError} Não foi possível limpar a sessão R2: ${getErrorMessage(cleanupError)}`)
      }
    }
    const uploadError = error.response ? getErrorMessage(error) : error.message || getErrorMessage(error)
    throw new Error(`Falha ${uploadStage}: ${uploadError}`, { cause: error })
  }
}

function hasInvalidUploadSession(error) {
  for (let current = error; current; current = current.cause) {
    if (current.response?.data?.code === 'R2_UPLOAD_SESSION_INVALID') return true
  }
  return false
}

export async function uploadProjectModel(projectId, file, onProgress) {
  const format = file.name.split('.').pop()?.toLowerCase()
  if (!['glb', 'obj'].includes(format)) throw new Error('Seleccione um modelo GLB ou OBJ.')
  if (!file.size || file.size > maxModelBytes) throw new Error('O modelo 3D deve ter até 1 GB.')

  try {
    return await uploadProjectModelAttempt(projectId, file, format, onProgress)
  } catch (error) {
    if (!hasInvalidUploadSession(error)) throw error
    onProgress(0)
    return uploadProjectModelAttempt(projectId, file, format, onProgress)
  }
}

export async function uploadProjectTileset(projectId, files, onProgress) {
  const { mapped, totalSize } = validateTilesetFiles(Array.from(files))
  const { data: session } = await api.post(`/projects/${projectId}/3d-assets/tileset/presign`, {
    files: mapped.map(({ file, path }) => ({ path, size: file.size })),
  })
  const urls = new Map(session.files.map(item => [item.path, item.url]))
  const loadedBytes = new Map(mapped.map(({ path }) => [path, 0]))
  let nextFile = 0
  let failure
  const updateProgress = () => {
    const loaded = [...loadedBytes.values()].reduce((total, bytes) => total + bytes, 0)
    onProgress(Math.min(99, Math.floor(loaded / totalSize * 100)))
  }
  const workers = Array.from({ length: Math.min(concurrentTiles, mapped.length) }, async () => {
    while (!failure) {
      const index = nextFile
      nextFile += 1
      if (index >= mapped.length) return
      const { file, path } = mapped[index]
      const contentType = path === 'tileset.json' ? 'application/json' : 'model/gltf-binary'
      try {
        await uploadTileFile(urls.get(path), file, contentType, loaded => {
          loadedBytes.set(path, loaded)
          updateProgress()
        })
        loadedBytes.set(path, file.size)
        updateProgress()
      } catch (error) {
        failure = error
      }
    }
  })

  try {
    await Promise.all(workers)
    if (failure) throw failure
    const relativePath = mapped[0].file.webkitRelativePath || ''
    const name = relativePath.split(/[\\/]/)[0] || 'Modelo optimizado'
    const { data } = await api.post(`/projects/${projectId}/3d-assets/tileset/publish`, {
      bundleId: session.bundleId,
      name,
    })
    onProgress(100)
    return data
  } catch (error) {
    try {
      await api.post(`/projects/${projectId}/3d-assets/tileset/abort`, { bundleId: session.bundleId })
    } catch (cleanupError) {
      if (cleanupError.response?.status !== 404 && cleanupError.response?.status !== 409) {
        const uploadError = error.response ? getErrorMessage(error) : error.message || getErrorMessage(error)
        throw new Error(`${uploadError} Não foi possível limpar os ficheiros temporários R2: ${getErrorMessage(cleanupError)}`)
      }
    }
    const uploadError = error.response ? getErrorMessage(error) : error.message || getErrorMessage(error)
    throw new Error(`Falha ao publicar o tileset: ${uploadError}`, { cause: error })
  }
}
