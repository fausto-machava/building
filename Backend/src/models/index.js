import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const { Schema, model } = mongoose

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, minlength: 10, select: false },
  role: { type: String, enum: ['admin', 'commercial-manager', 'project-manager'], default: 'commercial-manager', index: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 12)
})
userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.password)
}

const clientSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  company: { type: String, trim: true, maxlength: 160 },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  phone: { type: String, trim: true, maxlength: 40 },
  address: { type: String, trim: true, maxlength: 300 },
  category: { type: String, enum: ['individual', 'company', 'institution'], default: 'individual' },
  notes: { type: String, maxlength: 3000 },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
}, { timestamps: true })
clientSchema.index({ name: 'text', email: 'text', phone: 'text', company: 'text' })

const serviceSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, trim: true, maxlength: 100 },
  description: { type: String, maxlength: 3000 },
  image: { type: String, trim: true },
  isPublished: { type: Boolean, default: false, index: true },
  order: { type: Number, default: 0 },
}, { timestamps: true })

const mediaSchema = new Schema({
  url: { type: String, required: true },
  publicId: { type: String },
  name: { type: String, maxlength: 255 },
  type: { type: String, maxlength: 100 },
  size: { type: Number, min: 0 },
}, { _id: false })

const quoteRequestSchema = new Schema({
  reference: { type: String, required: true, unique: true, index: true },
  client: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  company: { type: String, trim: true, maxlength: 160 },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  phone: { type: String, required: true, trim: true, maxlength: 40 },
  location: { type: String, required: true, trim: true, maxlength: 240 },
  service: { type: String, required: true, trim: true, maxlength: 160 },
  constructionType: { type: String, trim: true, maxlength: 100 },
  area: { type: Number, min: 0 },
  description: { type: String, required: true, maxlength: 5000 },
  budget: { type: String, maxlength: 100 },
  files: { type: [mediaSchema], default: [] },
  status: { type: String, enum: ['Novo', 'Em análise', 'Em contacto', 'Em elaboração de proposta', 'Proposta enviada', 'Aprovado', 'Rejeitado', 'Cancelado'], default: 'Novo', index: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  internalNotes: { type: String, maxlength: 5000 },
}, { timestamps: true })
quoteRequestSchema.index({ createdAt: -1 })

const quotationSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  client: { type: Schema.Types.ObjectId, ref: 'Client' },
  clientName: { type: String, required: true, trim: true, maxlength: 160 },
  quoteRequest: { type: Schema.Types.ObjectId, ref: 'QuoteRequest' },
  items: [{
    description: { type: String, required: true, maxlength: 500 },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  }],
  discount: { type: Number, default: 0, min: 0 },
  taxRate: { type: Number, default: 0, min: 0, max: 100 },
  total: { type: Number, default: 0, min: 0 },
  validUntil: { type: Date },
  terms: { type: String, maxlength: 5000 },
  status: { type: String, enum: ['Rascunho', 'Enviada', 'Em negociação', 'Aceite', 'Rejeitada', 'Expirada'], default: 'Rascunho', index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

const projectSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  name: { type: String, trim: true, maxlength: 200 },
  category: { type: String, trim: true, maxlength: 100 },
  client: { type: Schema.Types.ObjectId, ref: 'Client' },
  quotation: { type: Schema.Types.ObjectId, ref: 'Quotation' },
  location: { type: String, trim: true, maxlength: 240 },
  description: { type: String, maxlength: 5000 },
  year: { type: Number, min: 1900, max: 2200 },
  startDate: { type: Date },
  estimatedCompletion: { type: Date },
  status: { type: String, enum: ['Planeamento', 'Em execução', 'Suspenso', 'Concluído', 'Cancelado'], default: 'Planeamento', index: true },
  isPublished: { type: Boolean, default: false, index: true },
  isFeatured: { type: Boolean, default: false },
  coverImage: { type: String, trim: true },
  model3d: {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
    name: { type: String, trim: true, maxlength: 255 },
    format: { type: String, enum: ['glb', 'obj', '3dtiles'] },
    size: { type: Number, min: 1, max: 3221225472 },
    storage: { type: String, enum: ['cloudinary', 'r2'] },
  },
  floorPlan: mediaSchema,
  gallery: { type: [mediaSchema], default: [] },
  manager: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })
projectSchema.index({ title: 'text', location: 'text', category: 'text' })

const notificationSchema = new Schema({
  type: { type: String, required: true, maxlength: 80 },
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 2000 },
  recipient: { type: Schema.Types.ObjectId, ref: 'User' },
  readAt: { type: Date },
  relatedType: { type: String, maxlength: 80 },
  relatedId: { type: Schema.Types.ObjectId },
}, { timestamps: true })

const activityLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true, maxlength: 100 },
  entity: { type: String, required: true, maxlength: 100 },
  entityId: { type: Schema.Types.ObjectId },
  details: { type: String, maxlength: 1000 },
}, { timestamps: true })
activityLogSchema.index({ createdAt: -1 })

const technicalLogSchema = new Schema({
  level: { type: String, enum: ['error'], default: 'error', required: true },
  name: { type: String, maxlength: 120 },
  message: { type: String, required: true, maxlength: 2000 },
  method: { type: String, maxlength: 10 },
  path: { type: String, maxlength: 500 },
  statusCode: { type: Number },
  stack: { type: String, maxlength: 8000 },
}, { timestamps: true })
technicalLogSchema.index({ createdAt: -1 })

export const User = model('User', userSchema)
export const Client = model('Client', clientSchema)
export const Service = model('Service', serviceSchema)
export const Project = model('Project', projectSchema)
export const QuoteRequest = model('QuoteRequest', quoteRequestSchema)
export const Quotation = model('Quotation', quotationSchema)
export const Notification = model('Notification', notificationSchema)
export const ActivityLog = model('ActivityLog', activityLogSchema)
export const TechnicalLog = model('TechnicalLog', technicalLogSchema)
