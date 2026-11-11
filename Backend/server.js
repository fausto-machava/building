import 'dotenv/config'
import mongoose from 'mongoose'
import app from './src/app.js'

const port = Number(process.env.PORT) || 5000

try {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arqcons-platform')
  app.listen(port, () => console.log(`API listening on port ${port}`))
} catch (error) {
  console.error('Unable to connect to MongoDB:', error.message)
  process.exitCode = 1
}
