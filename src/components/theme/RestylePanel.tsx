import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useAIConfigStore } from '../../stores/useAIConfigStore';
import { AIService } from '../../services/ai/aiService';
import { buildPolishPrompt, describeTargetStyle } from '../../services/ai/polishPrompt';
import { acceptRestyleResult, summarizeOutcomes, type RestyleOutcome, type RestyleTarget } from '../../services/ai/restyleService';
import { useHistoryStore } from '../../stores/useHistoryStore';

/** 从流式输出中提取 ```html 代码块 */
function extractHtml(raw: string): string | null {
  const m = /```html\s*([\s\S]*?)```/i.exec(raw) ?? /```\s*([\s\S]*?)```/.exec(raw);
  const body = (m ? m[1] : raw).trim();
  return body.startsWith('<') ? body : null;
}

/**
 * 批量风格重塑面板 (A3 / T-AE-27)。
 *
 * 用来处理「换主题回溯不到」的那部分：Token 能表达的差异切主题就生效了，
 * 类名选择与 DOM 结构不会回溯（spec §7.3），只能逐页重写。
 *
 * 三条保护是产品上的硬要求，不是可选项：
 *   1. **执行前展示预估消耗**——这是逐页 LLM 调用，用户有权先知道要花多少；
 *   2. **强制单页试跑**——未确认效果前不允许批量，唯一能防止
 *      「花 N 次调用把整个工程改丑」的机制；
 *   3. **结构守卫**——任何一页结构校验不过就跳过，不落盘不打 Checkpoint。
 */
interface RestylePanelProps {
  /** 'all' = 全工程批量重塑；否则为单个画框 id，即「质感润色」(T-AE-26) */
  scope: 'all' | string;
  onClose: () => void;
}

export const RestylePanel: React.FC<RestylePanelProps> = ({ scope, onClose }) => {
  const { designSystem, settings, buildRestylePlan, applyRestyleOutcome, screens } = useProjectStore();
  const { getActiveProviderForRole } = useAIConfigStore();
  const addCheckpoint = useHistoryStore((s) => s.addCheckpoint);

  const isSingle = scope !== 'all';
  // Polish 就是队列只含一项的 Restyle——同一套结构守卫与 Checkpoint 保护
  const plan = useMemo(
    () => buildRestylePlan(isSingle ? [scope] : undefined),
    [buildRestylePlan, isSingle, scope]
  );
  const [phase, setPhase] = useState<'plan' | 'dryrun' | 'review' | 'batch' | 'done'>('plan');
  const [busy, setBusy] = useState(false);
  const [dryOutcome, setDryOutcome] = useState<RestyleOutcome | null>(null);
  const [outcomes, setOutcomes] = useState<RestyleOutcome[]>([]);
  const [error, setError] = useState<string | null>(null);

  const styleDirective = useMemo(() => describeTargetStyle(designSystem), [designSystem]);

  const runOne = async (target: RestyleTarget): Promise<RestyleOutcome> => {
    const binding = getActiveProviderForRole('code');
    if (!binding?.provider) return { target, status: 'failed', message: '未配置可用的 AI Provider' };

    const systemPrompt = buildPolishPrompt({
      designSystem,
      deviceProfile: settings.deviceProfile,
      frameWidth: settings.frameWidth,
      styleDirective,
      protectedNids: target.protectedNids
    });

    let raw = '';
    const { promise } = AIService.stream(
      binding.provider,
      binding.modelId,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `重塑以下${target.kind === 'component' ? '组件' : '页面'}：\n\n${target.html}` }
      ],
      (ev) => {
        if (ev.type === 'Delta') raw += ev.text;
      }
    );
    await promise;
    return acceptRestyleResult(target, extractHtml(raw));
  };

  const doDryRun = async () => {
    if (!plan.dryRun) return;
    setBusy(true);
    setError(null);
    try {
      const o = await runOne(plan.dryRun);
      setDryOutcome(o);
      // 单画框润色没有「批量」可言，试跑即正式执行——通过校验就直接落地
      if (isSingle && o.status === 'applied') {
        snapshotAndApply(o);
        setOutcomes([o]);
        setPhase('done');
      } else {
        setPhase('review');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const doBatch = async () => {
    setBusy(true);
    setPhase('batch');
    const results: RestyleOutcome[] = [];
    // 试跑结果先落地，避免重复调用
    if (dryOutcome?.status === 'applied') {
      snapshotAndApply(dryOutcome);
      results.push(dryOutcome);
    }
    for (const target of plan.queue.slice(1)) {
      const o = await runOne(target);
      if (o.status === 'applied') snapshotAndApply(o);
      results.push(o);
      setOutcomes([...results]);
    }
    setBusy(false);
    setPhase('done');
  };

  /** 每个目标落地前自动 Checkpoint，与 §6.4 Polish 保持一致，支持秒级回退 */
  const snapshotAndApply = (o: RestyleOutcome) => {
    if (o.target.kind === 'screen') {
      const sc = screens[o.target.id];
      if (sc) {
        addCheckpoint(`风格重塑前备份: ${sc.name}`, {
          screenId: sc.id,
          htmlContent: sc.htmlContent,
          scopedCss: sc.scopedCss
        });
      }
    }
    applyRestyleOutcome(o);
  };

  const summary = outcomes.length > 0 ? summarizeOutcomes(outcomes) : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-full flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <div>
              <h2 className="text-slate-100 font-semibold text-sm">
                {isSingle ? 'AI 质感润色' : '批量风格重塑'}
              </h2>
              <p className="text-slate-400 text-xs mt-0.5">
                {isSingle
                  ? '保持元素结构与文案不变，只提升视觉表现'
                  : '把当前设计风格应用到已有页面中「换主题回溯不到」的部分'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-200 p-1 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto text-xs">
          {/* 预估消耗：执行前必须让用户知道要花多少 */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold">执行计划</span>
              <span className="text-slate-400">
                预计 <span className="text-blue-400 font-semibold">{plan.estimatedCalls}</span> 次 AI 调用
              </span>
            </div>
            <div className="text-slate-500 leading-relaxed">
              队列：{plan.queue.filter((t) => t.kind === 'component').length} 个组件 +{' '}
              {plan.queue.filter((t) => t.kind === 'screen').length} 个画框。
              {plan.queue.some((t) => (t.protectedNids?.length ?? 0) > 0) && (
                <> 含手动样式覆盖的节点将保持不动（被 !important 挡住，改了也不生效）。</>
              )}
              {plan.naiveCalls > plan.estimatedCalls && (
                <>
                  {' '}
                  组件优先策略已省下 <span className="text-emerald-400">{plan.naiveCalls - plan.estimatedCalls}</span> 次调用
                  （组件只改定义，再走实例同步下发）。
                </>
              )}
            </div>
          </div>

          {phase === 'plan' && (
            <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
              <span className="leading-relaxed">
                {isSingle ? (
                  <>
                    将对「{plan.dryRun?.name ?? '—'}」执行一次视觉重构。落地前自动创建 Checkpoint，可随时回退；
                    若模型改动了元素结构或删减了内容，结果会被直接拒绝、不落盘。
                  </>
                ) : (
                  <>
                    将先对「{plan.dryRun?.name ?? '—'}」单独试跑一次供你确认效果，确认后才会批量执行。
                    每个目标落地前自动创建 Checkpoint，可随时回退；结构被改动的结果会被直接拒绝，不会落盘。
                  </>
                )}
              </span>
            </div>
          )}

          {phase === 'review' && dryOutcome && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="font-semibold text-slate-200">试跑结果：{dryOutcome.target.name}</div>
              {dryOutcome.status === 'applied' ? (
                <>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Check className="w-3 h-3" />
                    <span>结构校验通过（节点增删为 0）</span>
                  </div>
                  {dryOutcome.message && <div className="text-amber-300">{dryOutcome.message}</div>}
                  <pre className="max-h-40 overflow-auto bg-slate-900 p-2 rounded-lg text-[10px] text-slate-400 whitespace-pre-wrap">
                    {dryOutcome.html?.slice(0, 800)}
                  </pre>
                </>
              ) : (
                <div className="text-rose-400 leading-relaxed">
                  {dryOutcome.message ?? '试跑未通过'}
                  <div className="text-slate-500 mt-1">结果已被拒绝，未做任何改动。</div>
                </div>
              )}
            </div>
          )}

          {(phase === 'batch' || phase === 'done') && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
              <div className="font-semibold text-slate-200">
                执行进度 {outcomes.length} / {plan.queue.length}
              </div>
              {summary && (
                <div className="text-slate-400 leading-relaxed">
                  已应用 {summary.applied}，结构被拒 {summary.structureRejected}，失败 {summary.failed}
                  {summary.textDrift > 0 && `，${summary.textDrift} 处文案变化待核对`}
                </div>
              )}
              {summary?.details.map((d, i) => (
                <div key={i} className="text-amber-300/90">• {d}</div>
              ))}
            </div>
          )}

          {error && <div className="text-rose-400">{error}</div>}
        </div>

        <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-slate-300 hover:text-slate-100 text-xs disabled:opacity-40">
            {phase === 'done' ? '完成' : '取消'}
          </button>
          {phase === 'plan' && (
            <button
              onClick={doDryRun}
              disabled={busy || !plan.dryRun}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              {isSingle ? '开始润色' : '试跑单个目标'}
            </button>
          )}
          {phase === 'review' && (
            <>
              <button onClick={() => setPhase('plan')} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg">
                重新试跑
              </button>
              <button
                onClick={doBatch}
                disabled={dryOutcome?.status !== 'applied'}
                title={dryOutcome?.status !== 'applied' ? '试跑未通过，不能批量执行' : undefined}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg"
              >
                确认效果，批量执行剩余 {plan.queue.length - 1} 项
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
