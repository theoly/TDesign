import { describe, it, expect, beforeEach } from 'bun:test';
import { useUsageStore, formatTokenCount } from '../src/stores/useUsageStore';

describe('CHK-US-01 ~ CHK-US-02: Token 使用统计 (本轮会话与历史总计)', () => {
  beforeEach(() => {
    useUsageStore.getState().clearUsage();
  });

  it('初始状态为零', () => {
    const state = useUsageStore.getState();
    expect(state.sessionCalls).toBe(0);
    expect(state.sessionInputTokens).toBe(0);
    expect(state.sessionOutputTokens).toBe(0);
    expect(state.totalCalls).toBe(0);
    expect(state.totalInputTokens).toBe(0);
    expect(state.totalOutputTokens).toBe(0);
  });

  it('调用 recordUsage 时同时累加本轮会话与历史总计', () => {
    useUsageStore.getState().recordUsage({
      providerName: 'DeepSeek',
      modelId: 'deepseek-chat',
      inputTokens: 500,
      outputTokens: 800,
      estimatedCostUsd: 0.002
    });

    const state1 = useUsageStore.getState();
    expect(state1.sessionCalls).toBe(1);
    expect(state1.sessionInputTokens).toBe(500);
    expect(state1.sessionOutputTokens).toBe(800);
    expect(state1.totalCalls).toBe(1);
    expect(state1.totalInputTokens).toBe(500);
    expect(state1.totalOutputTokens).toBe(800);

    // 第二次调用
    useUsageStore.getState().recordUsage({
      providerName: 'DeepSeek',
      modelId: 'deepseek-coder',
      inputTokens: 300,
      outputTokens: 700,
      estimatedCostUsd: 0.001
    });

    const state2 = useUsageStore.getState();
    expect(state2.sessionCalls).toBe(2);
    expect(state2.sessionInputTokens).toBe(800);
    expect(state2.sessionOutputTokens).toBe(1500);
    expect(state2.totalCalls).toBe(2);
    expect(state2.totalInputTokens).toBe(800);
    expect(state2.totalOutputTokens).toBe(1500);
  });

  it('resetSessionUsage 仅重置本轮会话，保留历史总计', () => {
    useUsageStore.getState().recordUsage({
      providerName: 'OpenAI',
      modelId: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 2000,
      estimatedCostUsd: 0.015
    });

    useUsageStore.getState().resetSessionUsage();

    const state = useUsageStore.getState();
    // 本轮会话被归零
    expect(state.sessionCalls).toBe(0);
    expect(state.sessionInputTokens).toBe(0);
    expect(state.sessionOutputTokens).toBe(0);

    // 历史总计不受影响
    expect(state.totalCalls).toBe(1);
    expect(state.totalInputTokens).toBe(1000);
    expect(state.totalOutputTokens).toBe(2000);
  });

  it('formatTokenCount 格式化准确', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(450)).toBe('450');
    expect(formatTokenCount(1200)).toBe('1.2k');
    expect(formatTokenCount(45800)).toBe('45.8k');
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });
});
