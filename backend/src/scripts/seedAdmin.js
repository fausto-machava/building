import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../models/index.js'

const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, MONGODB_URI } = process.env
if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  throw new Error('Set ADMIN_NAME, ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.')
}

try {
  await mongoose.connect(MONGODB_URI || 'mongodb://127.0.0.1:27017/traco-platform')
  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() })
  if (existing) throw new Error('An account already exists for ADMIN_EMAIL.')
  await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' })
  console.log(`Administrator created: ${ADMIN_EMAIL}`)
} finally {
  await mongoose.disconnect()
}
