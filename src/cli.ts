#!/usr/bin/env node
import { run } from './core/run.js'
//import { getArgValue } from './utils/args.js'
import { readPkg } from './utils/pkg.js'
import { printHelp } from './report/output.js'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const pkg = readPkg()
  const name = pkg.name
  const version = pkg.version
  
  if (argv.length === 0) {
    console.error('Run with --help to see usage.')
    process.exitCode = 2
    return
  }
  
  const known = new Set(['-h', '--help', '-v', '--version', '--since', '--input', '--ext'])
  const unknown = argv.filter((arg) => arg.startsWith('-') && !known.has(arg))
  
  if (unknown.length > 0) {
    console.error(`Unknown command or option: ${unknown[0]}`)
    console.error('Run with --help to see usage.')
    process.exitCode = 2
    return
  }

  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp(name)
    return
  }

  if (argv.includes('-v') || argv.includes('--version')) {
    console.log(`${name} ${version}`)
    return
  }

  try {
    await run({
      name,
      version,
      sinceRaw: getArgValue(argv, '--since'),
      input: getArgValue(argv, '--input'),
      ext: getArgValue(argv, '--ext') ?? 'txt',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(msg)
    process.exitCode = 2
  }
}

export function getArgValue(argv: string[], key: string): string | undefined {
  const idx = argv.indexOf(key)
  if (idx === -1) return undefined
  return argv[idx + 1]
}

void main()
