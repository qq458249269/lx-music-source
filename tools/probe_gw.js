#!/usr/bin/env node
/**
 * 网关能力矩阵：探测各网关支持哪些平台 / type / level 组合，以及返回模式（302 vs JSON）。
 * 用法: node tools/probe_gw.js
 */
const http = require('http')
const https = require('https')
const S = require('./ids.json').songs

function get(url, depth = 0) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.request(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy()
        return resolve(get(new URL(res.headers.location, url).href, depth + 1).then((r) => ({ ...r, via: `${res.statusCode}→${new URL(res.headers.location, url).href.slice(0, 80)}` })))
      }
      let body = ''
      res.on('data', (c) => { if (body.length < 600) body += c })
      res.on('end', () => resolve({ st: res.statusCode, ct: String(res.headers['content-type'] || ''), body }))
    })
    req.on('error', (e) => resolve({ st: 0, ct: 'ERR ' + e.message, body: '' }))
    req.on('timeout', () => { req.destroy(); resolve({ st: 0, ct: 'TIMEOUT', body: '' }) })
    req.end()
  })
}

const ID = {
  wy: S.wy.songmid,
  tx: S.tx.songmid,
  kw: S.kw.songmid,
  kg: S.kg.hash,
  mg: S.mg.copyrightId,
}
const LEVELS = ['standard', '320k', 'lossless', 'hiLossless']
const GWS = [
  ['wy', (id, t, l) => `http://yinyue.haitangw.net/wy/wy.php?type=${t}&id=${id}&level=${l}`],
  ['qq', (id, t, l) => `http://yinyue.haitangw.net/qq/qq_kw.php?type=${t}&id=${id}&level=${l}`],
  ['kw', (id, t, l) => `http://yinyue.haitangw.net/kw/kw.php?type=${t}&id=${id}&level=${l}`],
  ['kg', (id, t, l) => `http://yinyue.haitangw.net/kg/kg_song_kw.php?type=${t}&id=${id}&level=${l}`],
  ['mg', (id, t, l) => `http://yinyue.haitangw.net/mg/migu.php?type=${t}&id=${id}&level=${l}`],
  ['music/kw', (id, t, l) => `https://musicapi.haitangw.net/music/kw.php?type=${t}&id=${id}&level=${l}`],
  ['music/kg', (id, t, l) => `https://musicapi.haitangw.net/music/kg.php?type=${t}&id=${id}&level=${l}`],
  ['music/mg', (id, t, l) => `https://musicapi.haitangw.net/music/mg.php?type=${t}&id=${id}&level=${l}`],
  ['kgqq/qq', (id, t, l) => `http://175.27.166.236/kgqq/qq.php?type=${t}&id=${id}&level=${l}`],
  ['kgqq/kg', (id, t, l) => `http://175.27.166.236/kgqq/kg.php?type=${t}&id=${id}&level=${l}`],
]

/** 判定返回模式 */
function classify(r) {
  const ct = r.ct
  if (ct.startsWith('audio/')) return { ok: true, mode: 'AUDIO', ct }
  if (ct.startsWith('application/json') || /^[\s]*[{"[]/.test(r.body)) {
    let j = null
    try { j = JSON.parse(r.body) } catch {}
    const url = j?.data?.url || j?.url || j?.data
    if (url && typeof url === 'string' && /^https?:/.test(url)) {
      return { ok: true, mode: 'JSON', ct, url: url.slice(0, 70), code: j.code, msg: j.msg }
    }
    return { ok: false, mode: 'JSON', ct, code: j?.code, msg: String(j?.msg || r.body).replace(/\s+/g, ' ').slice(0, 60) }
  }
  return { ok: false, mode: 'HTTP', ct: ct.slice(0, 25), msg: r.body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 40) }
}

;(async () => {
  const argv = process.argv.slice(2)
  const plats = argv.filter((a) => ID[a])
  const usePlat = plats.length ? plats : Object.keys(ID)
  const result = []
  for (const p of usePlat) {
    for (const [gname, fn] of GWS) {
      for (const t of ['mp3', 'flac']) {
        for (const l of LEVELS) {
          const r = await get(fn(ID[p], t, l))
          const c = classify(r)
          result.push({ p, gname, t, l, ...c })
          if (c.ok) console.log(`OK  ${p.padEnd(3)} ${gname.padEnd(10)} type=${t.padEnd(5)} level=${l.padEnd(11)} ${c.mode} ${c.url || c.ct}`)
        }
      }
    }
  }
  console.log('\n=== 每个平台的可用组合 ===')
  for (const p of usePlat) {
    const ok = result.filter((r) => r.p === p && r.ok)
    const byGw = {}
    for (const r of ok) (byGw[r.gname] ??= new Set()).add(`${r.t}/${r.l}`)
    console.log(`\n${p}:`)
    for (const [g, set] of Object.entries(byGw)) console.log(`   ${g.padEnd(10)} → ${[...set].join('  ')}`)
    if (!ok.length) console.log('   (无)')
  }
})()
