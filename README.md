# lx-music-source
洛雪音乐源，内容源于网络

---

## ⚠️ 各源可用状态（2026-09 实测）

| 源 | 版本 | 可用平台 | 状态 | 失效原因 |
|---|---|---|---|---|
| **qdy** | 9.3 | **wy ✅, kw ✅** | ⚠️ 部分可用 | tx/kg/mg 走 `.php` 网关假链接，仅网易云、酷我可用 |
| **sixyin** | 1.2.1 | **wy ✅** | ⚠️ 部分可用 | 后端 `lx.itooi.cn` 已暂停；kw 被 `mobi.kuwo.cn` 403 |
| changqing | 1.3.0 | — | ❌ 失效 | `yinyue.haitangw.net` HTTPS 端口超时 |
| flower | 1 | — | ❌ 失效 | 后端 `97.64.37.235/flower/v1/*` 路由已移除（404） |
| grass | 1 | — | ❌ 失效 | 后端 `97.64.37.235/grass/v1/*` 路由已移除（404） |
| huanyin | 3 | — | ❌ 失效 | `music-dl.sayqz.com` 域名已删除（DNS 无解析） |
| huibq | 1.2.0 | — | ❌ 失效 | `lxmusicapi.onrender.com` 全部 503（服务已死） |
| ikun | 22 | — | ❌ 失效 | `api.ikunshare.com` 域名已删除（DNS 无解析） |
| juhe | 3 | — | ❌ 失效 | `api.music.lerd.dpdns.org/init.conf` 返回 429 |
| lx | 6 | — | ❌ 失效 | 不注册 `request` 处理器；依赖 `88.lxmusic.中国` 服务端 |

> 📌 **本仓库仅 qdy（wy/kw）和 sixyin（wy）可用**，其余源的上游服务均已下线，无法通过修改本地脚本修复。

---

## 在线导入 - 原始链接

### QDY（推荐，支持 网易云 + 酷我）
```
https://raw.githubusercontent.com/pdone/lx-music-source/main/qdy/latest.js
```

### SixYin（仅网易云）
```
https://raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js
```

### 其他源（均失效，仅供参考）

<details>
<summary>展开查看所有失效源链接</summary>

```
https://raw.githubusercontent.com/pdone/lx-music-source/main/changqing/latest.js
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
node tools/e2e.js --verify qdy sixyin

# 显示详细网络请求
SHOW_NET=1 node tools/e2e.js qdy

# 显示完整响应体
SHOW_NET=1 SHOW_BODY=1 node tools/e2e.js --verify qdy

# 显示错误堆栈
SHOW_STACK=1 node tools/e2e.js qdy

# 直接探测某个 URL 是否为音频
node tools/probe_url.js http://example.com/audio.mp3

# 检查 .php 网关链接的重定向链
node tools/probe_redirect.js "http://example.com/xxx.php?type=mp3&id=xxx"
```

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