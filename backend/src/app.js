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
import { body, validationResult } from 'express-validator'
import { ActivityLog, Client, Notification, Project, QuoteRequest, Quotation, Service, User } from './models/index.js'

const app = express()
const port = Number(process.env.PORT) || 5000
const production = process.env.NODE_ENV === 'production'
const configuredOrigins = (process.env.CLIENT_ORIGIN || (production ? '' : 'http://localhost:5173'))
  .split(',')
  .map(value => value.trim().replace(/\/+$/, ''))
  .filter(Boolean)
const allowedOrigins = [...new Set([
  ...configuredOrigins,
  ...(production ? ['https://building-lyart.vercel.app'] : []),
])]

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.')
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

app.set('trust proxy', 1)
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

function authenticate(req, res, next) {
  const token = req.cookies?.session || req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ message: 'Autenticação necessária.' })
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'traco-platform' })
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
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'traco-platform' })
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

function uploadToCloudinary(file, folder = 'traco/quote-requests') {
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

function registerCrud(path, Model, allowedRoles, { searchable = [], archiveField = 'status', archiveValue = 'archived', publicFilter } = {}) {
  const router = express.Router()
  if (publicFilter) {
    router.get('/public', async (_req, res, next) => {
      try {
        const items = await Model.find(publicFilter).sort({ order: 1, createdAt: -1 }).limit(50).lean()
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
    const projectAssetUpload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024, files: 2 },
      fileFilter(_req, file, callback) {
        const allowed = file.fieldname === 'model'
          ? ['model/gltf-binary', 'application/octet-stream'].includes(file.mimetype) && /\.glb$/i.test(file.originalname)
          : file.fieldname === 'floorPlan' && ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        if (!allowed) return callback(new Error('Envie um modelo GLB e/ou uma planta em JPG, PNG ou WebP.'))
        callback(null, true)
      },
    })
    router.post('/:id/3d-assets', authenticate, authorize(allowedRoles), projectAssetUpload.fields([{ name: 'model', maxCount: 1 }, { name: 'floorPlan', maxCount: 1 }]), async (req, res, next) => {
      try {
        const modelFile = req.files?.model?.[0]
        const floorPlanFile = req.files?.floorPlan?.[0]
        if (!modelFile && !floorPlanFile) return res.status(400).json({ message: 'Seleccione um modelo 3D ou uma planta para carregar.' })
        if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ message: 'O carregamento de ficheiros requer a configuração do Cloudinary.' })
        if (modelFile && modelFile.buffer.toString('ascii', 0, 4) !== 'glTF') {
          return res.status(400).json({ message: 'O ficheiro seleccionado não é um modelo GLB válido.' })
        }
        const [modelAsset, planAsset] = await Promise.all([
          modelFile ? uploadToCloudinary(modelFile, 'traco/projects/models') : null,
          floorPlanFile ? uploadToCloudinary(floorPlanFile, 'traco/projects/floor-plans') : null,
        ])
        const update = {}
        if (modelAsset) update.model3d = { url: modelAsset.url, publicId: modelAsset.publicId, name: modelAsset.name }
        if (planAsset) update.floorPlan = planAsset
        const project = await Project.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
        if (!project) return res.status(404).json({ message: 'Projecto não encontrado.' })
        await logActivity(req.auth.sub, '3d-assets-updated', path, project.id)
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
      if (archiveField && Model.schema.path(archiveField)) {
        item = await Model.findByIdAndUpdate(req.params.id, { [archiveField]: archiveValue }, { new: true, runValidators: true })
      } else {
        item = await Model.findByIdAndDelete(req.params.id)
      }
      if (!item) return res.status(404).json({ message: 'Registo não encontrado.' })
      await logActivity(req.auth.sub, 'archived', path, item.id)
      res.status(204).end()
    } catch (error) { next(error) }
  })
  app.use(`/api/${path}`, router)
}

registerCrud('clients', Client, roles.commercial, { searchable: ['name', 'email', 'phone', 'company'] })
registerCrud('quote-requests', QuoteRequest, roles.commercial, { searchable: ['name', 'email', 'phone', 'service', 'reference', 'location'], archiveField: null })
registerCrud('quotations', Quotation, roles.commercial, { searchable: ['title', 'clientName'], archiveField: null })
registerCrud('projects', Project, roles.project, { searchable: ['title', 'name', 'location', 'category'], archiveField: 'isPublished', archiveValue: false, publicFilter: { isPublished: true } })
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

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }))

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Cada ficheiro pode ter no máximo 10 MB.' : 'Foram enviados ficheiros em excesso ou inválidos.'
    return res.status(400).json({ message })
  }
  if (error.name === 'ValidationError') return res.status(400).json({ message: Object.values(error.errors).map(item => item.message).join(' ') })
  if (error.name === 'CastError') return res.status(400).json({ message: 'Identificador inválido.' })
  if (error.code === 11000) return res.status(409).json({ message: 'Já existe um registo com estes dados.' })
  if (error.message === 'Origin is not allowed by CORS.') return res.status(403).json({ message: 'Origem não autorizada.' })
  if (error.message === 'Formato de ficheiro não permitido.' || error.message.startsWith('Envie um modelo GLB')) return res.status(400).json({ message: error.message })
  res.status(500).json({ message: production ? 'Ocorreu um erro interno.' : error.message })
})

try {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/traco-platform')
  app.listen(port, () => console.log(`API listening on port ${port}`))
} catch (error) {
  console.error('Unable to connect to MongoDB:', error.message)
  process.exitCode = 1
}
