// 验证各平台搜索接口能否定位到「正确的那首歌」，并提取取链所需 id
const http = require('http')
const https = require('https')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

function probe(url, headers, method, body) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const mod = u.protocol === 'https:' ? https : http
    const t0 = Date.now()
    const opts = { method: method || 'GET', headers: Object.assign({ 'user-agent': UA }, headers || {}) }
    if (body) { opts.headers['content-length'] = Buffer.byteLength(body); opts.headers['content-type'] = opts.headers['content-type'] || 'application/json' }
    const req = mod.request(u, opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - t0, setCookie: res.headers['set-cookie'] }))
    })
    req.on('error', (e) => resolve({ err: e.message, ms: Date.now() - t0 }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ err: 'TIMEOUT', ms: Date.now() - t0 }) })
    if (body) req.write(body)
    req.end()
  })
}

;(async () => {
  // ---- 酷狗：先拿 kg_music token ----
  const home = await probe('https://www.kugou.com/', { referer: 'https://www.kugou.com/' })
  const cookies = (home.setCookie || []).map((c) => c.split(';')[0]).join('; ')
  console.log('酷狗首页 cookie:', cookies.slice(0, 120) || '(无)')
  if (cookies) {
    const kg = await probe('https://www.kugou.com/yy/index.php?r=play/search&keyword=' + encodeURIComponent('晴天 周杰伦') + '&page=1&pagesize=5&callback=cb', { referer: 'https://www.kugou.com/', cookie: cookies })
    console.log('酷狗搜索:', kg.err || `${kg.status} ${kg.body.replace(/\s+/g, ' ').slice(0, 200)}`)
  }

  // ---- 网易云：看能否区分 深情版 vs 原版 ----
  console.log('\n=== 网易云 搜「晴天 周杰伦」===')
  const wy = await probe('https://music.163.com/api/search/get?s=' + encodeURIComponent('晴天 周杰伦') + '&type=1&offset=0&total=true&limit=5', { referer: 'https://music.163.com/' })
  try {
    const j = JSON.parse(wy.body)
    for (const s of j.result.songs.slice(0, 5)) {
      console.log(`  id=${s.id} 「${s.name}」 - ${(s.artists || []).map((a) => a.name).join(',')}  时长${s.duration}ms`)
    }
  } catch (e) { console.log('  解析失败', wy.body.slice(0, 150)) }

  // ---- QQ smartbox：字段结构 ----
  console.log('\n=== QQ 搜「晴天 周杰伦」===')
  const tx = await probe('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=' + encodeURIComponent('晴天 周杰伦') + '&format=json&p=1&n=5', { referer: 'https://y.qq.com/' })
  try {
    const j = JSON.parse(tx.body)
    for (const s of j.data.song.list.slice(0, 5)) {
      console.log(`  songmid=${s.songmid} songId=${s.songId} 「${s.songname}」 - ${s.singer.map((a) => a.name).join(',')} ${s.interval}s`)
    }
  } catch (e) { console.log('  解析失败', tx.body.slice(0, 150)) }

  // ---- 酷我 旧接口 ----
  console.log('\n=== 酷我 搜「晴天 周杰伦」===')
  const kw = await probe('http://search.kuwo.cn/r.s?all=' + encodeURIComponent('晴天 周杰伦') + '&ft=music&itemset=web_2013&client=kt&pn=0&rn=5&rformat=json&encoding=utf8', { referer: 'https://www.kuwo.cn/' })
  console.log('  raw:', kw.body.replace(/\s+/g, ' ').slice(0, 400))
})()
