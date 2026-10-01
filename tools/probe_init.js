#!/usr/bin/env node
'use strict'
/**
 * 音源装载体检（只跑到 inited，不联网取链）
 * ------------------------------------------------------------------
 * 用法：node tools/probe_init.js <脚本路径>
 *
 * 为什么需要它：`node --check` 只能查出语法错误，查不出「语法没问题但一装载就炸」
 * （顶层引用了不存在的全局、lx 还没暴露就调 lx.on、抛了未捕获的 Promise……）。
 * 洛雪那边这两种错误待遇完全不同：
 *   - 语法错误  → executeJavaScript 直接 reject，且被 `.catch(e => e)` 静默吞掉，
 *                  界面永远卡在「音源初始化中」，连自动退回官方源都不会触发；
 *   - 装载报错  → 洛雪会弹「音源初始化失败」并自动退回官方源，还能抢救。
 * 所以本脚本的失败只当**警告**报给用户，自动降级仍以语法/头部检查为准。
 *
 * 退出码：0 = 装载成功；1 = 装载失败
 */

const fs = require('fs')
const path = require('path')
const { loadSource } = require('./lx_runtime')

const file = process.argv[2]
if (!file) {
  console.error('用法：node tools/probe_init.js <脚本路径>')
  process.exit(2)
}

;(async () => {
  let handle
  try {
    handle = await loadSource(path.resolve(file))
  } catch (e) {
    console.log(`装载异常：${e.message}`)
    process.exit(1)
  }
  if (handle.loadError) {
    console.log(handle.loadError)
    process.exit(1)
  }
  const platforms = Object.keys(handle.sources || {})
  if (!platforms.length) {
    console.log('脚本没有声明任何受支持的平台')
    process.exit(1)
  }
  console.log(`装载成功，声明平台：${platforms.join(' ')}`)
  process.exit(0)
})()
