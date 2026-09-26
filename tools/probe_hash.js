// 探测 grass/flower 的 vinfo.m 校验哈希到底算的是什么
const fs = require('fs')
const c = require('crypto')
const md5 = (s) => c.createHash('md5').update(s).digest('hex')

const targets = {
  grass: 'a58de3be76df7ebe45a46e940ad0e362',
  flower: '9ee1b5749b81220180c9978530f8ad2e',
}

for (const [name, target] of Object.entries(targets)) {
  const raw = fs.readFileSync(name + '/1.js', 'utf8')
  const lf = raw.replace(/\r\n/g, '\n')
  const noHeader = lf.replace(/^\/\*![\s\S]*?\*\/\n/, '')
  const si = { name: name === 'grass' ? '野草🌾' : '野花🌷', version: '1' }
  const cands = {
    raw,
    lf,
    noHeader,
    noHeader_crlf: noHeader.replace(/\n/g, '\r\n'),
    name: si.name,
    name_ver: si.name + '1',
    md5raw: md5(raw),
    md5lf: md5(lf),
    md5noHeader: md5(noHeader),
    name_md5raw: si.name + md5(raw),
    name_md5lf: si.name + md5(lf),
    ver_md5lf: '1' + md5(lf),
    verX_md5lf: '1_' + md5(lf),
    rawTrim: lf.trim(),
    rawTrimEnd: lf.replace(/\s+$/, ''),
    verX_raw: '1' + lf,
    nameX_raw: si.name + lf,
  }
  const hit = []
  for (const k in cands) if (md5(String(cands[k])) === target) hit.push(k)
  console.log(name, hit.length ? 'MATCH ' + hit : 'no match')
}
