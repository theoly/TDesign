import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { PropertyInspector } from '../src/components/inspector/PropertyInspector';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';
import { computeScreenAuditReport } from '../src/utils/tokenLint';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Audit Evaluation in Chat (一键评测与对话问题定位)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    const store = useProjectStore.getState();
    store.initNewProject({
      name: 'Audit Evaluation Test Project',
      deviceProfile: 'pc',
      designSystem: defaultTheme,
      createSpecimen: false
    });

    useAIConfigStore.setState({
      providers: defaultProviders,
      bindings: defaultBindings
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('CHK-F-01: PropertyInspector 包含「一键评测」按钮，原一键映射修复已被替换', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({ name: '测试页面', width: 1440, height: 900 });
    // 注入包含硬编码色值的 HTML
    const escapedHtml = `
      <div data-nid="root1" class="col gap-4 p-6">
        <h1 data-nid="title1" style="color: #ff0077">标题</h1>
      </div>
    `;
    store.updateScreenHtml(screenId, escapedHtml);
    store.setActiveScreen(screenId);
    store.selectNode(null);

    act(() => {
      root.render(React.createElement(PropertyInspector));
    });

    // 验证原按钮已不存在
    expect(container.textContent).not.toContain('一键映射修复为标准 Token');
    // 验证新按钮「一键评测」正常呈现
    expect(container.textContent).toContain('一键评测');
    expect(container.textContent).toContain('当前页面 Token 合规度');
  });

  test('CHK-F-02: 点击「一键评测」绝对不主动修改画框的 HTML 内容，不触发自动修复逻辑', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({ name: '不可修改测试页', width: 1440, height: 900 });
    const originalHtml = `
      <div data-nid="root2" class="col gap-4 p-6">
        <span data-nid="text2" style="color: #e11d48">保留字面色值</span>
      </div>
    `;
    store.updateScreenHtml(screenId, originalHtml);
    store.setActiveScreen(screenId);
    store.selectNode(null);

    act(() => {
      root.render(React.createElement(PropertyInspector));
    });

    const auditBtn = container.querySelector('button[title*="一键评测"]');
    expect(auditBtn).not.toBeNull();

    act(() => {
      auditBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 断言画框 HTML 内容 100% 保持原样，绝无任何自动修复替换
    const currentScreen = useProjectStore.getState().screens[screenId];
    expect(currentScreen.htmlContent).toBe(originalHtml);
    expect(currentScreen.htmlContent).toContain('#e11d48');
    expect(currentScreen.htmlContent).not.toContain('var(--color-primary)');

    // 验证 pendingAuditReport 被正常派发
    const pending = useProjectStore.getState().pendingAuditReport;
    expect(pending).not.toBeNull();
    expect(pending?.screenId).toBe(screenId);
    expect(pending?.issues.length).toBe(1);
  });

  test('CHK-F-03: 点击「一键评测」后在 ChatDrawer 中渲染结构化报告卡片与逃逸清单', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({ name: '对话呈现页', width: 1440, height: 900 });
    const html = `
      <div data-nid="root3" class="col p-4">
        <button data-nid="btn3" style="color: #123456" class="unknown-custom-btn">自定义按钮</button>
      </div>
    `;
    store.updateScreenHtml(screenId, html);
    store.setActiveScreen(screenId);
    store.selectNode(null);

    // 挂载 ChatDrawer
    act(() => {
      root.render(React.createElement(ChatDrawer));
    });

    // 触发评测推送
    act(() => {
      const liveState = useProjectStore.getState();
      const report = computeScreenAuditReport(
        liveState.screens[screenId],
        liveState.designSystem,
        liveState.settings.deviceProfile
      );
      liveState.postAuditReport(report);
    });

    // ChatDrawer 应该消费 pendingAuditReport 并渲染评测卡片
    expect(useProjectStore.getState().pendingAuditReport).toBeNull();

    const auditCard = container.querySelector('div[data-testid="audit-report-card"]');
    expect(auditCard).not.toBeNull();
    expect(auditCard?.textContent).toContain('Token 规范评测报告');
    expect(auditCard?.textContent).toContain('对话呈现页');
    expect(auditCard?.textContent).toContain('待优化逃逸清单');
    expect(auditCard?.textContent).toContain('#123456');
    expect(auditCard?.textContent).toContain('unknown-custom-btn');
    expect(auditCard?.textContent).toContain('已禁用自动修复');
  });

  test('CHK-F-04: 单个元素存在逃逸时，定位目标精准指向该具体元素 (type=element)', () => {
    const screen = {
      id: 'sc-single',
      name: '单元素页',
      htmlContent: `
        <div data-nid="wrap1" class="col p-4">
          <p data-nid="p1" style="color: #aabbcc">只有这段文字有色值逃逸</p>
        </div>
      `
    };
    const report = computeScreenAuditReport(screen, defaultTheme, 'pc');

    expect(report.issues.length).toBe(1);
    expect(report.targetToLocate.type).toBe('element');
    expect(report.targetToLocate.nid).toBe('p1');
    expect(report.targetToLocate.label).toContain('p1');
  });

  test('CHK-F-05: 多个元素存在逃逸且同属一个容器时，定位目标收敛为包含它们的父区块 (type=block)', () => {
    const screen = {
      id: 'sc-multi-block',
      name: '卡片容器页',
      htmlContent: `
        <div data-nid="page_root" class="col p-8">
          <div data-nid="target_card" class="card p-4">
            <h3 data-nid="card_title" style="color: #ff0000">卡片标题硬编码红</h3>
            <p data-nid="card_desc" style="color: #00ff00">卡片副标题硬编码绿</p>
            <button data-nid="card_btn" class="non-standard-btn">未注册类名按钮</button>
          </div>
        </div>
      `
    };
    const report = computeScreenAuditReport(screen, defaultTheme, 'pc');

    // 包含 3 处逃逸
    expect(report.issues.length).toBe(3);
    // 收敛至包含它们的父区块 target_card
    expect(report.targetToLocate.type).toBe('block');
    expect(report.targetToLocate.nid).toBe('target_card');
    expect(report.targetToLocate.tagName).toBe('div');
    expect(report.targetToLocate.label).toContain('父区块');
    expect(report.targetToLocate.label).toContain('target_card');
  });

  test('CHK-F-06: 多个元素跨越多个不同容器时，定位目标收敛为定位该页面整体 (type=screen)', () => {
    const screen = {
      id: 'sc-multi-scattered',
      name: '全页分散逃逸页',
      htmlContent: `
        <div data-nid="nav_wrap" class="row p-4">
          <span data-nid="nav_logo" style="color: #ff1122">Logo 硬编码色</span>
        </div>
        <div data-nid="main_wrap" class="col p-4">
          <div data-nid="content_area">正文</div>
        </div>
        <div data-nid="footer_wrap" class="row p-4">
          <span data-nid="footer_copy" style="color: #334455">页脚硬编码色</span>
        </div>
      `
    };
    const report = computeScreenAuditReport(screen, defaultTheme, 'pc');

    expect(report.issues.length).toBe(2);
    // 跨越导航与页脚，其公共祖先为顶层，收敛为页面级定位
    expect(report.targetToLocate.type).toBe('screen');
    expect(report.targetToLocate.screenId).toBe('sc-multi-scattered');
    expect(report.targetToLocate.label).toContain('定位该页面: 全页分散逃逸页');
  });

  test('CHK-F-07: 点击定位按钮后，画布成功激活对应画框并完成选区聚焦', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({ name: '定位目标画框', width: 1440, height: 900 });
    const html = `
      <div data-nid="container_box" class="col p-4">
        <span data-nid="err_1" style="color: #112233">错误1</span>
        <span data-nid="err_2" style="color: #445566">错误2</span>
      </div>
    `;
    store.updateScreenHtml(screenId, html);

    // 默认激活另外一个空白页面
    const otherScreenId = store.addScreen({ name: '无关画框', width: 1440, height: 900 });
    store.setActiveScreen(otherScreenId);
    store.selectNode(null);

    expect(useProjectStore.getState().activeScreenId).toBe(otherScreenId);

    act(() => {
      root.render(React.createElement(ChatDrawer));
    });

    // 注入评测报告
    act(() => {
      const liveState = useProjectStore.getState();
      const report = computeScreenAuditReport(
        liveState.screens[screenId],
        liveState.designSystem,
        liveState.settings.deviceProfile
      );
      liveState.postAuditReport(report);
    });

    const locateBtn = container.querySelector('button[data-testid="locate-audit-target-btn"]');
    expect(locateBtn).not.toBeNull();

    act(() => {
      locateBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 验证当前激活画框已自动切换为包含问题的画框
    expect(useProjectStore.getState().activeScreenId).toBe(screenId);
    // 验证当前选中的节点已聚焦至包含两个错误的父区块 container_box
    expect(useProjectStore.getState().selectedNid).toBe('container_box');
  });
});
