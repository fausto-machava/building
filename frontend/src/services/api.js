import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    || (import.meta.env.PROD ? 'https://traco-api-qjz6.onrender.com/api' : 'http://localhost:5000/api'),
  withCredentials: true,
  timeout: 20000,
})

export function getErrorMessage(error) {
  return error.response?.data?.message || 'Não foi possível concluir o pedido. Tente novamente.'
}

export default api
