'use strict'
/**
 * LX Music 自定义源运行时（Node 版复刻）
 * ------------------------------------------------------------------
 * 精确复刻 lx-music-desktop 2.12.6 的 user-api-preload.js + userApi/main.ts 行为，
 * 用于在命令行里离线/在线测试仓库中的任意音源脚本。
 *
 * 复刻要点（均来自 app.asar 反编译）：
 *  1. lx.request 包装 request 库：options.timeout -> response_timeout（上限 60000）
 *  2. 不跟随 302（follow_max=0 / follow_if_same_host=false），3xx 原样返回
 *  3. body = raw.toString()，能 JSON.parse 就转成对象
 *  4. open_timeout = 10000
 *  5. inited 时按平台白名单 / 音质白名单过滤声明
 *     platforms = ['kw','kg','tx','wy','mg','xm','local']
 *     qualitys  = ['128k','320k','flac','flac24bit']
 *     非 local 只保留 musicUrl
 *  6. musicUrl 返回值必须是 string、<=2048 字符、^https?，否则判为 failed
 *  7. 主进程每个 action 有 20000ms 硬超时
 */

const fs = require('fs')
const vm = require('vm')
const http = require('http')
const https = require('https')
const { URL } = require('url')
const zlib = require('zlib')

const PLATFORM_WHITELIST = ['kw', 'kg', 'tx', 'wy', 'mg', 'xm', 'local']
const QUALITY_WHITELIST = ['128k', '320k', 'flac', 'flac24bit']
const MAIN_TIMEOUT = 20000
const OPEN_TIMEOUT = 10000
const MAX_BODY = 1024 * 200

// 音源脚本在 inited 之前常会产生未捕获的 Promise 拒绝（LX 也会报 init 错误而不是崩溃），
// 这里挂个全局处理器把它们收走，否则会打断测试进程。
process.on('unhandledRejection', (e) => { if (process.env.DEBUG_REJ) console.error('  \u2757 unhandledRejection:', e?.stack || e) })

/** 解析音源头部注释（LX 同样会把这些字段给 currentScriptInfo） */
function parseScriptInfo(script) {
  const head = script.slice(0, 2000)
  const get = (key) => {
    const m = head.match(new RegExp('@' + key + '\\s+([^\\n*]+)'))
    return m ? m[1].trim() : ''
  }
  return {
    name: get('name'),
    description: get('description'),
    version: get('version'),
    author: get('author'),
    homepage: get('homepage'),
    rawScript: script,
  }
}

/** 底层请求：模拟 request 库，不跟随重定向 */
function rawRequest(url, opts, cb) {
  const method = String(opts.method || 'get').toUpperCase()
  const responseTimeout = typeof opts.timeout === 'number' && opts.timeout > 0 ? Math.min(opts.timeout, 60000) : 60000
  let payload = null
  const headers = { ...(opts.headers || {}) }
  if (opts.body != null) {
    payload = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
    if (!headers['content-type'] && typeof opts.body !== 'string') headers['Content-Type'] = 'application/json'
  } else if (opts.form) {
    payload = new URLSearchParams(opts.form).toString()
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  if (payload) headers['Content-Length'] = Buffer.byteLength(payload)

  let u
  try { u = new URL(url) } catch (e) { return cb(new Error('invalid url')) }
  const lib = u.protocol === 'https:' ? https : http
  const started = Date.now()
  let settled = false
  const done = (err, res) => {
    if (settled) return
    settled = true
    cb(err, res)
  }

  const req = lib.request({
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    method,
    headers: { 'User-Agent': 'Mozilla/5.0', ...headers },
    rejectUnauthorized: false,
  }, (res) => {
    const encodings = { gzip: 'gunzip', deflate: 'inflate', br: 'br' }
    let stream = res
    const enc = String(res.headers['content-encoding'] || '').toLowerCase()
    if (encodings[enc]) {
      try { stream = res.pipe(zlib.create(encodings[enc])) } catch (e) { stream = res }
    }
    const chunks = []
    let size = 0
    stream.on('data', (c) => {
      size += c.length
      if (size <= MAX_BODY) chunks.push(c)
    })
    stream.on('error', (e) => done(e))
    stream.on('end', () => {
      const raw = Buffer.concat(chunks)
      let body = raw.toString('utf8')
      try { body = JSON.parse(body) } catch (e) { /* 保持字符串 */ }
      done(null, {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        headers: res.headers,
        bytes: raw.length,
        raw,
        body,
      })
    })
  })

  const timer = setTimeout(() => {
    req.destroy(new Error('response timeout'))
  }, responseTimeout)
  timer.unref?.()
  const openTimer = setTimeout(() => {
    if (Date.now() - started < OPEN_TIMEOUT - 50) { /* 交由 response_timeout 处理 */ }
  }, OPEN_TIMEOUT)
  openTimer.unref?.()

  req.on('error', (e) => { clearTimeout(timer); done(e) })
  req.on('response', () => clearTimeout(openTimer))
  if (payload) req.write(payload)
  req.end()
}

/**
 * 加载一个音源脚本，返回测试句柄
 * @param {string} filePath 音源 JS 路径
 */
function loadSource(filePath) {
  const script = fs.readFileSync(filePath, 'utf8')
  const calls = []
  const netLog = []
  let initedPayload = null
  let requestHandler = null
  const logs = []

  const EVENT_NAMES = { request: 'user_api_request', inited: 'user_api_inited' }
  const lx = {
    EVENT_NAMES,
    request(url, options, cb) {
      const t0 = Date.now()
      return rawRequest(url, options, (err, res) => {
        netLog.push({ url: String(url), ms: Date.now() - t0, status: res?.statusCode ?? 0, err: err?.message, ct: res?.headers?.['content-type'], body: (() => { const b = res?.body; if (b == null) return ''; try { return typeof b === 'string' ? b.slice(0, 4000) : JSON.stringify(b).slice(0, 4000) } catch { return String(b).slice(0, 500) } })() })
        if (err) return cb(err, null, null)
        cb(null, { statusCode: res.statusCode, statusMessage: res.statusMessage, headers: res.headers, bytes: res.bytes, body: res.body }, res.body)
      })
    },
    on(name, handler) {
      if (name === EVENT_NAMES.request) requestHandler = handler
      return Promise.resolve()
    },
    send(name, payload) {
      if (name === EVENT_NAMES.inited) initedPayload = payload
      return Promise.resolve()
    },
    utils: {
      crypto: {
        aesEncrypt: (d, k, i, o) => { const c = require('crypto').createCipheriv(k, i, o); return Buffer.concat([c.update(d), c.final()]) },
        rsaEncrypt: (d, k) => { const c = require('crypto').publicEncrypt({ key: k, padding: require('crypto').constants.RSA_NO_PADDING }, Buffer.concat([Buffer.alloc(128 - d.length), d])); return c },
        randomBytes: (n) => require('crypto').randomBytes(n),
        md5: (d) => require('crypto').createHash('md5').update(d).digest('hex'),
      },
      buffer: { from: (...a) => Buffer.from(...a), bufToString: (b, e) => Buffer.from(b, 'binary').toString(e) },
      zlib: {
        inflate: (b) => new Promise((res, rej) => zlib.inflate(b, (e, o) => (e ? rej(e) : res(o)))),
        deflate: (b) => new Promise((res, rej) => zlib.deflate(b, (e, o) => (e ? rej(e) : res(o)))),
      },
    },
    currentScriptInfo: parseScriptInfo(script),
    version: '2.0.0',
    env: 'desktop',
  }

  const sandbox = {
    lx,
    console: {
      log: (...a) => logs.push(a.join(' ')),
      warn: (...a) => logs.push('[warn] ' + a.join(' ')),
      error: (...a) => logs.push('[error] ' + a.join(' ')),
      info: (...a) => logs.push(a.join(' ')),
      debug: () => {},
      group: (...a) => logs.push('[group] ' + a.join(' ')),
      groupEnd: () => {},
      groupCollapsed: (...a) => logs.push('[group] ' + a.join(' ')),
      table: (...a) => logs.push('[table] ' + a.map((x) => JSON.stringify(x)).join(' ')),
      trace: (...a) => logs.push('[trace] ' + a.join(' ')),
      dir: (...a) => logs.push('[dir] ' + a.map((x) => typeof x).join(' ')),
      time: () => {},
      timeEnd: () => {},
      count: () => {},
      assert: () => {},
    },
    setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
    queueMicrotask, structuredClone,
    URL, URLSearchParams, TextDecoder, TextEncoder, Buffer,
    Promise, Math, JSON, Date, Object, Array, String, Number, Boolean, Symbol, RegExp, Error, TypeError, Map, Set, WeakMap, WeakSet, Proxy, Reflect, isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, Intl, Atomics, SharedArrayBuffer, AbortController, AbortSignal, fetch: undefined,
  }
  sandbox.globalThis = sandbox
  sandbox.self = sandbox
  sandbox.window = sandbox
  vm.createContext(sandbox)
  try {
    vm.runInContext(script, sandbox, { filename: filePath, timeout: 20000 })
  } catch (e) {
    return { filePath, logs, declared: initedPayload, sources: {}, dropped: [], netLog, call: null, loadError: e.message }
  }

  // 有些脚本把 send(inited) 放在 Promise 链里，等一拍
  return new Promise((resolve) => setTimeout(() => resolve(wrapHandle()), 1500))

  function wrapHandle() {
  // 模拟 LX 侧过滤（preload 的 x() 函数）
  const sources = {}
  for (const p of PLATFORM_WHITELIST) {
    const decl = initedPayload?.sources?.[p]
    if (!decl || decl.type !== 'music') continue
    const actions = ['musicUrl'].filter((a) => (decl.actions || []).includes(a))
    const qualitys = QUALITY_WHITELIST.filter((q) => (decl.qualitys || []).includes(q))
    sources[p] = { type: 'music', actions, qualitys }
  }
  // 被 LX 丢弃的声明（仅提示）
  const dropped = Object.keys(initedPayload?.sources || {}).filter((p) => !PLATFORM_WHITELIST.includes(p))

  if (!requestHandler) {
    return { filePath, logs, declared: initedPayload, sources, dropped, netLog, call: null, loadError: '脚本没有注册 EVENT_NAMES.request 处理器' }
  }

  return {
    filePath,
    logs,
    scriptInfo: lx.currentScriptInfo,
    declared: initedPayload,
    sources,
    dropped,
    /**
     * 调一次 action（走完整校验 + 20s 主进程超时）
     */
    async call(action, source, info) {
      const t0 = Date.now()
      let timer
      try {
        const raw = requestHandler({ source, action, info })
        const value = await Promise.race([
          Promise.resolve(raw),
          new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('主进程 20s 硬超时')), MAIN_TIMEOUT) }),
        ])
        const elapsed = Date.now() - t0
        if (action === 'musicUrl') {
          if (typeof value !== 'string' || value.length > 2048 || !/^https?:/.test(value)) {
            return { ok: false, elapsed, error: '返回值不是合法音频URL', value }
          }
        }
        return { ok: true, elapsed, value }
      } catch (e) {
        return { ok: false, elapsed: Date.now() - t0, error: e?.message || String(e), value: e?.value, stack: e?.stack }
      } finally {
        clearTimeout(timer)
      }
    },

    /** 发一个探测请求并记录，用于观察脚本访问了哪些接口 */
    get calls() { return calls },
    get netLog() { return netLog },
  }
  }
}

module.exports = { loadSource, rawRequest, PLATFORM_WHITELIST, QUALITY_WHITELIST, MAIN_TIMEOUT }
