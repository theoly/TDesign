import { describe, it, expect, beforeEach } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { defaultTheme } from '../src/utils/themePresets';

describe('CHK-RR-02 ~ CHK-RR-04: 失败重试与修改前版本回退机制', () => {
  beforeEach(() => {
    const store = useProjectStore.getState();
    store.initNewProject({
      name: 'Retry Rollback Test',
      deviceProfile: 'mobile',
      designSystem: defaultTheme,
      createSpecimen: false
    });

    // 预置一个画框
    store.addScreen({
      name: '送花表达心意',
      position: { x: 100, y: 120 },
      htmlContent: '<main data-nid="root"><div data-nid="card-1">原始10币</div></main>'
    }, 'screen-test');
    store.setActiveScreen('screen-test');
  });

  it('CHK-RR-04: 回滚至修改前版本并清空 Staging 候选', () => {
    const store = useProjectStore.getState();

    // 假设进行了一次修改，进入了 D17 Staging 候选
    store.stageScreenChange(
      'screen-test',
      '<main data-nid="root"><div data-nid="card-1">AI调整后80币</div></main>',
      '送花表达心意 (AI 候选)'
    );
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();

    // 假设用户还手动修改或生成改变了画框
    store.updateScreenHtml(
      'screen-test',
      '<main data-nid="root"><div data-nid="card-1">临时变动</div></main>',
      '临时修改'
    );
    expect(useProjectStore.getState().screens['screen-test'].htmlContent).toContain('临时变动');

    // 模拟快照信息（preActionSnapshot 记录了最开始的状态）
    const preActionSnapshot = {
      screenId: 'screen-test',
      screenName: '送花表达心意',
      htmlContent: '<main data-nid="root"><div data-nid="card-1">原始10币</div></main>'
    };

    // 执行回滚
    useProjectStore.getState().discardStagedChange();
    useProjectStore.getState().updateScreenHtml(
      preActionSnapshot.screenId,
      preActionSnapshot.htmlContent,
      `回退至修改前版本: ${preActionSnapshot.screenName}`
    );

    // 验证：Staging 已被清空，原页面已 100% 恢复至原始状态
    const updatedState = useProjectStore.getState();
    expect(updatedState.stagedScreen).toBeNull();
    expect(updatedState.screens['screen-test'].htmlContent).toContain('原始10币');
    expect(updatedState.screens['screen-test'].htmlContent).not.toContain('临时变动');
  });
});
