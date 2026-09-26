// 解出洛雪本地存储的自定义源脚本，和仓库里的版本对比
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const P = path.join(process.env.APPDATA, 'lx-music-desktop', 'LxDatas', 'user_api.json')
const OUT = path.join(__dirname, 'installed.js')

const db = JSON.parse(fs.readFileSync(P, 'utf8'))
const apis = db.userApis || []
console.log(`已安装的自定义源：${apis.length} 个\n`)

for (const a of apis) {
  console.log(`  名称: ${a.name}`)
  console.log(`  版本: ${a.version}`)
  console.log(`  作者: ${a.author}`)
  console.log(`  主页: ${a.homepage}`)
  console.log(`  脚本长度: ${(a.script || '').length}`)
  console.log(`  前缀: ${String(a.script || '').slice(0, 8)}`)

  const raw = a.script || ''
  let code = raw
  if (raw.startsWith('gz_')) {
    const buf = Buffer.from(raw.slice(3), 'base64')
    for (const [name, fn] of [['inflate', zlib.inflateSync], ['inflateRaw', zlib.inflateRawSync], ['gunzip', zlib.gunzipSync], ['brotli', zlib.brotliDecompressSync]]) {
      try { code = fn(buf).toString('utf8'); console.log(`  解压方式: ${name}`); break } catch { /* 下一个 */ }
    }
  }
  if (code === raw && raw.startsWith('gz_')) { console.log('  ❌ 解压失败'); continue }

  fs.writeFileSync(OUT, code, 'utf8')
  console.log(`  → 已写出 ${OUT} (${Buffer.byteLength(code)} 字节)`)
  console.log(`  头 12 行:`)
  code.split('\n').slice(0, 12).forEach((l) => console.log(`    | ${l}`))

  // 和仓库版本比对
  const repo = path.join(__dirname, '..', 'aggregator', '1.1.0.js')
  if (fs.existsSync(repo)) {
    const a1 = fs.readFileSync(repo, 'utf8')
    console.log(`\n  与仓库 aggregator/1.1.0.js 比对: ${a1 === code ? '✅ 完全一致' : '❌ 不一致'}`)
    if (a1 !== code) {
      const n = Math.min(a1.length, code.length)
      let d = -1
      for (let i = 0; i < n; i++) if (a1[i] !== code[i]) { d = i; break }
      console.log(`  首个差异在第 ${d} 字符（仓库 ${a1.length} 字节 / 本地 ${code.length} 字节）`)
      if (d > 0) {
        console.log(`  仓库: ...${JSON.stringify(a1.slice(Math.max(0, d - 60), d + 60))}`)
        console.log(`  本地: ...${JSON.stringify(code.slice(Math.max(0, d - 60), d + 60))}`)
      }
    }
  }
}
