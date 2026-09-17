import React, { useState, useRef } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { STYLE_TAGS, buildStyleTagDirectives } from '../../services/ai/styleTags';
import { useAIEngineChat } from '../../services/ai/engine/react/useAIEngineChat';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Square,
  RotateCcw,
  BookmarkPlus,
  Palette,
  Check,
  AtSign,
  Image as ImageIcon,
  X,
  Brain,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ShieldAlert
} from 'lucide-react';

interface ChatDrawerProps {
  onOpenSettings: () => void;
}

interface ThinkingStep {
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'stopped' | 'error';
}

function getThinkingSteps(stage?: number, isGenerating?: boolean, isStopped?: boolean): ThinkingStep[] {
  const s = stage || 0;
  return [
    {
      title: '意图推理与多模态反推',
      description: '解析用户诉求与设计规范，提取关键组件与意图',
      status: s > 1 ? 'completed' : s === 1 ? (isStopped ? 'stopped' : 'active') : 'pending'
    },
    {
      title: '检索设计规范与工程约定',
      description: '匹配主题 Tokens (主色、字阶、间距) 与工程约定约束',
      status: s > 2 ? 'completed' : s === 2 ? (isStopped ? 'stopped' : 'active') : 'pending'
    },
    {
      title: '构建组件语义树与响应式布局',
      description: '规划画框容器结构与响应式视口',
      status: s > 3 ? 'completed' : s === 3 ? (isStopped ? 'stopped' : 'active') : 'pending'
    },
    {
      title: '高保真代码生成与画布同步',
      description: '流式编写高保真 HTML / CSS 样式并同步至设计画板...',
      status: s >= 4 && !isGenerating ? (isStopped ? 'stopped' : 'completed') : s >= 4 ? 'active' : 'pending'
    }
  ];
}

export function extractHtml(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // 1. Remove <think>...</think> reasoning tags
  let cleaned = raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  if (!cleaned) return null;

  // 2. Try markdown code block ```html ... ``` or ```xml ... ``` or ``` ... ```
  const codeBlockMatch = cleaned.match(/```(?:html|htm|xml)?\s*\n?([\s\S]*?)(?:```|$)/i);
  if (codeBlockMatch && codeBlockMatch[1]?.trim()) {
    const candidate = codeBlockMatch[1].trim();
    if (/<[a-z!][\s\S]*>/i.test(candidate)) {
      return candidate;
    }
  }

  // 3. Fallback: match direct HTML starting from container or doctype/html tag
  const tagStartMatch = cleaned.match(/<(div|main|section|form|article|header|body|html|dialog|table)\b[^>]*>/i);
  if (tagStartMatch && tagStartMatch.index !== undefined) {
    const fromStart = cleaned.slice(tagStartMatch.index);
    const lastCloseMatch = fromStart.match(/<\/(div|main|section|form|article|header|body|html|dialog|table)>[^<]*$/i);
    if (lastCloseMatch && lastCloseMatch.index !== undefined) {
      const endIndex = lastCloseMatch.index + lastCloseMatch[0].length;
      return fromStart.slice(0, endIndex).trim();
    }
    return fromStart.trim();
  }

  // 4. Any HTML fragment containing container/semantic tags
  if (/<(div|main|section|form|article|header|body|html|dialog|card|p|h[1-6]|ul|table)\b/i.test(cleaned)) {
    return cleaned;
  }

  return null;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ onOpenSettings }) => {
  const [input, setInput] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ name: string; dataUrl: string } | null>(null);
  // T-AE-21: 风格标签仅影响本轮请求，不写入工程
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { screens, settings, stagedScreen, setActiveScreen } = useProjectStore();
  const engine = useAIEngineChat();

  const promptTemplates = [
    '创建 SaaS 移动端订单明细页',
    '做一个高端科技感数据分析看板',
    '将当前画框重构为极简留白风格',
    '本工程按钮统一采用胶囊圆角'
  ];

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.endsWith('@')) {
      setShowMentionMenu(true);
    } else if (!val.includes('@')) {
      setShowMentionMenu(false);
    }
  };

  const handleInsertMention = (screenName: string) => {
    setInput((prev) => prev.replace(/@$/, `@${screenName} `));
    setShowMentionMenu(false);
  };

  const toggleThinkingExpand = (msgId: string) => {
    setExpandedThinkingIds((prev) => {
      const current = prev[msgId] !== undefined ? prev[msgId] : false;
      return {
        ...prev,
        [msgId]: !current
      };
    });
  };

  const handleStopGenerating = () => {
    engine.abort();
  };

  const handleSendMessage = async (rawPrompt?: string) => {
    let textToSend = rawPrompt || input.trim();
    if (!textToSend || engine.isGenerating) return;

    if (activeTags.length > 0) {
      const tagDirectives = buildStyleTagDirectives(activeTags);
      if (tagDirectives) {
        textToSend = `${textToSend}\n\n[风格标签指示: ${tagDirectives}]`;
      }
    }

    setInput('');
    const currentAttachment = attachedImage
      ? { name: attachedImage.name, dataUrl: attachedImage.dataUrl }
      : undefined;
    setAttachedImage(null);

    await engine.sendMessage(textToSend, currentAttachment);
  };

  const activeGeneratingMsg = engine.messages.find((m) => m.isGenerating);
  const activeStreamText = activeGeneratingMsg?.text || '';
  let streamingArtifactStatus: string | null = null;
  if (engine.isGenerating) {
    if (activeStreamText.includes('</artifact>')) {
      streamingArtifactStatus = '构筑完成，正在执行结构守卫与安全规则验证';
    } else if (activeStreamText.includes('<artifact')) {
      streamingArtifactStatus = '正在构筑页面结构...';
    }
  }

  return (
    <div className="w-80 h-full bg-slate-900 border-l border-slate-800 flex flex-col z-20 select-text">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 font-semibold text-slate-200">
          <Bot className="w-4 h-4 text-blue-400" />
          <span>AI 原生设计助手</span>
        </div>
        <button onClick={onOpenSettings} className="text-blue-400 hover:underline text-[11px]">
          Provider 配置
        </button>
      </div>

      {/* Streaming Artifact Status Badge (REQ-OD-01 / T-OD-17 / CHK-OD-21) */}
      {streamingArtifactStatus && (
        <div className="px-3 py-1.5 bg-blue-950/80 border-b border-blue-800/60 flex items-center gap-2 text-[11px] text-blue-300 font-medium animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 flex-shrink-0" />
          <span className="truncate">{streamingArtifactStatus}</span>
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Side-by-Side Floating / Inline Bar (D17) */}
        {stagedScreen && (
          <div className="p-3 bg-purple-950/50 border border-purple-800/60 rounded-xl space-y-2 text-purple-200 shadow-md">
            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>AI 新方案已在右侧画框并排就绪 (D17)</span>
            </div>
            <p className="text-[11px] text-purple-300/90 leading-relaxed">
              针对「{screens[stagedScreen.targetScreenId]?.name || '目标画框'}」生成了新版候选方案，请选择：
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={engine.adoptCandidate}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-[10px] transition shadow"
              >
                采纳新版 (替换原版)
              </button>
              <button
                onClick={engine.keepBothCandidates}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] border border-slate-700 transition"
              >
                两版都留
              </button>
              <button
                onClick={engine.discardCandidate}
                className="px-2 py-1 text-slate-400 hover:text-red-400 text-[10px] transition"
              >
                保留原版
              </button>
            </div>
          </div>
        )}

        {/* Structure Guard Interception Alert (ISSUE-011) */}
        {engine.lastGuardOutput && (
          <div className="p-3 bg-amber-950/50 border border-amber-800/60 rounded-xl space-y-2 text-amber-200 shadow-md">
            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>结构守卫拦截保护 (ISSUE-011)</span>
            </div>
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              检测到新生成的画框存在关键结构变更或删除。若确认本次调整属于重构，可点击放行。
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={engine.forceApply}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg text-[10px] transition"
              >
                强制并排放行应用
              </button>
            </div>
          </div>
        )}

        {engine.messages.map((m) => {
          const isCurrentGenerating = engine.isGenerating && m.isGenerating;
          const isExpanded = expandedThinkingIds[m.id] !== undefined
            ? expandedThinkingIds[m.id]
            : isCurrentGenerating;
          const thinkingSteps = getThinkingSteps(m.thinkingStage, m.isGenerating, m.isStopped);

          return (
            <div key={m.id} className="space-y-2">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                {m.sender === 'user' ? (
                  <>
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>您</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>AI Designer</span>
                  </>
                )}
              </div>

              {/* Collapsible Thinking & Feedback Accordion (PRD §3.2) */}
              {m.sender === 'assistant' && (m.thinkingStage !== undefined && m.thinkingStage > 0) && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden text-xs transition-all shadow-sm">
                  {/* Summary Header */}
                  <button
                    type="button"
                    onClick={() => toggleThinkingExpand(m.id)}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-900/80 transition text-left cursor-pointer group select-none"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                        {isCurrentGenerating ? (
                          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                        ) : m.isStopped ? (
                          <Square className="w-2.5 h-2.5 text-amber-400 fill-current" />
                        ) : (
                          <Brain className="w-3 h-3 text-blue-400" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold text-slate-200 text-[11px]">
                          {isCurrentGenerating
                            ? 'AI 正在深度推理与规划...'
                            : m.isStopped
                            ? 'AI 思考过程 (已中止)'
                            : 'AI 思考与反馈过程'}
                        </span>
                        {m.elapsedSeconds !== undefined && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {m.elapsedSeconds}s
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-slate-500 group-hover:text-slate-300 transition flex-shrink-0">
                      <span className="text-[10px]">
                        {isExpanded ? '收起' : '展开'}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </button>

                  {/* Collapsed Brief Preview */}
                  {!isExpanded && (
                    <div className="px-3 pb-2 pt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400 overflow-hidden">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      <span className="truncate">
                        {m.text ? '已完成设计推理并输出结果' : '正在规划布局与 Design Tokens...'}
                      </span>
                    </div>
                  )}

                  {/* Expanded Detailed Steps & Feedback */}
                  {isExpanded && (
                    <div className="p-3 pt-1 border-t border-slate-800/80 space-y-2.5 bg-slate-900/40">
                      <div className="space-y-2">
                        {thinkingSteps.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-[11px]">
                            <div className="mt-0.5 flex-shrink-0">
                              {step.status === 'completed' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ) : step.status === 'active' ? (
                                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                              ) : step.status === 'stopped' ? (
                                <Square className="w-3.5 h-3.5 text-amber-400 fill-current" />
                              ) : step.status === 'error' ? (
                                <XCircle className="w-3.5 h-3.5 text-red-400" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full border border-slate-700 flex items-center justify-center text-[9px] text-slate-600">
                                  {idx + 1}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span
                                className={`font-medium block ${
                                  step.status === 'completed'
                                    ? 'text-slate-300'
                                    : step.status === 'active'
                                    ? 'text-blue-300'
                                    : step.status === 'stopped'
                                    ? 'text-amber-300'
                                    : step.status === 'error'
                                    ? 'text-red-300'
                                    : 'text-slate-500'
                                }`}
                              >
                                {step.title}
                              </span>
                              <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                                {step.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Feedback Badges */}
                      <div className="pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5 text-[10px]">
                        {m.checkpointId && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                            快照: #{m.checkpointId.slice(0, 12)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Token 变更提案卡片 (T-AE-25 / T-AE-34) */}
              {m.pendingProposal && (
                <div className="p-3 bg-sky-950/40 border border-sky-800/50 rounded-xl space-y-2 text-sky-200">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <Palette className="w-3.5 h-3.5 text-sky-400" />
                    <span>识别到设计 Token 调整诉求</span>
                  </div>
                  <p className="text-[11px] text-sky-300/90 leading-relaxed">{m.pendingProposal.label || 'Token 预设调整'}</p>
                  {m.pendingProposal.resolved ? (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 pt-1">
                      <Check className="w-3 h-3" />
                      <span>
                        {m.pendingProposal.resolved === 'applied'
                          ? '已应用至全工程，所有画框实时联动（可撤销）'
                          : m.pendingProposal.resolved === 'once'
                          ? '仅本次生效，工程设计系统未改动'
                          : '已忽略'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => engine.resolveProposal(m.id, 'applied')}
                        className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg text-[10px] transition"
                      >
                        应用到全工程
                      </button>
                      <button
                        onClick={() => engine.resolveProposal(m.id, 'once')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] transition"
                      >
                        仅本次
                      </button>
                      <button
                        onClick={() => engine.resolveProposal(m.id, 'ignored')}
                        className="px-2 py-1 text-slate-400 hover:text-slate-200 text-[10px] transition"
                      >
                        忽略
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Candidate Decision Confirmation Card (PRD D20 / §3.2.8) */}
              {m.candidateDecision && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl space-y-2 text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>自动提取候选设计约定 (D20)</span>
                  </div>
                  <p className="text-[11px] text-amber-300/90 leading-relaxed">
                    “{m.candidateDecision}”
                  </p>
                  {m.decisionConfirmed ? (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 pt-1">
                      <Check className="w-3 h-3" />
                      <span>已永久沉淀为工程设计约定，未来生成将自动遵从</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => engine.confirmDecision(m.id, m.candidateDecision!)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg text-[10px] transition"
                      >
                        沉淀为工程约定
                      </button>
                      <button
                        onClick={() => engine.dismissDecision(m.id)}
                        className="text-slate-400 hover:text-slate-200 text-[10px]"
                      >
                        忽略
                      </button>
                    </div>
                  )}
                </div>
              )}

              {m.imageUrl && (
                <div className="mb-2 max-w-[220px] rounded-lg overflow-hidden border border-slate-700 shadow-md">
                  <img src={m.imageUrl} alt="Reference Screenshot" className="w-full h-auto object-cover" />
                </div>
              )}

              {/* Text / Result Bubble */}
              {(m.text || m.htmlOutput || m.isStopped || isCurrentGenerating) && (
                <div
                  className={`p-3 rounded-xl leading-relaxed whitespace-pre-wrap break-words ${
                    m.sender === 'user'
                      ? 'bg-blue-600 text-white ml-4 shadow-sm'
                      : 'bg-slate-800 text-slate-200 mr-2 border border-slate-700/60'
                  }`}
                >
                  {m.sender === 'user' ? (
                    m.text
                  ) : m.isStopped ? (
                    <div className="flex items-center gap-1.5 text-amber-300 text-xs">
                      <Square className="w-3.5 h-3.5 flex-shrink-0 fill-current" />
                      <span>{m.text || '本次生成已由用户手动停止。'}</span>
                    </div>
                  ) : isCurrentGenerating && !m.text ? (
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      <span>正在分析设计规范并流式编写页面代码...</span>
                    </div>
                  ) : m.htmlOutput ? (
                    (() => {
                      const mountedScreenId =
                        (m.screenId && screens[m.screenId] ? m.screenId : undefined) ||
                        Object.keys(screens).find((sid) => screens[sid]?.htmlContent === m.htmlOutput);
                      const isMounted = Boolean(mountedScreenId);

                      return (
                        <div className="space-y-2">
                          {isMounted ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>设计画框已挂载至画板</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveScreen(mountedScreenId!)}
                                className="text-[10px] px-2 py-0.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 rounded transition cursor-pointer"
                              >
                                定位画框
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-amber-400 font-medium text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>页面设计代码已就绪，尚未挂载至画板</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => engine.mountMessageHtml(m.id)}
                                className="w-full px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>一键挂载至画板</span>
                              </button>
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 font-mono bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                            结构规格: {settings.frameWidth}px 宽 · {m.htmlOutput.length} 字符 · 遵循 Design Tokens
                          </div>
                        </div>
                      );
                    })()
                  ) : m.text && m.text.includes('[SSRF_BLOCKED]') ? (
                    (() => {
                      const isRuleF = m.text.includes('[SSRF_BLOCKED] F:');
                      const reason = m.text.replace(/\[SSRF_BLOCKED\]\s*[A-Z]:\s*/, '').trim();
                      return (
                        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl space-y-2 text-red-200 shadow-sm">
                          <div className="flex items-center gap-1.5 font-semibold text-xs text-red-400">
                            <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
                            <span>请求被安全护栏拦截</span>
                          </div>
                          <p className="text-[11px] text-red-300/90 leading-relaxed">
                            {isRuleF ? (
                              <>
                                目标端点属于私有局域网或受保护网段。如需连接自建内网模型（如 Ollama / vLLM），请在模型设置中开启<strong>“允许访问局域网/内网端点”</strong>。
                              </>
                            ) : (
                              <>
                                目标端点触发不可豁免的安全防护规则（{reason}）。为保护云凭证与网络环境安全，该请求已被阻断。
                              </>
                            )}
                          </p>
                          {isRuleF && onOpenSettings && (
                            <div className="pt-1">
                              <button
                                onClick={onOpenSettings}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg text-[10px] transition shadow"
                              >
                                打开模型设置开启权限
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="space-y-2">
                      <div className="text-slate-300 text-xs whitespace-pre-wrap">{m.text}</div>
                      {!isCurrentGenerating && (
                        <button
                          type="button"
                          onClick={() => {
                            const prevUserPrompt =
                              engine.messages
                                .slice(0, engine.messages.findIndex((item) => item.id === m.id))
                                .reverse()
                                .find((item) => item.sender === 'user')?.text || '';
                            handleSendMessage(
                              prevUserPrompt
                                ? `请针对之前的页面设计诉求：“${prevUserPrompt}”，直接且仅输出被 <artifact identifier="screen_new" type="screen" title="新页面设计"> 与 </artifact> 包裹的完整页面代码块，严禁输出任何多余解释`
                                : '请直接输出被 <artifact identifier="screen_new" type="screen" title="新页面设计"> 与 </artifact> 包裹的完整页面代码块'
                            );
                          }}
                          className="mt-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-[11px] flex items-center gap-1 transition cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>一键强制生成页面 HTML</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {m.checkpointId && (
                <div className="flex items-center gap-2 pt-1 pl-1">
                  <button
                    onClick={() => alert(`已锁定 Checkpoint [${m.checkpointId}]，可在历史记录中安全撤回。`)}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-400 transition"
                    title="回到生成前状态"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>回到这里 (快照)</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mention Auto-complete Menu (PRD D18 / §3.2.7) */}
      {showMentionMenu && (
        <div className="p-2 bg-slate-950 border-t border-slate-800 max-h-32 overflow-y-auto space-y-1">
          <div className="text-[10px] text-slate-500 px-2 py-0.5 flex items-center gap-1 font-semibold uppercase tracking-wider">
            <AtSign className="w-3 h-3 text-blue-400" />
            <span>引用工程页面上下文 (D18)</span>
          </div>
          {Object.values(screens).map((s) => (
            <div
              key={s.id}
              onClick={() => handleInsertMention(s.name)}
              className="px-2.5 py-1.5 hover:bg-slate-800 rounded-lg cursor-pointer text-slate-300 text-[11px] flex items-center justify-between"
            >
              <span>@{s.name}</span>
              <span className="text-[10px] text-slate-500 font-mono">{settings.frameWidth}px</span>
            </div>
          ))}
        </div>
      )}

      {/* Prompt Templates */}
      <div className="p-2 border-t border-slate-800 bg-slate-900/50 flex flex-wrap gap-1.5">
        {promptTemplates.map((tpl, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(tpl)}
            disabled={engine.isGenerating}
            className="text-[11px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-full border border-slate-700/60 transition"
          >
            {tpl}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-slate-800 bg-slate-900">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          disabled={engine.isGenerating}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                if (ev.target?.result) {
                  setAttachedImage({ name: file.name, dataUrl: ev.target.result as string });
                }
              };
              reader.readAsDataURL(file);
            }
          }}
        />

        {attachedImage && (
          <div className="flex items-center gap-2 p-1.5 px-2.5 bg-slate-950 border border-blue-900/60 rounded-xl text-[11px] text-slate-300 mb-2">
            <img
              src={attachedImage.dataUrl}
              alt="Ref"
              className="w-7 h-7 object-cover rounded-md border border-slate-700"
            />
            <span className="truncate flex-1 font-medium text-blue-300">
              参考设计图: {attachedImage.name} (Vision 就绪)
            </span>
            <button
              onClick={() => setAttachedImage(null)}
              disabled={engine.isGenerating}
              className="text-slate-400 hover:text-slate-200 p-0.5 disabled:opacity-40"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 风格标签 (T-AE-21) —— 仅影响本轮请求，不写入工程 */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {STYLE_TAGS.map((tag) => {
            const on = activeTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  setActiveTags((prev) => (on ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]))
                }
                title="仅作用于本轮请求，不会修改工程设计系统"
                className={`px-2 py-0.5 rounded-lg text-[10px] border transition ${
                  on
                    ? 'border-blue-500 bg-blue-950/50 text-blue-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                }`}
              >
                {tag.label}
              </button>
            );
          })}
          {activeTags.length > 0 && (
            <span className="text-[10px] text-slate-500 self-center ml-0.5">仅本轮生效</span>
          )}
        </div>

        <div className="relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={engine.isGenerating}
            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 disabled:opacity-40 rounded-xl transition"
            title="上传参考设计图/UI截图 (Vision 反推设计)"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (engine.isGenerating) {
                  handleStopGenerating();
                } else {
                  handleSendMessage();
                }
              }
            }}
            placeholder={
              engine.isGenerating
                ? 'AI 正在生成中，点击右侧按钮可立即停止...'
                : '输入设计诉求，或上传参考图让 AI 反推设计...'
            }
            rows={2}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 pr-20 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />

          {/* Submit / Stop Action Button */}
          {engine.isGenerating ? (
            <button
              type="button"
              onClick={handleStopGenerating}
              className="absolute right-2.5 top-2.5 px-2.5 py-1.5 bg-blue-600/20 hover:bg-red-600/30 text-blue-400 hover:text-red-300 border border-blue-500/40 hover:border-red-500/50 rounded-xl transition-all flex items-center gap-1.5 group cursor-pointer shadow-sm select-none"
              title="AI 正在生成中，点击可立即停止 (Stop)"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin group-hover:hidden text-blue-400" />
              <Square className="w-3.5 h-3.5 hidden group-hover:block fill-current text-red-400" />
              <span className="text-[11px] font-medium transition">
                <span className="group-hover:hidden animate-pulse">思考中</span>
                <span className="hidden group-hover:inline text-red-300 font-semibold">停止</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!input.trim() && !attachedImage}
              className="absolute right-2.5 top-2.5 p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition shadow"
              title="发送设计诉求 (Enter)"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
