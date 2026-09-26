// 打印酷我旧接口的完整字段，定位取链所需的 id
const http = require('http')

function probe(url) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const t0 = Date.now()
    const req = http.request(u, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.kuwo.cn/' } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - t0 }))
    })
    req.on('error', (e) => resolve({ err: e.message, ms: Date.now() - t0 }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ err: 'TIMEOUT', ms: Date.now() - t0 }) })
    req.end()
  })
}

;(async () => {
  const r = await probe('http://search.kuwo.cn/r.s?all=' + encodeURIComponent('晴天 周杰伦') + '&ft=music&itemset=web_2013&client=kt&pn=0&rn=3&rformat=json&encoding=utf8')
  if (r.err) { console.log('ERR', r.err); return }
  const m = r.body.match(/'abslist':\[(.*)\],'abslistmore'/s) || r.body.match(/'abslist':\[(.*)\]/s)
  if (!m) { console.log('未匹配到 abslist'); console.log(r.body.slice(-600)); return }
  for (const item of m[1].split(/\},\{/)) {
    const get = (k) => (item.match(new RegExp("'" + k + "':'([^']*)'")) || [])[1]
    console.log(`MUSICRID=${get('MUSICRID')} DC_TARGETID=${get('DC_TARGETID')} SONGNAME=${get('SONGNAME')} ARTIST=${get('ARTIST')} DURATION=${get('DURATION')} ALBUM=${get('ALBUM')}`)
  }
})()
