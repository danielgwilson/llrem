import { printSummary } from '../report/output.js'
import { parseSince } from '../utils/duration.js'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

type RunOptions = {
  name: string
  version: string
  sinceRaw?: string
  input?: string
  ext: string
}

type Ext = 'txt' | 'md' | 'json'

const EXT_TO_EXTENSION: Record<Ext, string> = {
  txt: '.txt',
  md: '.md',
  json: '.json',
}

function isValidExt(ext: string): ext is Ext {
  return ext === 'txt' || ext === 'md' || ext === 'json'
}

export async function run(opts: RunOptions): Promise<void> {
  if (!isValidExt(opts.ext)) {
    throw new Error(`Invalid --ext: ${opts.ext}`)
  }

  if (!opts.sinceRaw) {
    throw new Error(
      'Missing required flag: --since <duration> (e.g. 7d)\nRun with --help to see usage.',
    )
  }

  const sinceMs = parseSince(opts.sinceRaw)
  const inputDir = opts.input ?? process.cwd()

  let dirents
  try {
    dirents = await readdir(inputDir, { withFileTypes: true })
  } catch {
    throw new Error(`Input directory not found or not readable: ${inputDir}`)
  }

  const now = Date.now()
  const matchedFiles: string[] = []
  const allowedExtension = EXT_TO_EXTENSION[opts.ext]

  for (const d of dirents) {
    if (!d.isFile()) continue
    const ext = path.extname(d.name).toLowerCase()
    if (ext !== allowedExtension) continue

    const fullPath = path.join(inputDir, d.name)
    try {
      const s = await stat(fullPath)
      if (now - s.mtimeMs <= sinceMs) matchedFiles.push(fullPath)
    } catch {
      // Skip files 
    }
  }

  matchedFiles.sort()

  const matchedCount = matchedFiles.length
  const matchedPreview = matchedFiles.slice(0, 50)
  const isTruncated = matchedCount > matchedPreview.length

  printSummary({
    ext: opts.ext,
    name: opts.name,
    version: opts.version,
    sinceRaw: opts.sinceRaw,
    input: opts.input,
    inputDir,
    matchedCount,
    matchedFiles: matchedPreview,
    isTruncated,
  })
}
