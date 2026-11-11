import { S3Client } from '@aws-sdk/client-s3'

const requiredVariables = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
]

let client

export function isR2Configured() {
  if (!requiredVariables.every(name => Boolean(process.env[name]?.trim()))) return false
  try {
    return new URL(process.env.R2_PUBLIC_URL).protocol === 'https:'
  } catch {
    return false
  }
}

export function getR2Client() {
  if (!isR2Configured()) {
    throw new Error(`Configure as variáveis ${requiredVariables.join(', ')} para activar uploads de modelos 3D no Cloudflare R2.`)
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  }
  return client
}

export function getR2BucketName() {
  return process.env.R2_BUCKET_NAME
}

export function getR2PublicUrl(objectKey) {
  const baseUrl = process.env.R2_PUBLIC_URL.replace(/\/+$/, '')
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/')
  return `${baseUrl}/${encodedKey}`
}
