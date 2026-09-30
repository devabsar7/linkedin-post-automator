#!/usr/bin/env node
/**
 * Static scan: fail if secret-like patterns appear in frontend source or build output.
 * Does not prove absence of all leaks; catches common mistakes.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const TARGETS = ['src', 'shared', 'dist', 'public'].filter((d) => existsSync(join(ROOT, d)))

const FORBIDDEN = [
  { name: 'GROQ_API_KEY assignment', re: /GROQ_API_KEY\s*[:=]\s*['"`][^'"`]+['"`]/ },
  { name: 'LINKEDIN_CLIENT_SECRET', re: /LINKEDIN_CLIENT_SECRET\s*[:=]\s*['"`][^'"`]+['"`]/ },
  { name: 'TOKEN_ENCRYPTION_KEY', re: /TOKEN_ENCRYPTION_KEY\s*[:=]\s*['"`][^'"`]+['"`]/ },
  { name: 'CRON_INTERNAL_SECRET', re: /CRON_INTERNAL_SECRET\s*[:=]\s*['"`][^'"`]+['"`]/ },
  { name: 'BOOTSTRAP_SECRET value', re: /BOOTSTRAP_SECRET\s*[:=]\s*['"`][^'"`]+['"`]/ },
  { name: 'service_role JWT-like', re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { name: 'SUPABASE_SERVICE_ROLE in VITE_', re: /VITE_.*SERVICE_ROLE/i },
  { name: 'Bearer token literal', re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/ },
]

const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.map'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else {
      const ext = name.includes('.') ? `.${name.split('.').pop()}` : ''
      if (TEXT_EXT.has(ext) || !ext) out.push(p)
    }
  }
  return out
}

let failures = 0
for (const target of TARGETS) {
  const files = walk(join(ROOT, target))
  for (const file of files) {
    // Allow documentation references to secret *names* in comments only if no values —
    // we still flag assignments with quoted values.
    let content
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    // Skip env example filename references in scan of shared comments for JWT pattern
    // by ignoring .example-like empty placeholders — but we don't scan .env.example here.

    // Ignore false-positive JWT pattern in type definitions that are clearly truncated
    for (const rule of FORBIDDEN) {
      if (rule.name === 'service_role JWT-like') {
        // Only fail if looks like a full three-part JWT longer than typical placeholder
        const matches = content.match(rule.re)
        if (!matches) continue
        for (const m of matches) {
          if (m.length < 80) continue
          console.error(`[FAIL] ${rule.name} in ${relative(ROOT, file)}`)
          failures++
        }
        continue
      }
      if (rule.re.test(content)) {
        console.error(`[FAIL] ${rule.name} in ${relative(ROOT, file)}`)
        failures++
      }
    }
  }
}

if (failures > 0) {
  console.error(`Secret scan failed with ${failures} finding(s).`)
  process.exit(1)
}
console.log(`Secret scan passed (${TARGETS.join(', ')}).`)
