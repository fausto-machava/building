import { spawn } from 'node:child_process'
import { access, readdir, readFile, writeFile, mkdir, rename, unlink, rmdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const backendDirectory = path.resolve(scriptDirectory, '../..')
const publicDirectory = path.join(backendDirectory, 'public')
const desktopDirectory = path.join(publicDirectory, 'frames', 'construction')
const mobileDirectory = path.join(desktopDirectory, 'mobile')
const manifestPath = path.join(publicDirectory, 'demo', 'manifest.json')
const temporaryDirectory = path.join(publicDirectory, `.demo-frames-${process.pid}`)
const temporaryDesktopDirectory = path.join(temporaryDirectory, 'desktop')
const temporaryMobileDirectory = path.join(temporaryDirectory, 'mobile')
const sourceFile = process.argv[2]

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    process.stderr.setEncoding('utf8')
    process.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-8000) })
    process.on('error', reject)
    process.on('close', code => {
      if (code === 0) return resolve()
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`))
    })
  })
}

async function countFrames(directory) {
  const files = await readdir(directory)
  return files.filter(file => /^frame_\d{4}\.webp$/i.test(file)).length
}

async function clearExistingFrames(directory) {
  const files = await readdir(directory)
  await Promise.all(files
    .filter(file => /^frame_\d{4}\.webp$/i.test(file))
    .map(file => unlink(path.join(directory, file))))
}

async function moveFrames(sourceDirectory, destinationDirectory) {
  const files = (await readdir(sourceDirectory)).filter(file => /^frame_\d{4}\.webp$/i.test(file))
  await Promise.all(files.map(file => rename(
    path.join(sourceDirectory, file),
    path.join(destinationDirectory, file),
  )))
}

async function cleanTemporaryFrames() {
  for (const directory of [temporaryDesktopDirectory, temporaryMobileDirectory]) {
    try {
      const files = await readdir(directory)
      await Promise.all(files.map(file => unlink(path.join(directory, file))))
      await rmdir(directory)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  try {
    await rmdir(temporaryDirectory)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

if (!sourceFile) {
  console.error('Usage: npm run frames -- path/to/source.mp4')
  process.exitCode = 1
} else {
  try {
    const resolvedSource = path.resolve(sourceFile)
    await access(resolvedSource)
    await mkdir(temporaryDesktopDirectory, { recursive: true })
    await mkdir(temporaryMobileDirectory, { recursive: true })
    await mkdir(desktopDirectory, { recursive: true })
    await mkdir(mobileDirectory, { recursive: true })

    await runFfmpeg([
      '-y', '-i', resolvedSource, '-vf', 'fps=24,scale=1920:-2', '-frames:v', '240',
      '-c:v', 'libwebp', '-quality', '80',
      path.join(temporaryDesktopDirectory, 'frame_%04d.webp'),
    ])
    await runFfmpeg([
      '-y', '-i', resolvedSource, '-vf', 'fps=24,scale=1080:-2', '-frames:v', '240',
      '-c:v', 'libwebp', '-quality', '80',
      path.join(temporaryMobileDirectory, 'frame_%04d.webp'),
    ])

    const totalFrames = await countFrames(temporaryDesktopDirectory)
    const mobileFrames = await countFrames(temporaryMobileDirectory)
    if (totalFrames < 150 || mobileFrames !== totalFrames) {
      throw new Error(`Expected 150-240 matching desktop/mobile frames; found ${totalFrames} and ${mobileFrames}.`)
    }

    await clearExistingFrames(desktopDirectory)
    await clearExistingFrames(mobileDirectory)
    await moveFrames(temporaryDesktopDirectory, desktopDirectory)
    await moveFrames(temporaryMobileDirectory, mobileDirectory)

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.totalFrames = totalFrames
    manifest.frameRate = 24
    manifest.version = String(Date.now())
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await cleanTemporaryFrames()
    console.log(`Generated ${totalFrames} desktop and mobile frame pairs.`)
    console.log(`Updated ${manifestPath}`)
  } catch (error) {
    console.error(`Frame generation failed: ${error.message}`)
    process.exitCode = 1
    try {
      await cleanTemporaryFrames()
    } catch (cleanupError) {
      console.error(`Temporary frame cleanup failed: ${cleanupError.message}`)
    }
  }
}
