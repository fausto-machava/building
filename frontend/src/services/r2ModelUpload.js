import api, { getErrorMessage } from './api'

const maxModelBytes = 1024 * 1024 * 1024
const concurrentParts = 4
const maxAttempts = 3

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
