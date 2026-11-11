import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    || (import.meta.env.PROD ? 'https://arqcons-api.onrender.com/api' : 'http://localhost:5000/api'),
  withCredentials: true,
  timeout: 20000,
})

function getRequestDetails(config) {
  const url = new URL(api.getUri(config), window.location.origin)
  return {
    method: (config.method || 'get').toUpperCase(),
    url: `${url.origin}${url.pathname}`,
  }
}

api.interceptors.request.use(config => {
  config.metadata = { startedAt: Date.now() }
  console.info('[API] Request', JSON.stringify(getRequestDetails(config)))
  return config
})

api.interceptors.response.use(
  response => {
    console.info('[API] Response', JSON.stringify({
      ...getRequestDetails(response.config),
      status: response.status,
      durationMs: Date.now() - response.config.metadata.startedAt,
    }))
    return response
  },
  error => {
    const config = error.config
    console.error('[API] Error', JSON.stringify({
      ...(config ? getRequestDetails(config) : {}),
      status: error.response?.status || 'NETWORK_ERROR',
      durationMs: config?.metadata?.startedAt
        ? Date.now() - config.metadata.startedAt
        : undefined,
      code: error.code || 'REQUEST_FAILED',
      message: error.response?.data?.message || error.message,
    }))
    return Promise.reject(error)
  },
)

export function getErrorMessage(error) {
  return error.response?.data?.message || 'Não foi possível concluir o pedido. Tente novamente.'
}

export default api
