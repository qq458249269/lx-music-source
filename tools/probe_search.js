// 探测各平台官方搜索接口，验证「跨源定位同一首歌」这条路是否可行
const http = require('http')
const https = require('https')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

function probe(url, headers, method, body) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(url) } catch { return resolve({ err: 'bad url' }) }
    const mod = u.protocol === 'https:' ? https : http
    const t0 = Date.now()
    const opts = { method: method || 'GET', headers: Object.assign({ 'user-agent': UA }, headers || {}) }
    if (body) { opts.headers['content-length'] = Buffer.byteLength(body); opts.headers['content-type'] = opts.headers['content-type'] || 'application/json' }
    const req = mod.request(u, opts, (res) => {
      const chunks = []
      res.on('data', (c) => { if (chunks.length < 400) chunks.push(c) })
      res.on('end', () => resolve({ status: res.statusCode, ct: String(res.headers['content-type'] || ''), body: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - t0, setCookie: res.headers['set-cookie'] }))
    })
    req.on('error', (e) => resolve({ err: e.message, ms: Date.now() - t0 }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ err: 'TIMEOUT', ms: Date.now() - t0 }) })
    if (body) req.write(body)
    req.end()
  })
}

const KW = '晴天 周杰伦'

const APIS = [
  ['QQ SearchCgiService', 'POST', 'https://u.y.qq.com/cgi-bin/musicu.fcg', { referer: 'https://y.qq.com/' },
    JSON.stringify({ comm: { ct: 24, cv: 0 }, req: { method: 'music.search.SearchCgiService', module: 'music.search.SearchCgiService', param: { remoteplace: 'txt.yqq.top', searchid: '1234567890123456', query: KW, search_type: 0, num_per_page: 10, page_num: 1 } } })],
  ['QQ smartbox', 'GET', 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=' + encodeURIComponent(KW) + '&format=json&p=1&n=10', { referer: 'https://y.qq.com/' }, null],
  ['QQ cgi-bin/search', 'GET', 'https://c.y.qq.com/splcloud/fcgi-bin/fcg_v8_search_cpgg_plat?page_num=1&pagesize=10&querytype=0&search_type=0&w=' + encodeURIComponent(KW) + '&format=json&loginUin=0', { referer: 'https://y.qq.com/' }, null],
  ['酷我 旧接口', 'GET', 'http://search.kuwo.cn/r.s?all=' + encodeURIComponent(KW) + '&ft=music&itemset=web_2013&client=kt&pn=0&rn=10&rformat=json&encoding=utf8', { referer: 'https://www.kuwo.cn/' }, null],
  ['酷我 www2', 'GET', 'https://www.kuwo.cn/api/www/search/searchMusicBykeyWord?key=' + encodeURIComponent(KW) + '&pn=1&rn=10&httpsStatus=1&csrf=undefined', { referer: 'https://www.kuwo.cn/' }, null],
  ['酷狗 旧接口', 'GET', 'https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=' + encodeURIComponent(KW) + '&page=1&pagesize=10', { referer: 'https://www.kugou.com/' }, null],
  ['酷狗 www.kg', 'GET', 'https://www.kugou.com/yy/index.php?r=play/search&keyword=' + encodeURIComponent(KW) + '&page=1&pagesize=10&callback=cb', { referer: 'https://www.kugou.com/', cookie: 'kg_music=1' }, null],
  ['虾米/百度 qianqian', 'GET', 'https://music.163.com/api/search/get?s=' + encodeURIComponent('晴天') + '&type=1&offset=0&total=true&limit=3', { referer: 'https://music.163.com/' }, null],
]

;(async () => {
  for (const [name, method, url, headers, body] of APIS) {
    const r = await probe(url, headers, method, body)
    if (r.err) { console.log(`✗ ${name.padEnd(22)} ${r.ms}ms ${r.err}`); continue }
    const snippet = r.body.replace(/\s+/g, ' ').slice(0, 300)
    console.log(`${r.status === 200 ? '✓' : '✗'} ${name.padEnd(22)} ${r.ms}ms ${r.status} ${r.ct.slice(0, 26)}`)
    console.log(`   ${snippet}`)
  }
})()
