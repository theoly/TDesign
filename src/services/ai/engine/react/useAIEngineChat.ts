import { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../../../stores/useProjectStore';
import { useAIConfigStore } from '../../../../stores/useAIConfigStore';
import { useHistoryStore } from '../../../../stores/useHistoryStore';
import { PipelineExecutor } from '../pipeline/executor';
import { PipelineOutput } from '../pipeline/types';
import { createAIEngineCore } from '../core';
import { StructureDiff } from '../../../../utils/structureGuard';

export interface ChatMessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  imageUrl?: string;
  reasoningText?: string;
  thinkingStage?: number; // 1: 分析需求, 2: 规划布局, 3: 应用Token, 4: 渲染出图 (PRD §3.2.3)
  isGenerating?: boolean;
  isStopped?: boolean;
  elapsedSeconds?: number;
  checkpointId?: string;
  screenId?: string;
  screenName?: string;
  htmlOutput?: string;
  unmatchedMentions?: string[];
  structureDiff?: StructureDiff;
  pendingProposal?: any;
  candidateDecision?: string;
  decisionConfirmed?: boolean;
}

const WELCOME_MESSAGE: ChatMessageItem = {
  id: 'welcome',
  sender: 'assistant',
  text: '你好！我是 AI 原生设计助手。输入页面诉求或点击下方快捷模板，我将基于当前工程的 Design Tokens 为您生成规范的 UI 画框。支持上传参考图反推设计，输入 @ 可显式引用已有画框。'
};

function detectCandidateDecision(prompt: string): string | undefined {
  const match = prompt.match(/(?:统一|必须|默认|约定|全部|所有)(.+?(?:圆角|风格|色|间距|规范|字体|阴影|设计|边框|组件))/);
  if (match) {
    return prompt.trim();
  }
  return undefined;
}

export function useAIEngineChat() {
  const {
    screens,
    activeScreenId,
    designSystem,
    setDesignSystem,
    decisions,
    settings,
    stageScreenChange,
    adoptStagedChange,
    discardStagedChange,
    keepBothScreens,
    addScreen,
    addDecision,
    getConversationStore,
    getAttachmentStore
  } = useProjectStore();

  const { getActiveProviderForRole } = useAIConfigStore();
  const { addCheckpoint } = useHistoryStore();

  const [messages, setMessages] = useState<ChatMessageItem[]>([WELCOME_MESSAGE]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const [unmatchedMentions, setUnmatchedMentions] = useState<string[]>([]);
  const [lastGuardOutput, setLastGuardOutput] = useState<PipelineOutput | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const engineCoreRef = useRef(createAIEngineCore());

  // Restore conversations from store on project load
  useEffect(() => {
    let isCancelled = false;
    const loadSaved = async () => {
      try {
        const convStore = getConversationStore();
        const turns = await convStore.loadRecent(40);
        if (!isCancelled && turns && turns.length > 0) {
          const restored: ChatMessageItem[] = [];
          turns.forEach((t) => {
            restored.push({
              id: `usr_${t.turnId}`,
              sender: 'user',
              text: t.user.text
            });
            restored.push({
              id: `ast_${t.turnId}`,
              sender: 'assistant',
              text: t.assistant.text || '已完成设计生成。',
              checkpointId: t.changeSet?.checkpointId
            });
          });
          setMessages([WELCOME_MESSAGE, ...restored]);
        }
      } catch (e) {
        console.warn('Load conversations error:', e);
      }
    };
    loadSaved();
    return () => {
      isCancelled = true;
    };
  }, [getConversationStore]);

  const abort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      setMessages((prev) =>
        prev.map((m, idx) =>
          idx === prev.length - 1 && m.sender === 'assistant'
            ? {
                ...m,
                isStopped: true,
                isGenerating: false,
                text: m.text ? `${m.text}\n\n[用户已停止生成]` : '生成已由用户手动停止。'
              }
            : m
        )
      );
    }
  };

  const sendMessage = async (rawPrompt: string, attachment?: { name: string; dataUrl: string }) => {
    const textToSend = rawPrompt.trim();
    if (!textToSend || isGenerating) return;

    const activeRole = attachment
      ? getActiveProviderForRole('vision') || getActiveProviderForRole('code')
      : getActiveProviderForRole('code');

    if (!activeRole || !activeRole.provider || !activeRole.provider.apiKey) {
      setMessages((prev) => [
        ...prev,
        { id: `user_${Date.now()}`, sender: 'user', text: textToSend },
        {
          id: `warn_${Date.now()}`,
          sender: 'assistant',
          text: '未检测到已配置或已启用的 AI Provider（或 API Key 为空）。请先在右上角【设置】中配置 Provider 凭证。'
        }
      ]);
      return;
    }

    const userMsgId = `usr_${Date.now()}`;
    const assistantMsgId = `ast_${Date.now()}`;
    const startTime = Date.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: 'user', text: textToSend, imageUrl: attachment?.dataUrl },
      {
        id: assistantMsgId,
        sender: 'assistant',
        text: '',
        isGenerating: true,
        thinkingStage: 1 // 1: 分析需求
      }
    ]);

    setIsGenerating(true);
    setThinkingStage(1);
    setUnmatchedMentions([]);
    setLastGuardOutput(null);

    // Simulate progressive thinking stages per PRD §3.2.3
    const stageTimer1 = setTimeout(() => {
      setThinkingStage(2); // 2: 规划布局
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, thinkingStage: 2 } : m))
      );
    }, 600);

    const stageTimer2 = setTimeout(() => {
      setThinkingStage(3); // 3: 应用Token
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, thinkingStage: 3 } : m))
      );
    }, 1200);

    try {
      const activeDecisionsList = Object.values(decisions)
        .filter((d) => d.active)
        .map((d) => ({
          id: d.id,
          rule: d.text,
          rationale: d.scope === 'global' ? '全局约定' : '画框局部约定'
        }));

      const output = await PipelineExecutor.execute({
        input: {
          rawPrompt: textToSend,
          attachment,
          activeScreenId
        },
        provider: activeRole.provider,
        model: activeRole.modelId,
        engineCore: engineCoreRef.current,
        screens,
        deviceProfile: settings.deviceProfile,
        frameWidth: settings.frameWidth,
        baseSystemPrompt: '你是一名顶级前端与UI设计系统专家，负责输出高质感现代 Web 设计。',
        designTokens: designSystem.tokens,
        designRules: activeDecisionsList.map((d) => d.rule),
        decisions: activeDecisionsList,
        onStreamDelta: (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, thinkingStage: 4, text: m.text + delta }
                : m
            )
          );
        },
        onReasoningDelta: (rDelta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, reasoningText: (m.reasoningText || '') + rDelta }
                : m
            )
          );
        },
        signal: controller.signal
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));

      if (output.status === 'error') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, isGenerating: false, text: `生成失败: ${output.errorMessage}` }
              : m
          )
        );
        return;
      }

      if (output.status === 'rejected_by_guard') {
        setLastGuardOutput(output);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  isGenerating: false,
                  elapsedSeconds,
                  structureDiff: output.structureDiff,
                  text: `⚠️ ${output.errorMessage}\n\n为保护已有布局不被误删，已自动拦截直接覆盖。若确认这是你的本意，可点击下方【强制应用】放行。`
                }
              : m
          )
        );
        return;
      }

      if (output.status === 'theme_proposed') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  isGenerating: false,
                  elapsedSeconds,
                  pendingProposal: output.themeProposal,
                  text: '已生成设计系统 Token 变更提案，请在设计面板中确认采纳。'
                }
              : m
          )
        );
        return;
      }

      let checkpointId: string | undefined;
      let createdScreenId: string | undefined;
      let finalScreenName: string | undefined;

      // PRD D17 Side-by-side adoption handling
      if (output.status === 'staged_side_by_side' && output.stagedScreen) {
        stageScreenChange(
          output.stagedScreen.targetOriginalId,
          output.stagedScreen.htmlContent,
          output.stagedScreen.name
        );
      } else if (output.extractedHtml) {
        // Create new screen
        const currentScreens = useProjectStore.getState().screens;
        const count = Object.keys(currentScreens).length;
        const requestedId = output.artifactMetadata?.identifier;
        const newId =
          requestedId && !currentScreens[requestedId]
            ? requestedId
            : `screen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        finalScreenName =
          output.artifactMetadata?.title?.trim() || `画框 ${count + 1} (AI)`;

        // Calculate position based on current right-most screen to avoid overlaps
        const allScreens = Object.values(currentScreens);
        const maxX = allScreens.reduce(
          (max, s) => Math.max(max, s.position?.x ?? 0),
          0
        );
        const frameWidth = settings.frameWidth || 390;
        const newX = allScreens.length === 0 ? 100 : maxX + frameWidth + 120;

        createdScreenId = addScreen(
          {
            name: finalScreenName,
            position: { x: newX, y: 120 },
            htmlContent: output.extractedHtml
          },
          newId
        );
        checkpointId = addCheckpoint(`AI 生成新页面: ${finalScreenName}`, {
          screenId: createdScreenId,
          htmlContent: output.extractedHtml
        });
      }

      const candidateDecision = detectCandidateDecision(textToSend);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                isGenerating: false,
                elapsedSeconds,
                checkpointId,
                screenId: createdScreenId,
                screenName: finalScreenName,
                htmlOutput: output.extractedHtml,
                candidateDecision,
                text: m.text || '已根据指示生成高保真设计。'
              }
            : m
        )
      );

      // JSONL Conversation persistence
      try {
        let attachmentPath: string | undefined;
        if (attachment) {
          const saved = await getAttachmentStore().save(attachment.name, attachment.dataUrl);
          if (saved) {
            attachmentPath = saved.relPath;
          }
        }

        await getConversationStore().appendTurn({
          turnId: `turn_${Date.now()}`,
          ts: Date.now(),
          user: {
            text: textToSend,
            attachments: attachmentPath ? [attachmentPath] : undefined
          },
          assistant: {
            text: output.rawResponse
          },
          changeSet: {
            screens: output.changeSet?.screens as any,
            checkpointId
          }
        });
      } catch (storeErr) {
        console.warn('Conversation save error:', storeErr);
      }
    } catch (err: any) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, isGenerating: false, text: `请求异常: ${err?.message || '未知错误'}` }
            : m
        )
      );
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const forceApply = () => {
    if (!lastGuardOutput?.extractedHtml || !activeScreenId) return;
    stageScreenChange(
      activeScreenId,
      lastGuardOutput.extractedHtml,
      `${screens[activeScreenId]?.name || '画框'} (强制应用)`
    );
    setLastGuardOutput(null);
  };

  const confirmDecision = (msgId: string, decisionText: string) => {
    addDecision(decisionText, 'global', undefined, { kind: 'auto_extracted', conversationId: msgId });
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, decisionConfirmed: true } : m)));
  };

  const dismissDecision = (msgId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, candidateDecision: undefined } : m)));
  };

  const resolveProposal = (msgId: string, choice: 'applied' | 'once' | 'ignored') => {
    const targetMsg = messages.find((m) => m.id === msgId);
    const proposal = targetMsg?.pendingProposal;
    if (choice === 'applied' && proposal) {
      setDesignSystem({ ...designSystem, tokens: proposal.apply(designSystem.tokens) });
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pendingProposal
          ? { ...m, pendingProposal: { ...m.pendingProposal, resolved: choice } }
          : m
      )
    );
  };

  const mountMessageHtml = (msgId: string) => {
    const target = messages.find((m) => m.id === msgId);
    if (!target?.htmlOutput) return;

    const currentScreens = useProjectStore.getState().screens;
    const count = Object.keys(currentScreens).length;
    const newId = `screen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const screenName = target.screenName || `画框 ${count + 1} (AI)`;
    const allScreens = Object.values(currentScreens);
    const maxX = allScreens.reduce(
      (max, s) => Math.max(max, s.position?.x ?? 0),
      0
    );
    const frameWidth = settings.frameWidth || 390;
    const newX = allScreens.length === 0 ? 100 : maxX + frameWidth + 120;

    const createdId = addScreen(
      {
        name: screenName,
        position: { x: newX, y: 120 },
        htmlContent: target.htmlOutput
      },
      newId
    );

    const cpId = addCheckpoint(`手动挂载页面: ${screenName}`, {
      screenId: createdId,
      htmlContent: target.htmlOutput
    });

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, screenId: createdId, screenName, checkpointId: cpId }
          : m
      )
    );
  };

  return {
    messages,
    isGenerating,
    thinkingStage,
    unmatchedMentions,
    lastGuardOutput,
    sendMessage,
    abort,
    forceApply,
    mountMessageHtml,
    confirmDecision,
    dismissDecision,
    resolveProposal,
    adoptCandidate: adoptStagedChange,
    discardCandidate: discardStagedChange,
    keepBothCandidates: keepBothScreens
  };
}
