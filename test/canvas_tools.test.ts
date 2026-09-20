import { describe, it, expect, beforeEach } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { patchElementByNid } from '../src/utils/domPatcher';
import { CanvasToolExecutor } from '../src/services/tools/canvasToolExecutor';
import { resolveToolFromAIResponse } from '../src/services/tools/toolResolver';
import { defaultTheme } from '../src/utils/themePresets';

function freshStore() {
  const store = useProjectStore.getState();
  store.initNewProject({
    name: 'Canvas Tools Test',
    deviceProfile: 'mobile',
    designSystem: defaultTheme,
    createSpecimen: false
  });
  return useProjectStore.getState();
}

describe('CHK-CT-01: patchElementByNid DOM 局部安全替换', () => {
  const sampleHtml = `<main data-nid="root-01" class="col p-4">
  <header data-nid="hdr-01"><h1 data-nid="h1-01">标题</h1></header>
  <div data-nid="target-card" class="card bg-surface p-3">
    <span data-nid="card-text">原始内容</span>
  </div>
  <footer data-nid="ftr-01">页脚</footer>
</main>`;

  it('成功替换指定 nid 元素本身，并保留原 nid 与同层其他节点', () => {
    const patch = `<div class="card bg-surface-alt p-5 shadow-lg"><span class="badge">新品</span><p>全新卡片</p></div>`;
    const res = patchElementByNid(sampleHtml, 'target-card', patch);

    expect(res.success).toBe(true);
    expect(res.html).toContain('data-nid="target-card"'); // 保持原稳定 nid
    expect(res.html).toContain('全新卡片');
    expect(res.html).toContain('data-nid="hdr-01"'); // 其余结构未受破坏
    expect(res.html).toContain('data-nid="ftr-01"');
    expect(res.html).not.toContain('原始内容');
  });

  it('支持只替换元素内部子内容', () => {
    const patch = `<button class="btn btn-primary">立即购买</button>`;
    const res = patchElementByNid(sampleHtml, 'target-card', patch);

    expect(res.success).toBe(true);
    expect(res.html).toContain('立即购买');
    expect(res.html).toContain('data-nid="target-card"');
  });

  it('未找到指定 nid 时优雅失败并报错', () => {
    const res = patchElementByNid(sampleHtml, 'non-existent-nid', '<div>content</div>');
    expect(res.success).toBe(false);
    expect(res.error).toContain('未在目标页面中找到');
  });
});

describe('CHK-CT-02 ~ CHK-CT-04: CanvasToolExecutor 统一执行器', () => {
  beforeEach(() => {
    freshStore();
  });

  it('CHK-CT-02: create_screen 成功添加画框并自动排布坐标', () => {
    const res = CanvasToolExecutor.execute({
      tool: 'create_screen',
      params: {
        title: '新设计页',
        html: '<main data-nid="pg1"><h1>首页</h1></main>'
      }
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('screen_created');
    expect(res.screenId).toBeDefined();

    const state = useProjectStore.getState();
    expect(state.screenOrder.length).toBe(1);
    expect(state.screens[res.screenId!].name).toBe('新设计页');
    expect(state.activeScreenId).toBe(res.screenId);
  });

  it('CHK-CT-03: modify_screen 原地更新目标画框内容并记录检查点 (BR-CR-04)', () => {
    const createRes = CanvasToolExecutor.execute({
      tool: 'create_screen',
      params: { title: '原页面', html: '<main data-nid="root">原版</main>' }
    });

    const targetId = createRes.screenId!;

    const modRes = CanvasToolExecutor.execute({
      tool: 'modify_screen',
      params: {
        screenId: targetId,
        title: '修改版',
        html: '<main data-nid="root">新版</main>'
      }
    });

    expect(modRes.success).toBe(true);
    expect(modRes.status).toBe('screen_modified');
    expect(modRes.checkpointId).toBeDefined();

    const state = useProjectStore.getState();
    // 目标画框内容直接更新
    expect(state.screens[targetId].htmlContent).toContain('新版');
    // 绝不残留或新增 stagedScreen
    expect(state.stagedScreen).toBeNull();
  });

  it('CHK-CT-04: patch_element 局部外科手术式更新元素并记录检查点 (BR-CR-04)', () => {
    const createRes = CanvasToolExecutor.execute({
      tool: 'create_screen',
      params: {
        title: '充值页',
        html: '<main data-nid="root"><div data-nid="coin-card" class="card">10币</div></main>'
      }
    });

    const targetId = createRes.screenId!;

    const patchRes = CanvasToolExecutor.execute({
      tool: 'patch_element',
      params: {
        screenId: targetId,
        nid: 'coin-card',
        elementHtml: '<div class="card bg-gold">80币 (特惠)</div>'
      }
    });

    expect(patchRes.success).toBe(true);
    expect(patchRes.status).toBe('element_patched');
    expect(patchRes.checkpointId).toBeDefined();

    const state = useProjectStore.getState();
    expect(state.screens[targetId].htmlContent).toContain('80币 (特惠)');
    expect(state.screens[targetId].htmlContent).toContain('data-nid="coin-card"');
    expect(state.stagedScreen).toBeNull();
  });
});

describe('CHK-CT-05: resolveToolFromAIResponse 确定性工具解析与防漂移', () => {
  const screens = {
    'screen-charge': {
      id: 'screen-charge',
      name: '送花表达心意 - 牵手币充值',
      htmlContent: '<main data-nid="root"><div data-nid="ho2m25cl" class="card">充值卡片</div></main>'
    }
  };

  it('当包含 [引用元素 nid=...] 时，绝不能返回 create_screen，必须路由为修改', () => {
    const prompt = `[引用元素 nid="ho2m25cl" 画框="送花表达心意 - 牵手币充值" 标签=<div>]
元素片段:
<div data-nid="ho2m25cl">充值卡片</div>

参考图片，填充选项卡内容`;

    // 假设大模型输出了完整的新页面 HTML
    const fullHtml = '<main data-nid="root"><div data-nid="ho2m25cl">充值80币</div></main>';

    const call = resolveToolFromAIResponse({
      rawResponse: fullHtml,
      userPrompt: prompt,
      activeScreenId: 'screen-charge',
      screens,
      extractedHtml: fullHtml
    });

    expect(call).not.toBeNull();
    expect(call?.tool).not.toBe('create_screen');
    expect(call?.tool).toBe('modify_screen');
    if (call?.tool === 'modify_screen') {
      expect(call.params.screenId).toBe('screen-charge');
    }
  });

  it('当包含 [引用元素] 且模型仅输出了局部元素代码块时，解析为 patch_element', () => {
    const prompt = `[引用元素 nid="ho2m25cl" 画框="送花表达心意 - 牵手币充值" 标签=<div>]
参考图片填充卡片`;

    const fragmentHtml = '<div data-nid="ho2m25cl" class="card bg-gold"><h3>80币</h3></div>';

    const call = resolveToolFromAIResponse({
      rawResponse: fragmentHtml,
      userPrompt: prompt,
      activeScreenId: 'screen-charge',
      screens,
      extractedHtml: fragmentHtml
    });

    expect(call).not.toBeNull();
    expect(call?.tool).toBe('patch_element');
    if (call?.tool === 'patch_element') {
      expect(call.params.screenId).toBe('screen-charge');
      expect(call.params.nid).toBe('ho2m25cl');
      expect(call.params.elementHtml).toContain('80币');
    }
  });
});
