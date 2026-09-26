// 探查服务端可用路径
// 用法: node tools/probe_url.js <url> [url...]
const http = require('http')
const https = require('https')

function probe(url) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const mod = u.protocol === 'https:' ? https : http
    const t0 = Date.now()
    const req = mod.request(u, { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0' }, timeout: 8000 }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, ct: (res.headers['content-type'] || '').slice(0, 40), loc: res.headers.location, body: body.slice(0, 300), ms: Date.now() - t0 }))
    })
    req.on('error', (e) => resolve({ err: e.message, ms: Date.now() - t0 }))
    req.on('timeout', () => { req.destroy(); resolve({ err: 'TIMEOUT', ms: Date.now() - t0 }) })
    req.end()
  })
}

async function main() {
  for (const t of process.argv.slice(2)) {
    const r = await probe(t)
    if (r.err) { console.log('  ERR   ' + r.ms + 'ms ' + t + '  → ' + r.err); continue }
    console.log('  ' + String(r.status).padEnd(4) + String(r.ms).padStart(5) + 'ms ' + r.ct.padEnd(30) + ' ' + t)
    if (r.loc) console.log('        → Location: ' + r.loc)
    if (r.body) console.log('        ' + r.body.replace(/\s+/g, ' '))
  }
}

main()
