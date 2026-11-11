import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, simplify, textureCompress } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import obj2gltf from 'obj2gltf'

const [inputArgument, outputArgument] = process.argv.slice(2)
if (!inputArgument || !outputArgument) {
  throw new Error('Uso: npm run prepare:model:tiles -w platform-backend -- <modelo.glb|modelo.obj> <pasta-de-saída>')
}

const inputPath = resolve(inputArgument)
const outputPath = resolve(outputArgument)
const inputInfo = await stat(inputPath)
const inputFormat = extname(inputPath).toLowerCase()
if (!inputInfo.isFile() || !['.glb', '.obj'].includes(inputFormat)) {
  throw new Error('Seleccione um ficheiro GLB ou OBJ existente.')
}
if (inputInfo.size > 1024 * 1024 * 1024) {
  throw new Error('O modelo de origem não pode exceder 1 GiB.')
}

const temporaryDirectory = join(tmpdir(), `arqcons-tiles-${randomUUID()}`)
const glbPath = inputFormat === '.glb' ? inputPath : join(temporaryDirectory, 'source.glb')
const levelDefinitions = [
  { file: 'lod-0.glb', ratio: 1 },
  { file: 'lod-1.glb', ratio: 0.35 },
  { file: 'lod-2.glb', ratio: 0.12 },
]

function createIO(dracoDecoder) {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': dracoDecoder,
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.simplifier': MeshoptSimplifier,
    })
}

function getModelBounds(document) {
  const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0]
  if (!scene) throw new Error('O modelo não contém uma cena 3D.')

  const { min, max } = getBounds(scene)
  if ([...min, ...max].some(value => !Number.isFinite(value))) {
    throw new Error('Não foi possível calcular os limites espaciais do modelo.')
  }
  const modelCenter = min.map((value, index) => (value + max[index]) / 2)
  const modelHalfAxes = min.map((value, index) => Math.max((max[index] - value) / 2, 0.0001))
  const center = [modelCenter[0], -modelCenter[2], modelCenter[1]]
  const halfAxes = [modelHalfAxes[0], modelHalfAxes[2], modelHalfAxes[1]]
  const radius = Math.max(...halfAxes) * Math.sqrt(3)
  return { center, halfAxes, radius: Math.max(radius, 0.1) }
}

function removeCompressionExtensions(document) {
  document.disposeExtension('KHR_draco_mesh_compression')
  document.disposeExtension('EXT_meshopt_compression')
}

function getPrimitiveCount(document) {
  return document.getRoot().listMeshes()
    .reduce((total, mesh) => total + mesh.listPrimitives().length, 0)
}

async function writeLevel(io, ratio, outputFile) {
  let document = await io.read(glbPath)
  removeCompressionExtensions(document)
  if (ratio < 1) {
    await document.transform(simplify({
      simplifier: MeshoptSimplifier,
      ratio,
      error: 1,
    }))
    if (!getPrimitiveCount(document)) {
      console.warn(`A simplificação ${ratio} removeu toda a geometria; a usar o modelo original neste nível.`)
      document = await io.read(glbPath)
      removeCompressionExtensions(document)
    }
    await document.transform(textureCompress({
      resize: [ratio <= 0.12 ? 512 : 1024, ratio <= 0.12 ? 512 : 1024],
    }))
  }
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  await io.write(outputFile, document)
}

try {
  await mkdir(temporaryDirectory)
  await mkdir(outputPath)
  if (inputFormat === '.obj') {
    const glb = await obj2gltf(inputPath, { binary: true })
    await writeFile(glbPath, glb)
  }

  const dracoDecoder = await draco3d.createDecoderModule({})
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])
  const io = createIO(dracoDecoder)
  let sourceDocument = await io.read(glbPath)
  removeCompressionExtensions(sourceDocument)
  const bounds = getModelBounds(sourceDocument)
  sourceDocument = null
  global.gc?.()

  for (const level of levelDefinitions) {
    const outputFile = join(outputPath, level.file)
    await writeLevel(io, level.ratio, outputFile)
    const outputInfo = await stat(outputFile)
    console.info(`${level.file}: ${(outputInfo.size / 1024 / 1024).toFixed(1)} MiB`)
  }

  const { center, halfAxes, radius } = bounds
  const geometricErrors = [radius * 0.5, radius * 0.1, 0]
  const tiles = levelDefinitions.slice().reverse().map((level, index) => {
    const tile = {
      boundingVolume: {
        box: [
          ...center,
          halfAxes[0], 0, 0,
          0, halfAxes[1], 0,
          0, 0, halfAxes[2],
        ],
      },
      geometricError: geometricErrors[index],
      content: { uri: level.file },
    }
    if (index < levelDefinitions.length - 1) {
      tile.refine = 'REPLACE'
      tile.children = []
    }
    return tile
  })
  tiles[0].refine = 'REPLACE'
  tiles[0].children.push(tiles[1])
  tiles[1].children.push(tiles[2])

  const tileset = {
    asset: { version: '1.1', gltfUpAxis: 'Y' },
    geometricError: geometricErrors[0],
    root: tiles[0],
  }
  await writeFile(join(outputPath, 'tileset.json'), `${JSON.stringify(tileset, null, 2)}\n`)
  console.info(`Tileset pronto: ${outputPath}`)
  console.info(`Modelo de origem: ${basename(inputPath)}`)
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
