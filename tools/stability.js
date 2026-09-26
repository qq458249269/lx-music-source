// 量化网关稳定性：用户实际配置是 wy + 320k，连测 N 次看真实成功率
const { loadSource } = require('./lx_runtime')
const path = require('path')
const fs = require('fs')

const SONG = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf8')).songs
const N = Number(process.argv[2] || 10)
const PLATFORMS = (process.argv[3] || 'wy').split(',')
const QUALITY = process.argv[4] || '320k'

;(async () => {
  const src = await loadSource(path.join(__dirname, '..', 'aggregator', 'latest.js'))
  for (const p of PLATFORMS) {
    const mi = { ...SONG[p], source: p }
    let ok = 0
    const times = []
    for (let i = 0; i < N; i++) {
      const t0 = Date.now()
      try {
        const r = await src.call('musicUrl', p, { ...mi, type: QUALITY, musicInfo: mi })
        const ms = Date.now() - t0
        times.push(ms)
        if (r) { ok++; process.stdout.write('✅') } else process.stdout.write('❓')
      } catch { process.stdout.write('❌'); times.push(Date.now() - t0) }
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    console.log(`\n  ${p}/${QUALITY}: ${ok}/${N} 成功 (${Math.round((ok / N) * 100)}%)  平均 ${avg}ms`)
  }
})()
