import 'dotenv/config'
import mongoose from 'mongoose'
import { Service } from '../models/index.js'

const services = [
  {
    name: 'Arquitectura',
    category: 'Arquitectura',
    description: 'Concebemos edifícios que conciliam identidade, conforto e funcionalidade.',
  },
  {
    name: 'Engenharia Civil',
    category: 'Engenharia',
    description: 'Coordenamos soluções técnicas seguras e eficientes para cada desafio.',
  },
  {
    name: 'Projectos Estruturais',
    category: 'Engenharia',
    description: 'Desenvolvemos estruturas optimizadas com rigor e atenção à execução.',
  },
  {
    name: 'Fiscalização de Obras',
    category: 'Gestão',
    description: 'Acompanhamos a obra para garantir qualidade, prazo e conformidade.',
  },
  {
    name: 'Gestão de Projectos',
    category: 'Gestão',
    description: 'Planeamos recursos, prazos e equipas com visão integrada.',
  },
  {
    name: 'Reabilitação',
    category: 'Reabilitação',
    description: 'Damos nova vida aos espaços com soluções contemporâneas e duradouras.',
  },
]

try {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arqcons-platform')
  const result = await Service.bulkWrite(services.map((service, index) => ({
    updateOne: {
      filter: { name: service.name },
      update: {
        $setOnInsert: service,
        $set: { isPublished: true, order: index + 1 },
      },
      upsert: true,
      timestamps: false,
    },
  })))
  const publishedCount = await Service.countDocuments({
    name: { $in: services.map(service => service.name) },
    isPublished: true,
  })

  console.log(`Services added or updated: ${result.upsertedCount + result.modifiedCount}`)
  console.log(`Published catalog services: ${publishedCount}/${services.length}`)
} finally {
  await mongoose.disconnect()
}
