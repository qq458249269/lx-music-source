// 跟随重定向检查最终是否为音频（用于判断 .php 网关链在 LX 里能否播）
// 用法: node tools/probe_redirect.js <url> [url...]
const http = require('http')
const https = require('https')

function req(url, depth = 0) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const mod = u.protocol === 'https:' ? https : http
    const t0 = Date.now()
    const r = mod.request(u, { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0', 'range': 'bytes=0-2047' }, timeout: 10000 }, (res) => {
      const len = Number(res.headers['content-length'] || 0)
      const loc = res.headers.location
      if (res.statusCode >= 300 && res.statusCode < 400 && loc && depth < 5) {
        res.resume()
        return resolve({ chain: [res.statusCode + ' ' + u.href + '  →  ' + loc], next: new URL(loc, u).href, depth })
      }
      let body = ''
      res.on('data', (c) => { body += c; if (body.length > 4096) { r.destroy() } })
      res.on('close', () => resolve({ final: u.href, status: res.statusCode, ct: res.headers['content-type'], cl: res.headers['content-length'], len, ms: Date.now() - t0, body: body.slice(0, 200) }))
    })
    r.on('error', (e) => resolve({ final: u.href, err: e.message, ms: Date.now() - t0 }))
    r.on('timeout', () => { r.destroy(); resolve({ final: u.href, err: 'TIMEOUT', ms: Date.now() - t0 }) })
    r.end()
  })
}

async function probe(url) {
  const chain = []
  let cur = url
  let out = {}
  for (let i = 0; i < 6; i++) {
    const r = await req(cur)
    if (r.chain) { chain.push(...r.chain); cur = r.next; continue }
    out = r; break
  }
  console.log('  ' + url)
  for (const c of chain) console.log('    ↳ ' + c)
  if (out.err) { console.log('    ✗ ' + out.err + ' (' + out.ms + 'ms)'); return }
  console.log('    → ' + out.status + ' ' + out.ct + ' len=' + out.len + ' ' + out.ms + 'ms')
  console.log('    final: ' + out.final)
  if (out.body) console.log('    ' + out.body.replace(/[^\x20-\x7e\n]/g, '.').slice(0, 160))
}

async function main() {
  for (const t of process.argv.slice(2)) await probe(t)
}

main()
