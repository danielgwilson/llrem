import { formatSince } from '../utils/duration.js'

type SummaryArgs = {
  ext: 'txt' | 'json' | 'md'
  name: string
  version: string
  sinceRaw: string
  input?: string
  inputDir: string
  matchedCount: number
  matchedFiles: string[]
  isTruncated: boolean
}

export function printHelp(name: string): void {
  console.log(`${name} — Let your agent sleep on it 💤`)
  console.log('')
  console.log('Usage:')
  console.log(`  ${name} --since 7d [--input <dir>] [--ext txt|json|md]`)
  console.log('')
  console.log('Options:')
  console.log('  -h, --help           Show help')
  console.log('  -v, --version        Print version and exit')
  console.log('  --since <duration>   Lookback window, e.g. 7d, 24h, 30m')
  console.log('  --input <dir>        Path to transcripts directory')
  console.log('  --ext <fmt>          txt|json|md (default: txt)')
}

export function printSummary({
  name,
  sinceRaw,
  input,
  inputDir,
  matchedCount,
  matchedFiles,
  isTruncated,
}: SummaryArgs): void {
  const window = formatSince(sinceRaw)

  console.log(`${name} (alpha)`)
  console.log(`Time window: ${window}`)
  console.log(`Input dir: ${inputDir}`)
  if (input) console.log(`Input: ${input}`)
  console.log(`Matched files: ${matchedCount}`)

  for (const f of matchedFiles) {
    console.log(`- ${f}`)
  }

  if (isTruncated) {
    console.log('- ...')
  }
  console.log('Transcript analysis not yet implemented.')
}
