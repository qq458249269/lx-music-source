#!/usr/bin/env python3
"""洛雪自定义音源自动更新器

从 GitHub 拉取仓库里的 latest.js，若版本比本地已安装的新，就直接改写
洛雪的 user_api.json —— 等价于「重新导入」，但不需要点任何按钮。

为什么必须由外部程序来做：自定义源脚本运行在洛雪的 user-api 页面里，
只拿得到 lx 这一个 bridge（request/send/utils），没有文件读写、也无法重载
自身。所以「自动替换已安装的源」只能从外面改 user_api.json。

用法：
    python UpdateInstalled.py              # 检查并更新（默认 aggregator）
    python UpdateInstalled.py --check      # 只检查，不写入
    python UpdateInstalled.py --source qdy # 更新指定源
    python UpdateInstalled.py --task       # 注册 Windows 计划任务，每 6 小时自动跑一次
    python UpdateInstalled.py --task --remove

注意：写入后需要重启洛雪才会生效（LX 启动时才读 user_api.json）。
      加 --restart 会在写入后自动重启。
"""

import argparse
import base64
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple

REPO = 'qq458249269/lx-music-source'
BRANCH = 'main'

# 加速源优先，直连 raw 兜底。全部指向同一个文件。
# 注意：ghproxy.cn 已失效（返回 200 但是拦截页），不要加进来。
MIRRORS: List[str] = [
    'https://ghfast.top/https://raw.githubusercontent.com/{repo}/{branch}/{path}',
    'https://gh-proxy.com/https://raw.githubusercontent.com/{repo}/{branch}/{path}',
    'https://ghproxy.net/https://raw.githubusercontent.com/{repo}/{branch}/{path}',
    'https://raw.githubusercontent.com/{repo}/{branch}/{path}',
]

TASK_NAME = 'lx-music-source-update'
UA = {'User-Agent': 'Mozilla/5.0'}

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


# ────────────────────────── 基础工具 ──────────────────────────

def parse_version(text: str) -> Optional[Tuple[int, int, int]]:
    """从 'v1.3.3' / '1.3.3' 里解析出 (1, 3, 3)"""
    m = re.search(r'(\d+)(?:\.(\d+))?(?:\.(\d+))?', str(text or ''))
    if not m:
        return None
    return (int(m.group(1)), int(m.group(2) or 0), int(m.group(3) or 0))


def is_newer(a: Tuple[int, int, int], b: Tuple[int, int, int]) -> bool:
    return a > b


def script_meta(raw: bytes) -> Dict[str, str]:
    """读取音源头部注释里的 @name/@version/@description 等字段"""
    head = raw[:2000].decode('utf-8', 'replace')
    meta: Dict[str, str] = {}
    for key in ('name', 'description', 'version', 'author', 'homepage'):
        m = re.search(r'@' + key + r'\s+([^\n*]+)', head)
        meta[key] = m.group(1).strip() if m else ''
    return meta


def data_dir() -> Path:
    """定位洛雪的数据目录"""
    system = platform.system()
    if system == 'Windows':
        base = Path(os.environ.get('APPDATA', Path.home() / 'AppData/Roaming'))
    elif system == 'Darwin':
        base = Path.home() / 'Library/Application Support'
    else:
        base = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
    return base / 'lx-music-desktop' / 'LxDatas'


def user_api_file() -> Path:
    return data_dir() / 'user_api.json'


# ────────────────────────── 下载 ──────────────────────────

def download(path: str, timeout: int = 15) -> bytes:
    """按加速源优先级依次尝试，返回第一个成功的文件内容"""
    errors: List[str] = []
    for tpl in MIRRORS:
        url = tpl.format(repo=REPO, branch=BRANCH, path=path)
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            # 加速源失效时经常返回 200 + 拦截页，靠内容特征识别
            if b'@version' not in data[:2000] and b'@name' not in data[:2000]:
                errors.append(f'{url} → 不是音源文件（拦截页？）')
                continue
            print(f'  ✅ 来自 {url}')
            return data
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            errors.append(f'{url} → {e}')
    raise RuntimeError('所有地址都拉取失败：\n    ' + '\n    '.join(errors))


# ────────────────────────── 写入 ──────────────────────────

def pack_script(raw: bytes) -> str:
    """
    按洛雪的存储格式打包：'gz_' + zlib deflate + base64
    （洛雪的 userApi/utils.ts 用 pako deflate 压缩后存 base64，读取时 inflate）
    """
    # 用 zlib 默认压缩级别，与洛雪自己存储时的输出一致（避免无谓的体积差异）
    return 'gz_' + base64.b64encode(zlib.compress(raw)).decode()


def install(raw: bytes, restart: bool) -> bool:
    """
    把新脚本写进 user_api.json。
    返回 True 表示确实更新了。
    """
    f = user_api_file()
    if not f.exists():
        raise FileNotFoundError(f'找不到 {f}，请先在洛雪里导入一次音源')

    data = json.loads(f.read_text(encoding='utf-8'))
    apis = data.get('userApis', [])
    if not apis:
        raise RuntimeError('user_api.json 里没有任何音源')

    meta = script_meta(raw)
    new_ver = parse_version(meta.get('version', ''))
    if not new_ver:
        raise RuntimeError(f'无法解析新脚本版本号：{meta.get("version")!r}')

    # 按名字匹配已安装的源；匹配不到就取唯一那个（只装了一个源时）
    target = None
    for api in apis:
        if meta.get('name') and api.get('name') == meta['name']:
            target = api
            break
    if target is None and len(apis) == 1:
        target = apis[0]
    if target is None:
        raise RuntimeError(f'在 user_api.json 里找不到名为「{meta.get("name")}」的源')

    old_ver = parse_version(target.get('version', ''))
    if old_ver and not is_newer(new_ver, old_ver):
        print(f'✅ 已是最新：{target.get("name")} {target.get("version")}（线上 {meta["version"]}）')
        return False

    print(f'🔄 更新 {target.get("name")}：{target.get("version")} → {meta["version"]}')

    # 备份一次，只留最新的一份
    bak = f.with_suffix('.json.bak')
    if bak.exists():
        bak.unlink()
    shutil.copy2(f, bak)

    target['name'] = meta.get('name') or target.get('name')
    target['description'] = meta.get('description') or ''
    target['version'] = meta.get('version') or ''
    target['author'] = meta.get('author') or ''
    target['homepage'] = meta.get('homepage') or ''
    target['script'] = pack_script(raw)
    # 允许脚本弹更新提示，否则 in-script 的自更新提示会被静默丢弃
    target['allowShowUpdateAlert'] = True

    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'✅ 已写入 {f}（原文件备份为 {bak.name}）')

    if restart:
        restart_lx()
    else:
        print('ℹ️  需重启洛雪后生效；想自动重启请加 --restart')
    return True


def restart_lx() -> None:
    """重启洛雪，让新脚本立刻生效"""
    system = platform.system()
    print('↻  正在重启洛雪…')
    if system == 'Windows':
        subprocess.run(['taskkill', '/IM', 'lx-music-desktop.exe', '/F'],
                       capture_output=True)
        time.sleep(2)
        exe = Path('D:/software/lxmusic/lx-music-desktop/lx-music-desktop.exe')
        if not exe.exists():
            cands = list(Path('C:/Program Files').glob('lx-music*/lx-music-desktop.exe'))
            exe = cands[0] if cands else exe
        if exe.exists():
            subprocess.Popen([str(exe)], cwd=str(exe.parent))
        else:
            print('⚠️  没找到 lx-music-desktop.exe，请手动重启')
    elif system == 'Darwin':
        subprocess.run(['osascript', '-e', 'quit app "lx-music-desktop"'], capture_output=True)
        time.sleep(2)
        subprocess.Popen(['open', '-a', 'lx-music-desktop'])
    else:
        subprocess.run(['pkill', '-f', 'lx-music-desktop'], capture_output=True)
        time.sleep(2)
        subprocess.Popen(['lx-music-desktop'])


# ────────────────────────── 计划任务（Windows）──────────────────────────

def register_task(interval_hours: int) -> None:
    """注册 Windows 计划任务，周期性自动更新"""
    if platform.system() != 'Windows':
        print('❌ 只有 Windows 支持 --task，其他系统请用 cron 调本脚本')
        sys.exit(1)
    script = Path(__file__).resolve()
    # 用 pythonw 避免每次弹黑框；--restart 让更新后立刻生效
    pythonw = Path(sys.executable).with_name('pythonw.exe')
    exe = str(pythonw if pythonw.exists() else Path(sys.executable))
    cmd = f'"{exe}" "{script}" --restart'

    subprocess.run(['schtasks', '/Delete', '/TN', TASK_NAME, '/F'], capture_output=True)
    every = f'{interval_hours // 24:02d}:00' if interval_hours >= 24 else None
    args = ['schtasks', '/Create', '/TN', TASK_NAME, '/TR', cmd, '/SC', 'HOURLY', '/MO', str(interval_hours), '/F']
    if every:
        args = ['schtasks', '/Create', '/TN', TASK_NAME, '/TR', cmd, '/SC', 'DAILY', '/ST', '03:30', '/F']
    r = subprocess.run(args, capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode == 0:
        print(f'✅ 已注册计划任务「{TASK_NAME}」，每 {interval_hours} 小时检查一次')
        print('   卸载：python UpdateInstalled.py --task --remove')


def remove_task() -> None:
    r = subprocess.run(['schtasks', '/Delete', '/TN', TASK_NAME, '/F'],
                       capture_output=True, text=True)
    print((r.stdout or r.stderr).strip())
    sys.exit(r.returncode)


# ────────────────────────── 入口 ──────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description='洛雪自定义音源自动更新器')
    ap.add_argument('--source', default='aggregator', help='要更新的源目录名（默认 aggregator）')
    ap.add_argument('--check', action='store_true', help='只检查，不写入')
    ap.add_argument('--restart', action='store_true', help='写入后自动重启洛雪')
    ap.add_argument('--task', action='store_true', help='注册/卸载 Windows 计划任务')
    ap.add_argument('--remove', action='store_true', help='配合 --task 卸载计划任务')
    ap.add_argument('--hours', type=int, default=6, help='计划任务间隔小时数（默认 6）')
    args = ap.parse_args()

    if args.task:
        if args.remove:
            remove_task()
        register_task(args.hours)
        return

    print(f'检查 {args.source}/latest.js …')
    try:
        raw = download(f'{args.source}/latest.js')
    except RuntimeError as e:
        print(f'❌ {e}')
        sys.exit(1)

    meta = script_meta(raw)
    print(f'  线上版本：{meta.get("name")} {meta.get("version")}')

    if args.check:
        f = user_api_file()
        if not f.exists():
            print(f'ℹ️  未找到 {f}，尚未安装任何音源')
            return
        data = json.loads(f.read_text(encoding='utf-8'))
        online = parse_version(meta.get('version', '')) or (0, 0, 0)
        for api in data.get('userApis', []):
            local = parse_version(api.get('version', '')) or (0, 0, 0)
            same_name = api.get('name') == meta.get('name')
            mark = '⬅ 需更新' if same_name and online > local else ''
            print(f'  本地：{api.get("name")} {api.get("version")} {mark}'.rstrip())
        return

    try:
        install(raw, args.restart)
    except Exception as e:  # noqa: BLE001
        print(f'❌ {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
