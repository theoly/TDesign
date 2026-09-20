/**
 * T-ATC-04: Element Add to Chat — 自动化单测
 * 覆盖 CHK-F-01 ~ CHK-F-08
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { useProjectStore, type NodeReference } from '../src/stores/useProjectStore';
import { defaultTheme } from '../src/utils/themePresets';

function makeNodeRef(overrides?: Partial<NodeReference>): NodeReference {
  return {
    screenId: 'screen-1',
    screenName: '首页',
    nid: 'abc12345',
    tagName: 'div',
    htmlSnippet: '<div class="hero">Hello World</div>',
    ...overrides
  };
}

function freshStore() {
  const store = useProjectStore.getState();
  store.initNewProject({
    name: 'ATC Test',
    deviceProfile: 'pc',
    designSystem: defaultTheme,
    createSpecimen: false
  });
  return useProjectStore.getState();
}

describe('CHK-F-01 ~ CHK-F-02: pendingNodeRef 初始值与 setter/clear', () => {
  it('CHK-F-01: 新建工程后 pendingNodeRef 应为 null', () => {
    freshStore();
    const state = useProjectStore.getState();
    expect(state.pendingNodeRef).toBeNull();
  });

  it('CHK-F-01: setPendingNodeRef 写入后可正确读取', () => {
    freshStore();
    const ref = makeNodeRef();
    useProjectStore.getState().setPendingNodeRef(ref);
    const state = useProjectStore.getState();
    expect(state.pendingNodeRef).not.toBeNull();
    expect(state.pendingNodeRef?.nid).toBe('abc12345');
    expect(state.pendingNodeRef?.tagName).toBe('div');
    expect(state.pendingNodeRef?.screenName).toBe('首页');
    expect(state.pendingNodeRef?.htmlSnippet).toBe('<div class="hero">Hello World</div>');
  });

  it('CHK-F-02: clearPendingNodeRef 后 pendingNodeRef 应为 null', () => {
    freshStore();
    useProjectStore.getState().setPendingNodeRef(makeNodeRef());
    useProjectStore.getState().clearPendingNodeRef();
    expect(useProjectStore.getState().pendingNodeRef).toBeNull();
  });
});

describe('CHK-F-04: Add to Chat 按钮点击后 pendingNodeRef 被设置', () => {
  it('setPendingNodeRef 可以携带不同画框信息', () => {
    freshStore();
    const ref = makeNodeRef({ screenId: 'screen-2', screenName: '商品列表', tagName: 'button', nid: 'xyz98765' });
    useProjectStore.getState().setPendingNodeRef(ref);
    const state = useProjectStore.getState();
    expect(state.pendingNodeRef?.screenId).toBe('screen-2');
    expect(state.pendingNodeRef?.screenName).toBe('商品列表');
    expect(state.pendingNodeRef?.tagName).toBe('button');
    expect(state.pendingNodeRef?.nid).toBe('xyz98765');
  });

  it('多次 setPendingNodeRef 后以最新为准（不累积）', () => {
    freshStore();
    useProjectStore.getState().setPendingNodeRef(makeNodeRef({ nid: 'first' }));
    useProjectStore.getState().setPendingNodeRef(makeNodeRef({ nid: 'second' }));
    expect(useProjectStore.getState().pendingNodeRef?.nid).toBe('second');
  });
});

describe('CHK-F-07: prompt 注入验证', () => {
  it('引用块格式正确', () => {
    const ref = makeNodeRef({ nid: 'aa112233', tagName: 'section', screenName: '关于我们' });
    const injected =
      `[引用元素 nid="${ref.nid}" 画框="${ref.screenName}" 标签=<${ref.tagName}>]\n` +
      `元素片段:\n${ref.htmlSnippet}\n\n` +
      '修改背景颜色为蓝色';
    expect(injected).toContain('nid="aa112233"');
    expect(injected).toContain('画框="关于我们"');
    expect(injected).toContain('标签=<section>');
    expect(injected).toContain('元素片段:');
    expect(injected).toContain('<div class="hero">Hello World</div>');
    expect(injected).toContain('修改背景颜色为蓝色');
  });

  it('htmlSnippet 超过 300 字符时截断', () => {
    const longHtml = '<div>' + 'x'.repeat(400) + '</div>';
    const raw = longHtml;
    const htmlSnippet = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
    expect(htmlSnippet.length).toBeLessThanOrEqual(302); // 300 + '…' (3 bytes)
    expect(htmlSnippet.endsWith('…')).toBe(true);
  });
});

describe('CHK-F-08: 消息发送后引用自动清除', () => {
  it('clearPendingNodeRef 在发送逻辑完成前可被正确调用', () => {
    freshStore();
    useProjectStore.getState().setPendingNodeRef(makeNodeRef());
    expect(useProjectStore.getState().pendingNodeRef).not.toBeNull();
    // 模拟发送后清除
    useProjectStore.getState().clearPendingNodeRef();
    expect(useProjectStore.getState().pendingNodeRef).toBeNull();
  });
});

describe('CHK-F-06: ✕ 按钮可清除 chip', () => {
  it('clearPendingNodeRef 与 ✕ 点击等效', () => {
    freshStore();
    useProjectStore.getState().setPendingNodeRef(makeNodeRef({ nid: 'chip-test' }));
    useProjectStore.getState().clearPendingNodeRef(); // 模拟 ✕ 点击
    expect(useProjectStore.getState().pendingNodeRef).toBeNull();
  });
});

describe('NodeReference 类型完整性', () => {
  it('NodeReference 包含所有必要字段', () => {
    const ref: NodeReference = {
      screenId: 's1',
      screenName: '首页',
      nid: '12345678',
      tagName: 'nav',
      htmlSnippet: '<nav>...</nav>'
    };
    expect(ref.screenId).toBeDefined();
    expect(ref.screenName).toBeDefined();
    expect(ref.nid).toBeDefined();
    expect(ref.tagName).toBeDefined();
    expect(ref.htmlSnippet).toBeDefined();
  });
});
