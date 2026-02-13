import { createRequire } from 'node:module'
import path from 'node:path'

type PkgJson = {
  name?: string
  version?: string
}

export function readPkg(): { name: string; version: string } {
  const requireBase = path.join(process.cwd(), 'package.json')
  const require = createRequire(requireBase)

  let pkg: PkgJson | undefined

  try {
    pkg = require('./package.json') as PkgJson
  } catch {
    // Fallback defaults below
  }

  return {
    name: pkg?.name ?? 'llrem',
    version: pkg?.version ?? '0.0.0',
  }
}
