# lx-music-source
洛雪音乐源，内容源于网络

---

## ⚠️ 各源可用状态（2026-09-26 实测）

实测方法：`node tools/e2e.js --verify`（Range GET 跟随重定向，判 `content-type: audio/*`）。
注：LX 播放器**会**跟随重定向（只有脚本内的 `lx.request` 不跟随），所以 `.php` 网关链只要能跳到真音频就算可用。

| 源 | 版本 | 可用平台 | 状态 | 说明 |
|---|---|---|---|---|
| **qdy** | 9.3 | **wy, kw** | ✅ 推荐 | tx 返回 302 到空首页(403)；kg 返回 `{"code":201}`；mg 404 |
| **changqing** | 1.3.0 | **wy, tx, kw, kg** | ✅ 推荐 | mg 返回 500 JSON。注意 tx/kg 后端会**降级到酷我**资源，可能取到错误的歌 |
| **sixyin** | 1.2.1 | **wy** | ⚠️ 部分可用 | 后端 `lx.itooi.cn` 已暂停；`mobi.kuwo.cn` 403，仅网易云走官方接口存活 |
| flower | 1 | — | ❌ 失效 | 后端 `97.64.37.235/flower/v1/*` 路由已移除（404） |
| grass | 1 | — | ❌ 失效 | 后端 `97.64.37.235/grass/v1/*` 路由已移除（404） |
| huanyin | 3 | — | ❌ 失效 | `music-dl.sayqz.com` 域名已删除（DNS 无解析） |
| huibq | 1.2.0 | — | ❌ 失效 | `lxmusicapi.onrender.com` 全部 503（服务已死） |
| ikun | 22 | — | ❌ 失效 | `api.ikunshare.com` 域名已删除（DNS 无解析）；且声明了非白名单的 `git` 源被 LX 丢弃 |
| juhe | 3 | — | ❌ 失效 | `api.music.lerd.dpdns.org/init.conf` 返回 429，初始化即失败 |
| lx | 6 | — | ❌ 失效 | 不注册 `request` 处理器；依赖 `88.lxmusic.中国` 服务端 |

> 📌 **本仓库仅 qdy / changqing / sixyin 三个源可用**，其余 7 个源的上游服务均已下线，无法通过修改本地脚本修复。
> 若要 QQ 音乐 + 无损，优先试 `changqing`（但 tx/kg 会降级到酷我）；要纯网易云无损用 `qdy`。

### ⚠️ Windows 克隆必读

`grass` / `flower` 会对脚本内容做 md5 校验。仓库已加 `.gitattributes` 强制 LF 行尾，
若你手动改过行尾或用旧版检出过，请执行 `git checkout -- .` 重新检出，否则这两个源会报「服务器异常」。

---

## 在线导入 - 原始链接

### QDY（推荐，网易云 + 酷我，链路最稳）
```
https://raw.githubusercontent.com/pdone/lx-music-source/main/qdy/latest.js
```

### ChangQing（QQ + 酷狗 + 酷我 + 网易云）
```
https://raw.githubusercontent.com/pdone/lx-music-source/main/changqing/latest.js
```

### SixYin（仅网易云）
```
https://raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js
```

### 其他源（均失效，仅供参考）

<details>
<summary>展开查看所有失效源链接</summary>

```
https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js
https://raw.githubusercontent.com/pdone/lx-music-source/main/grass/latest.js
https://raw.githubusercontent.com/pdone/lx-music-source/main/huanyin/latest.js
https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js
https://raw.githubusercontent.com/pdone/lx-music-source/main/ikun/latest.js
https://raw.githubusercontent.com/pdone/lx-music-source/main/juhe/latest.js
https://raw.githubusercontent.com/pdone/lx-music-source/main/lx/latest.js
```

</details>

## 在线导入 - 加速链接

### QDY（推荐）
```
https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/qdy/latest.js
```

### ChangQing
```
https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/changqing/latest.js
```

### SixYin
```
https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js
```

### 其他加速站点

当以上链接无法访问时，可将链接开头的 `https://ghproxy.net/` 替换为下边任一地址，然后重试。

- https://gh.llkk.cc/
- https://github.moeyy.xyz/
- https://ghproxy.cn/
- https://gh.api.99988866.xyz/
- https://ghp.ci/
- https://gh-proxy.org/

> 加速链接仅推荐访问 GitHub 受限的用户使用，如果你的网络可以流畅访问 GitHub，建议直接使用原始链接。

---

## 本地检测（自测工具）

仓库提供了基于 Node.js 的端到端测试工具，可验证各源的加载、初始化、声明平台及取链结果：

```bash
# 安装依赖（无需，纯 Node.js 标准库）
# 运行全量测试
node tools/e2e.js

# 只测指定源
node tools/e2e.js qdy sixyin

# 只测指定平台
node tools/e2e.js qdy wy tx

# 真音频验证（Range GET 跟随重定向检查 content-type）
node tools/e2e.js --verify

# 检查 .php 网关链接的重定向链
node tools/probe_redirect.js "http://example.com/xxx.php?type=mp3&id=xxx"

# 调试环境变量
SHOW_NET=1 node tools/e2e.js qdy          # 打印加载期间的网络请求
SHOW_BODY=1 node tools/e2e.js --verify qdy # 打印完整响应体
SHOW_STACK=1 node tools/e2e.js qdy         # 打印错误堆栈
DEBUG_REJ=1 node tools/e2e.js juhe         # 打印未捕获的 Promise 拒绝

# 单文件探测
node tools/probe_url.js "http://example.com/a.mp3"
```

工具文件：

| 文件 | 作用 |
|---|---|
| `tools/lx_runtime.js` | Node 复刻的 LX Music 脚本沙箱（vm + 平台/音质白名单 + 20s 超时 + 返回值校验） |
| `tools/e2e.js` | 端到端体检：加载 → 初始化 → 逐平台逐音质取链 → `--verify` 真音频验证 |
| `tools/ids.json` | 各平台真实歌曲 ID（避免拿假 ID 测试导致误判） |
| `tools/probe_url.js` | 探测单个 URL 的状态码 / content-type / Location |
| `tools/probe_redirect.js` | 跟随重定向链，验证最终是否 `audio/*` |
| `tools/probe_hash.js` | 校验 grass/flower 的 md5 签名（`md5(脚本.trim())`） |

### 判定标准

| 现象 | 含义 |
|---|---|
| `音频验证 OK 206 audio/mpeg` | ✅ 真能播 |
| `音频验证 OK 206 audio/x-flac` | ✅ 真无损 |
| `跟随1次跳转` 仍 OK | ✅ 网关链可用，播放器会跟随重定向 |
| `返回值不是合法音频URL` | ❌ 脚本返回了非 http 字符串（如 HTML/JSON） |
| `audio/*` 但 403 空响应 | ❌ 网关跳到了占位页，播不出来 |

---

## 数据来源

- [SixYin](https://www.sixyin.com/)
- [Huibq/keep-alive](https://github.com/Huibq/keep-alive/)
- [LX](https://www.lxmusic.cc/)
- [ikun](https://github.com/MeoProject/lx-music-api-server)
- ChangQing（长青SVIP音源 by 元力菌）
- HuanYin（幻音音源 by 竹佀）

## 项目地址

- [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop)
- [lx-music-mobile](https://github.com/lyswhut/lx-music-mobile)
- [lx-music-sync-server](https://github.com/lyswhut/lx-music-sync-server)
- [any-listen](https://github.com/any-listen/any-listen)