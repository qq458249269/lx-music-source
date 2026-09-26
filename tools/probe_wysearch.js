// 验证洛雪真正在用的网易云搜索接口是否还返回音质字段（privilege）
// 若这里已经没有 qualitys，就能解释「所有歌曲 _qualitys 为空 → 全部换源失败」
const https = require('https')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function post(url, form, headers) {
  return new Promise((resolve) => {
    const body = new URLSearchParams(form).toString()
    const u = new URL(url)
    const req = https.request(u, {
      method: 'POST',
      timeout: 10000,
      headers: Object.assign({
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        Referer: 'https://music.163.com',
        Origin: 'https://music.163.com',
        Cookie: 'appver=2.0.2; os=pc; NMTID=x',
      }, headers || {}),
    }, (res) => {
      const c = []
      res.on('data', (d) => c.push(d))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(c).toString('utf8') }))
    })
    req.on('error', (e) => resolve({ err: e.message }))
    req.setTimeout(10000, () => { req.destroy(); resolve({ err: 'TIMEOUT' }) })
    req.write(body)
    req.end()
  })
}

;(async () => {
  const kw = process.argv[2] || '晴天 周杰伦'
  const r = await post('https://music.163.com/api/search/song/list/page', {
    keyword: kw, needCorrect: '1', channel: 'typing', offset: 0, scene: 'normal', total: 'true', limit: 10,
  })
  if (r.err) { console.log('请求失败:', r.err); return }
  console.log(`HTTP ${r.status}`)
  let j
  try { j = JSON.parse(r.body) } catch { console.log('非 JSON:', r.body.slice(0, 200)); return }

  const songs = (j.result && j.result.songs) || []
  console.log(`命中 ${songs.length} 首\n`)
  console.log('每首歌的音质相关字段:')
  for (const s of songs.slice(0, 6)) {
    const p = s.privilege || {}
    console.log(`  ${String(s.id).padEnd(12)} ${String(s.name).slice(0, 16).padEnd(18)}`
      + ` fee=${p.fee} playMaxQuality=${p.playMaxQuality} pl=${p.pl} dl=${p.dl} st=${p.st}`
      + ` | 顶层 qualitys=${JSON.stringify(s.qualitys)} _qualitys=${JSON.stringify(s._qualitys)}`)
  }
  const withPriv = songs.filter((s) => s.privilege && s.privilege.fee != null).length
  console.log(`\n带 privilege.fee 的: ${withPriv}/${songs.length}`)
  console.log('结论:', withPriv === 0
    ? '❌ 接口已不返回音质字段 → 洛雪 _qualitys 会是空 → 全部换源失败（与音源无关）'
    : '✅ 接口正常返回音质字段 → 是播放列表里 meta 残缺/过期，需要在搜索页重搜')
})()
