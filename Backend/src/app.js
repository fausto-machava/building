import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import PDFDocument from 'pdfkit'
import nodemailer from 'nodemailer'
import { v2 as cloudinary } from 'cloudinary'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { body, validationResult } from 'express-validator'
import { ActivityLog, Client, Notification, Project, QuoteRequest, Quotation, Service, TechnicalLog, User } from './models/index.js'
import { getR2BucketName, getR2Client, getR2PublicUrl, isR2Configured } from './services/r2Storage.js'

const app = express()
const production = process.env.NODE_ENV === 'production'
const devFallbackJwtSecret = 'development-secret-key-do-not-use-in-production'

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || (production ? undefined : devFallbackJwtSecret)
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.')
  }
  return secret
}
if (production) getJwtSecret()

const configuredOrigins = (process.env.CLIENT_ORIGIN || (production ? '' : 'http://localhost:5173'))
  .split(',')
  .map(value => value.trim().replace(/\/+$/, ''))
  .filter(Boolean)
const allowedOrigins = [...new Set([
  ...configuredOrigins,
  ...(production ? ['https://arqcons.vercel.app'] : []),
])]

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

app.set('trust proxy', 1)
app.use((req, res, next) => {
  const startedAt = Date.now()
  const request = {
    method: req.method,
    path: req.path,
  }

  console.info('[HTTP] Request', JSON.stringify(request))
  res.on('finish', () => {
    console.info('[HTTP] Response', JSON.stringify({
      ...request,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    }))
  })

  next()
})
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Origin is not allowed by CORS.'))
  },
  credentials: true,
}))
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin')
    if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ message: 'Pedido recusado.' })
  }
  next()
})
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }))

const roles = {
  admin: ['admin'],
  commercial: ['admin', 'commercial-manager'],
  project: ['admin', 'project-manager'],
  all: ['admin', 'commercial-manager', 'project-manager'],
}
const statusValues = {
  'quote-requests': ['Novo', 'Em análise', 'Em contacto', 'Em elaboração de proposta', 'Proposta enviada', 'Aprovado', 'Rejeitado', 'Cancelado'],
  quotations: ['Rascunho', 'Enviada', 'Em negociação', 'Aceite', 'Rejeitada', 'Expirada'],
  projects: ['Planeamento', 'Em execução', 'Suspenso', 'Concluído', 'Cancelado'],
}
const modelMaxBytes = 1024 * 1024 * 1024
const modelChunkSize = 16 * 1024 * 1024
const modelUploadSessionLifetime = 24 * 60 * 60 * 1000
const invalidModelUploadSession = {
  code: 'R2_UPLOAD_SESSION_INVALID',
  message: 'A autorização da sessão R2 é inválida ou expirou. Inicie novamente o carregamento do modelo.',
}

function getModelUploadSession(req) {
  const { uploadId, uploadToken } = req.body
  if (!mongoose.isValidObjectId(req.params.id) || typeof uploadId !== 'string' || uploadId.length > 1024
    || typeof uploadToken !== 'string' || uploadToken.length > 4096) return null
  const projectId = new mongoose.Types.ObjectId(req.params.id).toString()
  try {
    const session = jwt.verify(uploadToken, getJwtSecret(), {
      issuer: 'arqcons-platform',
      audience: 'r2-model-upload',
    })
    if (session.projectId !== projectId || session.uploadId !== uploadId
      || typeof session.objectKey !== 'string'
      || !session.objectKey.startsWith(`arqcons/projects/${projectId}/models/`)
      || typeof session.name !== 'string'
      || !['glb', 'obj'].includes(session.format)
      || !Number.isSafeInteger(session.size) || session.size < 1 || session.size > modelMaxBytes
      || session.chunkSize !== modelChunkSize) return null
    return session
  } catch {
    return null
  }
}

function authenticate(req, res, next) {
  const token = req.cookies?.session || req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ message: 'Autenticação necessária.' })
  try {
    req.auth = jwt.verify(token, getJwtSecret(), { issuer: 'arqcons-platform' })
    next()
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' })
  }
}

function authorize(allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.auth?.role)) return res.status(403).json({ message: 'Não tem permissões para esta operação.' })
    next()
  }
}

function validateRequest(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() })
  next()
}

async function logActivity(actor, action, entity, entityId, details = '') {
  await ActivityLog.create({ actor, action, entity, entityId, details })
}

async function deleteR2Prefix(prefix) {
  const client = getR2Client()
  let continuationToken
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: getR2BucketName(),
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    const objects = (page.Contents || []).map(({ Key }) => ({ Key }))
    if (objects.length) {
      const result = await client.send(new DeleteObjectsCommand({
        Bucket: getR2BucketName(),
        Delete: { Objects: objects, Quiet: true },
      }))
      if (result.Errors?.length) throw new Error(`O Cloudflare R2 não conseguiu remover ${result.Errors.length} ficheiro(s) do tileset.`)
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
}

async function deleteR2ModelAsset(model) {
  if (model?.storage !== 'r2' || !model.publicId) return
  if (model.format === '3dtiles') {
    await deleteR2Prefix(`${model.publicId.replace(/\/+$/, '')}/`)
    return
  }
  await getR2Client().send(new DeleteObjectCommand({
    Bucket: getR2BucketName(),
    Key: model.publicId,
  }))
}

function isValidTilesetManifest(tileset) {
  const hasOnlyKeys = (value, allowedKeys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => allowedKeys.includes(key))
  if (!hasOnlyKeys(tileset, ['asset', 'geometricError', 'root'])
    || !hasOnlyKeys(tileset.asset, ['version', 'gltfUpAxis'])
    || !hasOnlyKeys(tileset.root, ['boundingVolume', 'geometricError', 'content', 'refine', 'children'])) return false
  if (tileset?.asset?.version !== '1.1' || tileset.asset.gltfUpAxis !== 'Y') return false
  const expectedUris = ['lod-2.glb', 'lod-1.glb', 'lod-0.glb']
  let tile = tileset.root
  for (let index = 0; index < expectedUris.length; index += 1) {
    const tileKeys = index < expectedUris.length - 1
      ? ['boundingVolume', 'geometricError', 'content', 'refine', 'children']
      : ['boundingVolume', 'geometricError', 'content']
    if (!hasOnlyKeys(tile, tileKeys)
      || !hasOnlyKeys(tile.boundingVolume, ['box'])
      || !hasOnlyKeys(tile.content, ['uri'])
      || !Array.isArray(tile.boundingVolume.box) || tile.boundingVolume.box.length !== 12
      || tile.boundingVolume.box.some(value => !Number.isFinite(value))
      || tile.content?.uri !== expectedUris[index]
      || !Number.isFinite(tile.geometricError) || tile.geometricError < 0) return false
    if (index < expectedUris.length - 1) {
      if (tile.refine !== 'REPLACE' || !Array.isArray(tile.children) || tile.children.length !== 1
        || tile.children[0].geometricError >= tile.geometricError) return false
      tile = tile.children[0]
    } else if (tile.geometricError !== 0 || (tile.children && tile.children.length)) {
      return false
    }
  }
  return Number.isFinite(tileset.geometricError) && tileset.geometricError >= tileset.root.geometricError
}

function cookieOptions() {
  return { httpOnly: true, secure: production, sameSite: production ? 'none' : 'strict', maxAge: 8 * 60 * 60 * 1000, path: '/api' }
}

app.post('/api/auth/login', [
  body('email').isEmail().withMessage('Introduza um email válido.').normalizeEmail(),
  body('password').isString().isLength({ min: 1, max: 200 }).withMessage('Introduza a palavra-passe.'),
  validateRequest,
], async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email, isActive: true }).select('+password')
    if (!user || !(await user.verifyPassword(req.body.password))) return res.status(401).json({ message: 'Email ou palavra-passe incorrectos.' })
    const token = jwt.sign({ sub: user.id, role: user.role }, getJwtSecret(), { expiresIn: '8h', issuer: 'arqcons-platform' })
    res.cookie('session', token, cookieOptions())
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('session', { ...cookieOptions(), maxAge: undefined })
  res.status(204).end()
})

app.get('/api/auth/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub).select('name email role isActive')
    if (!user?.isActive) return res.status(401).json({ message: 'A conta está inactiva.' })
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (error) { next(error) }
})

const acceptedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter(_req, file, callback) {
    if (!acceptedMimeTypes.has(file.mimetype)) return callback(new Error('Formato de ficheiro não permitido.'))
    callback(null, true)
  },
})

function uploadToCloudinary(file, folder = 'arqcons/quote-requests') {
  return new Promise((resolve, reject) => {
    const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'raw'
    const stream = cloudinary.uploader.upload_stream({
      resource_type: resourceType,
      folder,
      use_filename: resourceType === 'raw',
      unique_filename: true,
      filename_override: file.originalname,
    }, (error, result) => {
      if (error) return reject(error)
      resolve({ url: result.secure_url, publicId: result.public_id, name: file.originalname, type: file.mimetype, size: file.size })
    })
    stream.end(file.buffer)
  })
}

app.post('/api/quote-requests', upload.array('files', 5), [
  body('name').trim().isLength({ min: 2, max: 160 }).withMessage('Indique o seu nome completo.'),
  body('email').isEmail().withMessage('Introduza um email válido.').normalizeEmail(),
  body('phone').trim().isLength({ min: 6, max: 40 }).withMessage('Indique um telefone válido.'),
  body('location').trim().isLength({ min: 2, max: 240 }).withMessage('Indique a localização do projecto.'),
  body('service').trim().isLength({ min: 2, max: 160 }).withMessage('Seleccione o serviço pretendido.'),
  body('description').trim().isLength({ min: 5, max: 5000 }).withMessage('Descreva as necessidades do projecto.'),
  body('area').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('A área deve ser um número positivo.'),
  body('privacy').equals('true').withMessage('É necessário aceitar a política de privacidade.'),
  validateRequest,
], async (req, res, next) => {
  try {
    if (req.files?.length && !process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(503).json({ message: 'O envio de documentos está temporariamente indisponível. Tente submeter sem anexos ou contacte a empresa.' })
    }
    const files = await Promise.all((req.files || []).map(file => uploadToCloudinary(file)))
    const client = await Client.findOneAndUpdate(
      { email: req.body.email },
      { $set: { name: req.body.name, company: req.body.company || '', phone: req.body.phone, address: req.body.location }, $setOnInsert: { email: req.body.email, category: req.body.company ? 'company' : 'individual' } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
    const request = await QuoteRequest.create({
      reference: `TR-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      client: client.id,
      name: req.body.name,
      company: req.body.company || '',
      email: req.body.email,
      phone: req.body.phone,
      location: req.body.location,
      service: req.body.service,
      constructionType: req.body.constructionType || '',
      area: req.body.area ? Number(req.body.area) : undefined,
      description: req.body.description,
      budget: req.body.budget || '',
      files,
    })
    await Notification.create({
      type: 'quote-request',
      title: 'Novo pedido de orçamento',
      message: `${request.name} solicitou um orçamento para ${request.service}. Referência: ${request.reference}.`,
      relatedType: 'QuoteRequest',
      relatedId: request.id,
    })
    if (process.env.SMTP_HOST && process.env.ADMIN_EMAIL) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      })
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: process.env.ADMIN_EMAIL,
        subject: `Novo pedido ${request.reference}`,
        text: `${request.name} (${request.email}) solicitou ${request.service} em ${request.location}.`,
      })
    }
    return res.status(201).json({ reference: request.reference, message: 'Pedido registado com sucesso.' })
  } catch (error) { next(error) }
})

app.post('/api/contact', [
  body('name').trim().isLength({ min: 2, max: 160 }),
  body('email').isEmail().normalizeEmail(),
  body('subject').trim().isLength({ min: 2, max: 200 }),
  body('message').trim().isLength({ min: 3, max: 4000 }),
  validateRequest,
], async (req, res, next) => {
  try {
    await Notification.create({ type: 'contact-message', title: req.body.subject, message: `${req.body.name} <${req.body.email}>: ${req.body.message}` })
    if (process.env.SMTP_HOST && process.env.ADMIN_EMAIL) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      })
      await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: process.env.ADMIN_EMAIL, replyTo: req.body.email, subject: `Contacto: ${req.body.subject}`, text: `${req.body.name}\n${req.body.email}\n\n${req.body.message}` })
    }
    res.status(201).json({ message: 'Mensagem recebida com sucesso.' })
  } catch (error) { next(error) }
})

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function registerCrud(path, Model, allowedRoles, { searchable = [], archiveField = 'status', archiveValue = 'archived', publicFilter, hardDelete = false } = {}) {
  const router = express.Router()
  if (publicFilter) {
    router.get('/public', async (_req, res, next) => {
      try {
        const sort = Model === Project
          ? { isFeatured: -1, order: 1, createdAt: -1 }
          : { order: 1, createdAt: -1 }
        const items = await Model.find(publicFilter).sort(sort).limit(50).lean()
        res.json({ items })
      } catch (error) { next(error) }
    })
    router.get('/public/:id', async (req, res, next) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Projecto não encontrado.' })
        const item = await Model.findOne({ _id: req.params.id, ...publicFilter }).lean()
        if (!item) return res.status(404).json({ message: 'Projecto não encontrado.' })
        res.json({ item })
      } catch (error) { next(error) }
    })
  }
  router.get('/', authenticate, authorize(allowedRoles), async (req, res, next) => {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25))
      const query = {}
      if (req.query.status && Model.schema.path('status')) query.status = req.query.status
      if (req.query.search && searchable.length) {
        const expression = new RegExp(escapeRegex(String(req.query.search).slice(0, 100)), 'i')
        query.$or = searchable.map(field => ({ [field]: expression }))
      }
      if (Model === Client) query.status = { $ne: 'archived' }
      const [items, total] = await Promise.all([
        Model.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Model.countDocuments(query),
      ])
      res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
    } catch (error) { next(error) }
  })
  router.post('/', authenticate, authorize(allowedRoles), async (req, res, next) => {
    try {
      const payload = { ...req.body }
      if (Model === Quotation) {
        payload.createdBy = req.auth.sub
        payload.items = (payload.items || []).map(item => ({ ...item, subtotal: Number(item.quantity) * Number(item.unitPrice) }))
        const subtotal = payload.items.reduce((sum, item) => sum + item.subtotal, 0)
        const discount = Number(payload.discount) || 0
        const taxRate = Number(payload.taxRate) || 0
        payload.total = Math.max(0, (subtotal - discount) * (1 + taxRate / 100))
      }
      const item = await Model.create(payload)
      await logActivity(req.auth.sub, 'created', path, item.id)
      res.status(201).json({ item })
    } catch (error) { next(error) }
  })
  if (Model === Project) {
    const projectCoverUpload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
      fileFilter(_req, file, callback) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          return callback(new Error('Envie uma imagem de capa em JPG, PNG ou WebP.'))
        }
        callback(null, true)
      },
    })
    router.post('/:id/cover', authenticate, authorize(allowedRoles), projectCoverUpload.single('coverImage'), async (req, res, next) => {
      try {
        if (!req.file) return res.status(400).json({ message: 'Seleccione uma imagem de capa.' })
        if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ message: 'O carregamento de imagens requer a configuração do Cloudinary.' })
        const project = await Project.findById(req.params.id)
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })
        const cover = await uploadToCloudinary(req.file, 'arqcons/projects/covers')
        project.coverImage = cover.url
        await project.save()
        await logActivity(req.auth.sub, 'project-cover-updated', path, project.id)
        res.json({ item: project })
      } catch (error) { next(error) }
    })
    router.post('/:id/3d-assets/tileset/presign', authenticate, authorize(allowedRoles), async (req, res, next) => {
      try {
        if (!isR2Configured()) return res.status(503).json({ message: 'Configure o Cloudflare R2 no backend para carregar modelos 3D.' })
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Projecto não encontrado.' })
        const files = req.body.files
        const expectedPaths = ['tileset.json', 'lod-0.glb', 'lod-1.glb', 'lod-2.glb']
        if (!Array.isArray(files) || files.length !== expectedPaths.length
          || expectedPaths.some(path => !files.some(file => file?.path === path))
          || files.some(file => !expectedPaths.includes(file?.path)
            || !Number.isSafeInteger(file.size) || file.size < 1
            || file.size > modelMaxBytes
            || (file.path === 'tileset.json' && file.size > 1024 * 1024))
          || files.reduce((total, file) => total + file.size, 0) > 3 * modelMaxBytes) {
          return res.status(400).json({ message: 'A pasta deve conter tileset.json e os três níveis lod-0.glb, lod-1.glb e lod-2.glb, sem exceder 3 GiB no total.' })
        }

        const project = await Project.findById(req.params.id).select('_id')
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })

        const bundleId = randomUUID()
        const prefix = `arqcons/projects/${project.id}/tilesets/${bundleId}`
        const client = getR2Client()
        const uploads = await Promise.all(files.map(async file => ({
          path: file.path,
          url: await getSignedUrl(client, new PutObjectCommand({
            Bucket: getR2BucketName(),
            Key: `${prefix}/${file.path}`,
            ContentType: file.path === 'tileset.json' ? 'application/json' : 'model/gltf-binary',
            CacheControl: 'public, max-age=31536000, immutable',
          }), { expiresIn: 6 * 60 * 60 }),
        })))
        res.status(201).json({ bundleId, files: uploads })
      } catch (error) { next(error) }
    })

    router.post('/:id/3d-assets/tileset/publish', authenticate, authorize(allowedRoles), async (req, res, next) => {
      try {
        if (!isR2Configured()) return res.status(503).json({ message: 'Configure o Cloudflare R2 no backend para carregar modelos 3D.' })
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Projecto não encontrado.' })
        const { bundleId, name } = req.body
        if (typeof bundleId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bundleId)
          || typeof name !== 'string' || !name.trim() || name.trim().length > 255) {
          return res.status(400).json({ message: 'Dados do modelo 3D inválidos.' })
        }

        const project = await Project.findById(req.params.id)
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })

        const client = getR2Client()
        const prefix = `arqcons/projects/${project.id}/tilesets/${bundleId}`
        const manifestKey = `${prefix}/tileset.json`
        const manifestHead = await client.send(new HeadObjectCommand({ Bucket: getR2BucketName(), Key: manifestKey }))
        if (!manifestHead.ContentLength || manifestHead.ContentLength > 1024 * 1024) {
          return res.status(400).json({ message: 'O índice do tileset está vazio ou excede 1 MiB.' })
        }
        const manifestObject = await client.send(new GetObjectCommand({ Bucket: getR2BucketName(), Key: manifestKey }))
        let tileset
        try {
          tileset = JSON.parse(await manifestObject.Body.transformToString())
        } catch {
          return res.status(400).json({ message: 'O índice do tileset não contém JSON válido.' })
        }
        if (!isValidTilesetManifest(tileset)) {
          return res.status(400).json({ message: 'O índice deve descrever os três níveis de detalhe GLB suportados.' })
        }

        const tilePaths = ['lod-0.glb', 'lod-1.glb', 'lod-2.glb']
        const tileHeads = await Promise.all(tilePaths.map(path => client.send(new HeadObjectCommand({
          Bucket: getR2BucketName(),
          Key: `${prefix}/${path}`,
        }))))
        if (tileHeads.some(tile => !Number.isSafeInteger(tile.ContentLength) || tile.ContentLength < 1 || tile.ContentLength > modelMaxBytes)) {
          return res.status(400).json({ message: 'Um ou mais níveis de detalhe não existem ou têm um tamanho inválido.' })
        }
        const size = manifestHead.ContentLength + tileHeads.reduce((total, tile) => total + tile.ContentLength, 0)
        if (size > 3 * modelMaxBytes) return res.status(400).json({ message: 'O tileset excede o limite total de 3 GiB.' })

        const previousModel = project.model3d
        project.model3d = {
          url: getR2PublicUrl(manifestKey),
          publicId: prefix,
          name: name.trim(),
          format: '3dtiles',
          size,
          storage: 'r2',
        }
        await project.save()
        if (previousModel?.storage === 'r2' && previousModel.publicId !== prefix) {
          await deleteR2ModelAsset(previousModel)
        }
        await logActivity(req.auth.sub, '3d-assets-updated', path, project.id)
        res.json({ item: project })
      } catch (error) { next(error) }
    })

    router.post('/:id/3d-assets/tileset/abort', authenticate, authorize(allowedRoles), async (req, res, next) => {
      try {
        if (!isR2Configured()) return res.status(503).json({ message: 'Configure o Cloudflare R2 no backend para carregar modelos 3D.' })
        if (!mongoose.isValidObjectId(req.params.id)
          || typeof req.body.bundleId !== 'string'
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.body.bundleId)) {
          return res.status(400).json({ message: 'Sessão de carregamento inválida.' })
        }
        const project = await Project.findById(req.params.id).select('model3d.publicId')
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })
        const prefix = `arqcons/projects/${project.id}/tilesets/${req.body.bundleId}`
        if (project.model3d?.publicId === prefix) return res.status(409).json({ message: 'O tileset já está publicado e não pode ser removido nesta sessão.' })
        await deleteR2Prefix(`${prefix}/`)
        res.status(204).end()
      } catch (error) { next(error) }
    })

    router.post('/:id/3d-assets/model-multipart/initiate', authenticate, authorize(allowedRoles), async (req, res, next) => {
      try {
        if (!isR2Configured()) {
          return res.status(503).json({ message: 'Configure o Cloudflare R2 no backend para carregar modelos 3D.' })
        }
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Projecto não encontrado.' })

        const format = typeof req.body.format === 'string' ? req.body.format.toLowerCase() : ''
        const fileName = typeof req.body.name === 'string' ? req.body.name.trim().replace(/^.*[\\/]/, '') : ''
        const size = Number(req.body.size)
        if (!['glb', 'obj'].includes(format) || !fileName || fileName.length > 255 || /[\u0000-\u001f]/.test(fileName)
          || fileName.split('.').pop()?.toLowerCase() !== format
          || !Number.isSafeInteger(size) || size < 1 || size > modelMaxBytes) {
          return res.status(400).json({ message: 'Ficheiro inválido. Seleccione um modelo GLB ou OBJ até 1 GB.' })
        }

        const project = await Project.findById(req.params.id).select('_id')
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })

        const projectId = project._id.toString()
        const objectKey = `arqcons/projects/${projectId}/models/${randomUUID()}.${format}`
        const client = getR2Client()
        const created = await client.send(new CreateMultipartUploadCommand({
          Bucket: getR2BucketName(),
          Key: objectKey,
          ContentType: format === 'glb' ? 'model/gltf-binary' : 'model/obj',
          CacheControl: 'public, max-age=31536000, immutable',
        }))
        if (!created.UploadId) throw new Error('O Cloudflare R2 não devolveu um identificador para o upload multipart.')
        let uploadToken
        try {
          uploadToken = jwt.sign({
            projectId,
            uploadId: created.UploadId,
            objectKey,
            name: fileName,
            format,
            size,
            chunkSize: modelChunkSize,
          }, getJwtSecret(), {
            issuer: 'arqcons-platform',
            audience: 'r2-model-upload',
            expiresIn: modelUploadSessionLifetime / 1000,
          })
        } catch (error) {
          await client.send(new AbortMultipartUploadCommand({ Bucket: getR2BucketName(), Key: objectKey, UploadId: created.UploadId }))
          throw error
        }
        res.status(201).json({
          uploadId: created.UploadId,
          uploadToken,
          chunkSize: modelChunkSize,
          partCount: Math.ceil(size / modelChunkSize),
        })
      } catch (error) { next(error) }
    })

    router.post('/:id/3d-assets/model-multipart/parts', authenticate, authorize(allowedRoles), async (req, res, next) => {
      try {
        if (!isR2Configured()) return res.status(503).json({ message: 'Configure o Cloudflare R2 no backend para carregar modelos 3D.' })
        const session = getModelUploadSession(req)
        if (!session) return res.status(401).json(invalidModelUploadSession)
        const partNumbers = req.body.partNumbers
        const partCount = Math.ceil(session.size / session.chunkSize)
        if (!Array.isArray(partNumbers) || partNumbers.length < 1 || partNumbers.length > partCount
          || partNumbers.some(partNumber => !Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount)
          || new Set(partNumbers).size !== partNumbers.length) {
          return res.status(400).json({ message: 'Partes do carregamento inválidas.' })
        }

        const client = getR2Client()
        const parts = await Promise.all(partNumbers.map(async partNumber => ({
          partNumber,
          url: await getSignedUrl(client, new UploadPartCommand({
            Bucket: getR2BucketName(),
            Key: session.objectKey,
            UploadId: session.uploadId,
            PartNumber: partNumber,
          }), { expiresIn: 6 * 60 * 60 }),
        })))
        res.json({ parts })
      } catch (error) { next(error) }
    })

    router.post('/:id/3d-assets/model-multipart/complete', authenticate, authorize(allowedRoles), async (req, res, next) => {
      let completedObjectKey
      let modelSaved = false
      try {
        if (!isR2Configured()) return res.status(503).json({ message: 'Configure o Cloudflare R2 no backend para carregar modelos 3D.' })
        const session = getModelUploadSession(req)
        if (!session) return res.status(401).json(invalidModelUploadSession)
        const parts = req.body.parts
        const partCount = Math.ceil(session.size / session.chunkSize)
        if (!Array.isArray(parts) || parts.length !== partCount
          || parts.some((part, index) => part?.partNumber !== index + 1
            || typeof part.etag !== 'string'
            || !/^"?[A-Za-z0-9+/=_-]{1,128}"?$/.test(part.etag))) {
          return res.status(400).json({ message: 'A lista de partes carregadas está incompleta ou inválida.' })
        }

        const client = getR2Client()
        await client.send(new CompleteMultipartUploadCommand({
          Bucket: getR2BucketName(),
          Key: session.objectKey,
          UploadId: session.uploadId,
          MultipartUpload: {
            Parts: parts.map(part => ({ PartNumber: part.partNumber, ETag: part.etag })),
          },
        }))
        completedObjectKey = session.objectKey
        const storedObject = await client.send(new HeadObjectCommand({
          Bucket: getR2BucketName(),
          Key: session.objectKey,
        }))
        if (storedObject.ContentLength !== session.size) {
          await client.send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: session.objectKey }))
          return res.status(400).json({ message: 'O tamanho do modelo carregado não corresponde ao ficheiro seleccionado.' })
        }

        const project = await Project.findById(session.projectId)
        if (!project) {
          await client.send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: session.objectKey }))
          return res.status(404).json({ message: 'Projecto não encontrado.' })
        }
        const previousModel = project.model3d
        project.model3d = {
          url: getR2PublicUrl(session.objectKey),
          publicId: session.objectKey,
          name: session.name,
          format: session.format,
          size: session.size,
          storage: 'r2',
        }
        await project.save()
        modelSaved = true
        if (previousModel?.storage === 'r2' && previousModel.publicId !== session.objectKey) await deleteR2ModelAsset(previousModel)
        await logActivity(req.auth.sub, '3d-assets-updated', path, project.id)
        res.json({ item: project })
      } catch (error) {
        if (completedObjectKey && !modelSaved) {
          try {
            await getR2Client().send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: completedObjectKey }))
          } catch (cleanupError) {
            return next(new Error(`${error.message} A limpeza do ficheiro R2 também falhou: ${cleanupError.message}`, { cause: error }))
          }
        }
        next(error)
      }
    })

    router.post('/:id/3d-assets/model-multipart/abort', authenticate, authorize(allowedRoles), async (req, res, next) => {
      try {
        if (!isR2Configured()) return res.status(503).json({ message: 'Configure o Cloudflare R2 no backend para carregar modelos 3D.' })
        const session = getModelUploadSession(req)
        if (!session) return res.status(204).end()
        await getR2Client().send(new AbortMultipartUploadCommand({
          Bucket: getR2BucketName(),
          Key: session.objectKey,
          UploadId: session.uploadId,
        }))
        res.status(204).end()
      } catch (error) { next(error) }
    })

    router.post('/:id/3d-assets/model-signature', authenticate, authorize(allowedRoles), async (req, res, next) => {
      try {
        const { format } = req.body
        if (!['glb', 'obj'].includes(format)) return res.status(400).json({ message: 'Formato de modelo 3D inválido.' })
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
          return res.status(503).json({ message: 'O carregamento de ficheiros requer a configuração do Cloudinary.' })
        }
        const project = await Project.findById(req.params.id).select('_id')
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })

        const timestamp = Math.floor(Date.now() / 1000)
        const publicId = `arqcons/projects/models/${randomUUID()}.${format}`
        const signature = cloudinary.utils.api_sign_request(
          { public_id: publicId, timestamp },
          process.env.CLOUDINARY_API_SECRET,
        )
        res.json({
          cloudName: process.env.CLOUDINARY_CLOUD_NAME,
          apiKey: process.env.CLOUDINARY_API_KEY,
          timestamp,
          publicId,
          signature,
        })
      } catch (error) { next(error) }
    })
    router.post('/:id/3d-assets/model', authenticate, authorize(allowedRoles), async (req, res, next) => {
      try {
        const { publicId, format, name } = req.body
        const expectedPublicId = new RegExp(`^arqcons/projects/models/[0-9a-f-]{36}\\.${format === 'glb' || format === 'obj' ? format : 'invalid'}$`)
        if (typeof publicId !== 'string' || !expectedPublicId.test(publicId) || typeof name !== 'string' || !name.trim() || name.length > 255) {
          return res.status(400).json({ message: 'Dados do modelo 3D inválidos.' })
        }
        const project = await Project.findById(req.params.id)
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })

        const uploadedAsset = await cloudinary.api.resource(publicId, { resource_type: 'raw' })
        if (!uploadedAsset.secure_url || uploadedAsset.format !== format) {
          return res.status(400).json({ message: 'O ficheiro carregado não corresponde ao formato esperado.' })
        }
        project.model3d = {
          url: uploadedAsset.secure_url,
          publicId: uploadedAsset.public_id,
          name: name.trim(),
          format,
          size: uploadedAsset.bytes,
        }
        await project.save()
        await logActivity(req.auth.sub, '3d-assets-updated', path, project.id)
        res.json({ item: project })
      } catch (error) { next(error) }
    })

    const projectAssetUpload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024, files: 2 },
      fileFilter(_req, file, callback) {
        const extension = file.originalname.split('.').pop()?.toLowerCase()
        const allowed = file.fieldname === 'model'
          ? extension === 'glb'
            ? ['model/gltf-binary', 'application/octet-stream'].includes(file.mimetype)
            : extension === 'obj' && ['model/obj', 'text/plain', 'application/octet-stream', 'application/x-tgif'].includes(file.mimetype)
          : file.fieldname === 'floorPlan' && ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        if (!allowed) return callback(new Error('Envie um modelo GLB ou OBJ e/ou uma planta em JPG, PNG ou WebP.'))
        callback(null, true)
      },
    })
    router.post('/:id/3d-assets', authenticate, authorize(allowedRoles), projectAssetUpload.fields([{ name: 'model', maxCount: 1 }, { name: 'floorPlan', maxCount: 1 }]), async (req, res, next) => {
      try {
        const modelFile = req.files?.model?.[0]
        const floorPlanFile = req.files?.floorPlan?.[0]
        if (!modelFile && !floorPlanFile) return res.status(400).json({ message: 'Seleccione um modelo 3D ou uma planta para carregar.' })
        if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ message: 'O carregamento de ficheiros requer a configuração do Cloudinary.' })
        let modelFormat
        if (modelFile) {
          modelFormat = modelFile.originalname.split('.').pop().toLowerCase()
          if (modelFormat === 'glb' && modelFile.buffer.toString('ascii', 0, 4) !== 'glTF') {
            return res.status(400).json({ message: 'O ficheiro seleccionado não é um modelo GLB válido.' })
          }
          if (modelFormat === 'obj') {
            const objContents = modelFile.buffer.toString('utf8').replace(/^\uFEFF/, '')
            if (!/^\s*v\s+[-+.\d]/m.test(objContents) || !/^\s*f\s+[-+\d]/m.test(objContents)) {
              return res.status(400).json({ message: 'O ficheiro seleccionado não contém geometria OBJ válida.' })
            }
          }
        }
        const [modelAsset, planAsset] = await Promise.all([
          modelFile ? uploadToCloudinary(modelFile, 'arqcons/projects/models') : null,
          floorPlanFile ? uploadToCloudinary(floorPlanFile, 'arqcons/projects/floor-plans') : null,
        ])
        const update = {}
        if (modelAsset) update.$set = { ...update.$set, model3d: { url: modelAsset.url, publicId: modelAsset.publicId, name: modelAsset.name, format: modelFormat, size: modelFile.size } }
        if (planAsset) update.$set = { ...update.$set, floorPlan: planAsset }
        const project = await Project.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })
        await logActivity(req.auth.sub, '3d-assets-updated', path, project.id)
        res.json({ item: project })
      } catch (error) { next(error) }
    })
    const projectGalleryUpload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 10 },
      fileFilter(_req, file, callback) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          return callback(new Error('Envie imagens em JPG, PNG ou WebP.'))
        }
        callback(null, true)
      },
    })
    router.post('/:id/gallery', authenticate, authorize(allowedRoles), projectGalleryUpload.array('images', 10), async (req, res, next) => {
      try {
        if (!req.files?.length) return res.status(400).json({ message: 'Seleccione pelo menos uma imagem para carregar.' })
        if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ message: 'O carregamento de imagens requer a configuração do Cloudinary.' })
        const project = await Project.findById(req.params.id).select('gallery')
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })
        if (project.gallery.length + req.files.length > 20) {
          return res.status(400).json({ message: 'Cada projecto pode ter no máximo 20 imagens na galeria.' })
        }
        const images = await Promise.all(req.files.map(file => uploadToCloudinary(file, 'arqcons/projects/gallery')))
        project.gallery.push(...images)
        await project.save()
        await logActivity(req.auth.sub, 'project-gallery-updated', path, project.id)
        res.json({ item: project })
      } catch (error) { next(error) }
    })
  }
  router.get('/:id', authenticate, authorize(allowedRoles), async (req, res, next) => {
    try {
      const item = await Model.findById(req.params.id)
      if (!item) return res.status(404).json({ message: 'Registo não encontrado.' })
      res.json({ item })
    } catch (error) { next(error) }
  })
  router.put('/:id', authenticate, authorize(allowedRoles), async (req, res, next) => {
    try {
      const payload = { ...req.body }
      if (Model === Quotation && Array.isArray(payload.items)) {
        payload.items = payload.items.map(item => ({ ...item, subtotal: Number(item.quantity) * Number(item.unitPrice) }))
        const subtotal = payload.items.reduce((sum, item) => sum + item.subtotal, 0)
        const discount = Number(payload.discount) || 0
        const taxRate = Number(payload.taxRate) || 0
        payload.total = Math.max(0, (subtotal - discount) * (1 + taxRate / 100))
      }
      const item = await Model.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true })
      if (!item) return res.status(404).json({ message: 'Registo não encontrado.' })
      await logActivity(req.auth.sub, 'updated', path, item.id)
      res.json({ item })
    } catch (error) { next(error) }
  })
  router.patch('/:id/status', authenticate, authorize(allowedRoles), async (req, res, next) => {
    try {
      const allowedStatuses = statusValues[path]
      if (!allowedStatuses || !allowedStatuses.includes(req.body.status)) return res.status(400).json({ message: 'Estado inválido.' })
      const item = await Model.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true })
      if (!item) return res.status(404).json({ message: 'Registo não encontrado.' })
      await logActivity(req.auth.sub, 'status-updated', path, item.id, req.body.status)
      res.json({ item })
    } catch (error) { next(error) }
  })
  router.delete('/:id', authenticate, authorize(allowedRoles), async (req, res, next) => {
    try {
      let item
      if (!hardDelete && archiveField && Model.schema.path(archiveField)) {
        item = await Model.findByIdAndUpdate(req.params.id, { [archiveField]: archiveValue }, { new: true, runValidators: true })
      } else {
        item = await Model.findByIdAndDelete(req.params.id)
      }
      if (!item) return res.status(404).json({ message: 'Registo não encontrado.' })
      await logActivity(req.auth.sub, hardDelete ? 'deleted' : 'archived', path, item.id)
      res.status(204).end()
    } catch (error) { next(error) }
  })
  app.use(`/api/${path}`, router)
}

registerCrud('clients', Client, roles.commercial, { searchable: ['name', 'email', 'phone', 'company'] })
registerCrud('quote-requests', QuoteRequest, roles.commercial, { searchable: ['name', 'email', 'phone', 'service', 'reference', 'location'], archiveField: null })
registerCrud('quotations', Quotation, roles.commercial, { searchable: ['title', 'clientName'], archiveField: null })
registerCrud('projects', Project, roles.project, {
  searchable: ['title', 'name', 'location', 'category'],
  publicFilter: {
    isPublished: true,
    title: { $type: 'string', $regex: /\S/ },
    category: { $type: 'string', $regex: /\S/ },
    coverImage: { $type: 'string', $regex: /^https?:\/\/\S+/i },
  },
  hardDelete: true,
})
registerCrud('services', Service, roles.admin, { searchable: ['name', 'category'], archiveField: 'isPublished', archiveValue: false, publicFilter: { isPublished: true } })

app.get('/api/quotations/:id/pdf', authenticate, authorize(roles.commercial), async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id).lean()
    if (!quotation) return res.status(404).json({ message: 'Proposta não encontrada.' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="proposta-${quotation.id}.pdf"`)
    const document = new PDFDocument({ margin: 55 })
    document.pipe(res)
    document.fontSize(22).fillColor('#142b45').text('TRAÇO', { characterSpacing: 2 })
    document.moveDown().fontSize(18).text('Proposta comercial')
    document.moveDown().fontSize(11).fillColor('#333b45').text(`Referência: ${quotation.id}`)
    document.text(`Cliente: ${quotation.clientName}`)
    document.text(`Estado: ${quotation.status}`)
    document.moveDown().fontSize(12).text(quotation.title)
    document.moveDown()
    for (const item of quotation.items) {
      document.fontSize(10).text(`${item.description}  |  ${item.quantity} x ${item.unitPrice.toLocaleString('pt-PT')} MZN  |  ${item.subtotal.toLocaleString('pt-PT')} MZN`)
    }
    document.moveDown().fontSize(12).fillColor('#142b45').text(`Total: ${Number(quotation.total).toLocaleString('pt-PT')} MZN`)
    if (quotation.terms) document.moveDown().fontSize(9).fillColor('#555').text(`Condições: ${quotation.terms}`)
    document.end()
  } catch (error) { next(error) }
})

app.get('/api/dashboard/stats', authenticate, authorize(roles.all), async (_req, res, next) => {
  try {
    const [clients, quoteRequests, quotations, activeProjects, recentRequests, monthlyRows, activities] = await Promise.all([
      Client.countDocuments({ status: { $ne: 'archived' } }),
      QuoteRequest.countDocuments(),
      Quotation.countDocuments(),
      Project.countDocuments({ status: 'Em execução' }),
      QuoteRequest.find().sort({ createdAt: -1 }).limit(5).select('reference client name company email phone location service constructionType area description budget files status createdAt').lean(),
      QuoteRequest.aggregate([
        { $match: { createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1) } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      ActivityLog.find().sort({ createdAt: -1 }).limit(8).populate('actor', 'name').lean(),
    ])
    const monthlyMap = new Map(monthlyRows.map(row => [`${row._id.year}-${row._id.month}`, row.count]))
    const monthly = Array.from({ length: 6 }, (_value, index) => {
      const date = new Date(new Date().getFullYear(), new Date().getMonth() - 5 + index, 1)
      return { month: new Intl.DateTimeFormat('pt-PT', { month: 'short' }).format(date), count: monthlyMap.get(`${date.getFullYear()}-${date.getMonth() + 1}`) || 0 }
    })
    res.json({
      metrics: { clients, quoteRequests, quotations, activeProjects },
      monthly,
      recentRequests,
      recentActivity: activities.map(entry => ({ ...entry, actorName: entry.actor?.name || 'Sistema' })),
    })
  } catch (error) { next(error) }
})

app.get('/api/admin/logs', authenticate, authorize(roles.admin), async (req, res, next) => {
  try {
    const type = req.query.type
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = 30
    if (!['activity', 'technical'].includes(type)) {
      return res.status(400).json({ message: 'Seleccione logs de actividade ou logs técnicos.' })
    }

    const Model = type === 'activity' ? ActivityLog : TechnicalLog
    const query = Model.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
    if (type === 'activity') query.populate('actor', 'name')
    const [items, total] = await Promise.all([
      query.lean(),
      Model.countDocuments(),
    ])
    res.json({
      items: type === 'activity'
        ? items.map(item => ({ ...item, actorName: item.actor?.name || 'Sistema' }))
        : items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    })
  } catch (error) { next(error) }
})

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }))

app.use((error, req, res, _next) => {
  console.error(error)
  const statusCode = error.statusCode || error.status || 500
  TechnicalLog.create({
    name: error.name,
    message: String(error.message || 'Erro interno').slice(0, 2000),
    method: req.method,
    path: req.path,
    statusCode,
    stack: String(error.stack || '').slice(0, 8000),
  }).catch(logError => console.error('Não foi possível guardar o log técnico:', logError))
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Cada ficheiro pode ter no máximo 10 MB.' : 'Foram enviados ficheiros em excesso ou inválidos.'
    return res.status(400).json({ message })
  }
  if (error.name === 'ValidationError') return res.status(400).json({ message: Object.values(error.errors).map(item => item.message).join(' ') })
  if (error.name === 'CastError') return res.status(400).json({ message: 'Identificador inválido.' })
  if (error.code === 11000) return res.status(409).json({ message: 'Já existe um registo com estes dados.' })
  if (error.message === 'Origin is not allowed by CORS.') return res.status(403).json({ message: 'Origem não autorizada.' })
  if (error.message === 'Formato de ficheiro não permitido.' || error.message.startsWith('Envie um modelo GLB ou OBJ')
    || error.message.startsWith('Envie uma imagem de capa')) return res.status(400).json({ message: error.message })
  res.status(500).json({ message: production ? 'Ocorreu um erro interno.' : error.message })
})

export default app
