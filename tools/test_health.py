"""UpdateInstalled.py 体检/降级/复位逻辑的离线自测（不碰真实洛雪）"""
import base64
import importlib.util
import json
import os
import sys
import tempfile
import zlib
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ui', REPO / 'UpdateInstalled.py')
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)

# 绝不动真实洛雪
ui.lx_running = lambda: False
ui.stop_lx = lambda: print('   [mock] 停洛雪')
ui.start_lx = lambda: print('   [mock] 启洛雪')
_state: dict = {}
ui.save_state = lambda st: _state.update(st)
ui.load_state = lambda: dict(_state)

GOOD = (REPO / 'aggregator' / 'latest.js').read_text(encoding='utf-8')
BROKEN = GOOD.replace("const ALL_PLATFORMS =", "const ALL_PLATFORMS = ((((")  # 人为制造语法错误
NOBANG = 'var x = 1\n' + GOOD  # 头部注释不在第一行 → LX 判「无效的自定义源文件」


def pack(code: str) -> str:
    return 'gz_' + base64.b64encode(zlib.compress(code.encode('utf-8'))).decode()


def make_apis() -> list:
    # 故意把坏源放第一位：模拟「第一个音源解析报错」的真实情形
    return [
        {'id': 'user_api_bbb', 'name': '坏源B', 'version': 'v2.0.0', 'script': pack(BROKEN)},
        {'id': 'user_api_ccc', 'name': '无头源C', 'version': 'v3.0.0', 'script': pack(NOBANG)},
        {'id': 'user_api_aaa', 'name': '好源A', 'version': 'v1.0.0', 'script': pack(GOOD)},
    ]


def setup(active: str) -> None:
    d = Path(os.environ['APPDATA']) / 'lx-music-desktop' / 'LxDatas'
    d.mkdir(parents=True, exist_ok=True)
    (d / 'user_api.json').write_text(json.dumps({'userApis': make_apis()}, ensure_ascii=False), encoding='utf-8')
    (d / 'config_v2.json').write_text(json.dumps({'setting': {'common.apiSource': active}}, ensure_ascii=False), encoding='utf-8')


def state() -> tuple:
    d = Path(os.environ['APPDATA']) / 'lx-music-desktop' / 'LxDatas'
    apis = json.loads((d / 'user_api.json').read_text(encoding='utf-8'))['userApis']
    active = json.loads((d / 'config_v2.json').read_text(encoding='utf-8'))['setting']['common.apiSource']
    return [a['name'] for a in apis], active


def run(title: str, active: str) -> None:
    print(f'\n=== {title} ===')
    setup(active)
    ui.print_health(r := ui.health_report())
    ui.apply_health(r)
    print('   结果：', state())
    r2 = ui.health_report()
    print(f'   二次体检：需改顺序={r2.order_changed} 需切源={r2.active_changed}')


with tempfile.TemporaryDirectory() as td:
    os.environ['APPDATA'] = td
    run('场景1：生效中的源语法错误 → 降权并切到好源', 'user_api_bbb')
    run('场景2：生效中的源缺头部注释 → 降权并切到好源', 'user_api_ccc')
    print('\n=== 场景3：全部自定义源都坏 → 退回官方源 kw ===')
    setup('user_api_bbb')
    d = Path(td) / 'lx-music-desktop' / 'LxDatas' / 'user_api.json'
    dd = json.loads(d.read_text(encoding='utf-8'))
    for a in dd['userApis']:
        if a['id'] == 'user_api_aaa':
            a['script'] = pack(NOBANG)  # 好源也弄坏 → 三个全坏
    d.write_text(json.dumps(dd, ensure_ascii=False), encoding='utf-8')
    _state.clear()
    ui.print_health(r := ui.health_report())
    ui.apply_health(r)
    print('   结果：', state())

    print('\n=== 场景4：坏源修好后自动复位 ===')
    setup('kw')
    # 先让坏源坏着体检一次（记下降级状态）
    ui.print_health(r := ui.health_report())
    ui.apply_health(r)
    print('   降级后：', state())
    # 现在把坏源修好（换成正常脚本），再体检
    d = Path(td) / 'lx-music-desktop' / 'LxDatas' / 'user_api.json'
    data = json.loads(d.read_text(encoding='utf-8'))
    for a in data['userApis']:
        if a['id'] == 'user_api_bbb':
            a['script'] = pack(GOOD)
    d.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    ui.print_health(r := ui.health_report())
    ui.apply_health(r)
    print('   复位后：', state())
