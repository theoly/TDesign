import React, { useState } from 'react';
import { useAIConfigStore, THIRD_PARTY_PRESETS } from '../../stores/useAIConfigStore';
import { useUsageStore } from '../../stores/useUsageStore';
import { AIProviderConfig, ProviderProtocol, ThirdPartyPreset } from '../../types/provider';
import { AIService } from '../../services/ai/aiService';
import {
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Plus,
  Server,
  ShieldAlert,
  Sparkles,
  Trash2,
  XCircle
} from 'lucide-react';

interface AIProviderModalProps {
  onClose: () => void;
}

export const AIProviderModal: React.FC<AIProviderModalProps> = ({ onClose }) => {
  const { providers, bindings, addProvider, updateProvider, deleteProvider, setRoleBinding } =
    useAIConfigStore();
  const { totalCalls, totalInputTokens, totalOutputTokens, totalEstimatedCostUsd, clearUsage } =
    useUsageStore();

  const [selectedProviderId, setSelectedProviderId] = useState<string>(providers[0]?.id || '');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<{ testing: boolean; success?: boolean; message?: string }>({
    testing: false
  });

  const curProvider = providers.find((p) => p.id === selectedProviderId) || providers[0];

  const getProviderModelId = (prov?: AIProviderConfig): string => {
    if (!prov) return 'deepseek-chat';
    if (prov.defaultModel) return prov.defaultModel;
    if (bindings.code.providerId === prov.id) return bindings.code.modelId;
    if (bindings.chat.providerId === prov.id) return bindings.chat.modelId;
    switch (prov.protocol) {
      case 'anthropic':
        return 'claude-3-5-sonnet-20241022';
      case 'gemini':
        return 'gemini-2.0-flash';
      case 'ollama_native':
        return 'qwen2.5-coder';
      case 'openai_compatible':
      default:
        return prov.id === 'prov-deepseek' ? 'deepseek-chat' : 'gpt-4o';
    }
  };

  const curModelId = getProviderModelId(curProvider);
  const isCurActive = bindings.code.providerId === curProvider?.id;

  const handleModelChange = (newModelId: string) => {
    if (!curProvider) return;
    updateProvider(curProvider.id, { defaultModel: newModelId });
    if (bindings.code.providerId === curProvider.id) {
      setRoleBinding('code', { ...bindings.code, modelId: newModelId });
    }
    if (bindings.chat.providerId === curProvider.id) {
      setRoleBinding('chat', { ...bindings.chat, modelId: newModelId });
    }
  };

  const handleSetAsActive = () => {
    if (!curProvider) return;
    const modelId = curModelId.trim();
    setRoleBinding('code', {
      role: 'code',
      providerId: curProvider.id,
      modelId
    });
    setRoleBinding('chat', {
      role: 'chat',
      providerId: curProvider.id,
      modelId
    });
  };

  const handleTestConnection = async () => {
    if (!curProvider) return;
    const modelToTest = curModelId.trim();
    if (!modelToTest) {
      setTestStatus({ testing: false, success: false, message: '请填写模型 ID (Model ID) 后再测试' });
      return;
    }
    if (!curProvider.apiKey && curProvider.protocol !== 'ollama_native') {
      setTestStatus({ testing: false, success: false, message: '请填写 API Key 凭证后再测试' });
      return;
    }

    setTestStatus({ testing: true });
    const res = await AIService.testConnection(curProvider, modelToTest);
    setTestStatus({ testing: false, success: res.success, message: res.message });
  };

  const handleAddPreset = (preset: ThirdPartyPreset) => {
    const newId = `prov-custom-${Date.now()}`;
    const newProvider: AIProviderConfig = {
      id: newId,
      name: preset.name,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl,
      apiKey: '',
      isEnabled: true,
      defaultModel: preset.defaultModel,
      isCustom: true
    };
    addProvider(newProvider);
    setSelectedProviderId(newId);
    setShowAddMenu(false);
    setTestStatus({ testing: false });
  };

  const handleDeleteProvider = (provId: string) => {
    if (!confirm('确定要删除此 Provider 配置吗？')) return;
    const remaining = providers.filter((p) => p.id !== provId);
    deleteProvider(provId);
    if (selectedProviderId === provId && remaining[0]) {
      setSelectedProviderId(remaining[0].id);
    }
    setTestStatus({ testing: false });
  };

  // Get suggested models for the current provider
  const getSuggestedModels = (): string[] => {
    if (!curProvider) return [];
    if (curProvider.id === 'prov-deepseek') {
      return ['deepseek-chat', 'deepseek-flash', 'deepseek-reasoner'];
    }
    if (curProvider.id === 'prov-openai') {
      return ['gpt-4o', 'gpt-4o-mini', 'o3-mini'];
    }
    if (curProvider.protocol === 'anthropic') {
      return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-7-sonnet-20250219'];
    }
    if (curProvider.protocol === 'gemini') {
      return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-2.5-flash'];
    }
    if (curProvider.protocol === 'ollama_native') {
      return ['qwen2.5-coder', 'llama3.3', 'deepseek-r1:8b'];
    }
    // Check if matches any preset
    const preset = THIRD_PARTY_PRESETS.find((p) => p.name === curProvider.name);
    if (preset?.suggestedModels?.length) {
      return preset.suggestedModels;
    }
    return ['deepseek-chat', 'gpt-4o', 'claude-3-5-sonnet-20241022'];
  };

  const protocolLabels: Record<ProviderProtocol, string> = {
    openai_compatible: 'OpenAI 兼容 (openai_compatible)',
    anthropic: 'Claude 兼容 (anthropic)',
    gemini: 'Google Gemini (gemini)',
    ollama_native: '本地 Ollama (ollama_native)'
  };

  const activeCodeProv = providers.find((p) => p.id === bindings.code.providerId);
  const activeChatProv = providers.find((p) => p.id === bindings.chat.providerId);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-slate-100 text-sm">
              AI Provider 配置与模型档位绑定 (Settings)
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">
            ×
          </button>
        </div>

        {/* Content Layout */}
        <div className="flex-1 flex overflow-hidden text-xs">
          {/* Provider Sidebar List */}
          <div className="w-64 border-r border-slate-800 bg-slate-950 p-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Provider 厂商列表
              </span>
              <div className="relative">
                <button
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-medium text-[10px] border border-blue-500/30 transition"
                  title="添加第三方或自定义 Provider"
                >
                  <Plus className="w-3 h-3" />
                  <span>添加第三方</span>
                </button>

                {/* Add Preset Dropdown Menu */}
                {showAddMenu && (
                  <div className="absolute right-0 top-7 z-20 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 px-2 py-1 block">
                      选择预设规范快速接入
                    </span>
                    {THIRD_PARTY_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleAddPreset(p)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-800 transition flex flex-col gap-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[11px] text-blue-300">{p.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {p.protocol === 'anthropic' ? 'Claude' : 'OpenAI'}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 line-clamp-1">{p.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Provider Buttons Scroll Area */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {providers.map((prov) => {
                const isActive = bindings.code.providerId === prov.id;
                const isSelected = curProvider?.id === prov.id;

                return (
                  <button
                    key={prov.id}
                    onClick={() => {
                      setSelectedProviderId(prov.id);
                      setTestStatus({ testing: false });
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl transition flex items-center justify-between group ${
                      isSelected
                        ? 'bg-blue-600 text-white font-medium shadow'
                        : 'text-slate-300 hover:bg-slate-850 hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{prov.name}</span>
                      {prov.isCustom && (
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                            isSelected ? 'bg-blue-700 text-blue-200' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          第三方
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isActive && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                            isSelected ? 'bg-blue-700 text-white' : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          主力
                        </span>
                      )}
                      {prov.apiKey && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Model Role Bindings Summary */}
            <div className="pt-3 mt-3 border-t border-slate-800 space-y-1.5 flex-shrink-0">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 block">
                核心能力档位指派
              </span>
              <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>页面代码生成档</span>
                    <span className="text-slate-500 font-mono text-[9px] truncate max-w-[80px]">
                      {activeCodeProv?.name || '未指定'}
                    </span>
                  </div>
                  <span className="font-semibold text-blue-400 truncate block font-mono">
                    {bindings.code.modelId}
                  </span>
                </div>
                <div className="border-t border-slate-800/60 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>对话与意图推理档</span>
                    <span className="text-slate-500 font-mono text-[9px] truncate max-w-[80px]">
                      {activeChatProv?.name || '未指定'}
                    </span>
                  </div>
                  <span className="font-semibold text-slate-300 truncate block font-mono">
                    {bindings.chat.modelId}
                  </span>
                </div>
              </div>
            </div>

            {/* Token & Cost Usage Dashboard (PRD §3.1.4) */}
            <div className="pt-3 mt-3 border-t border-slate-800 space-y-1.5 flex-shrink-0">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <BarChart3 className="w-3 h-3 text-emerald-400" />
                  <span>用量与成本 (Usage)</span>
                </span>
                {totalCalls > 0 && (
                  <button onClick={clearUsage} className="text-[10px] text-slate-500 hover:text-slate-300">
                    重置
                  </button>
                )}
              </div>
              <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">调用频次</span>
                  <span className="font-mono font-semibold text-slate-200">{totalCalls} 次</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">总 Tokens</span>
                  <span className="font-mono font-semibold text-blue-400">
                    {Math.round((totalInputTokens + totalOutputTokens) / 1000)}k
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 pt-1">
                  <span className="text-[10px] text-slate-400">预估累计开销</span>
                  <span className="font-mono font-bold text-emerald-400">${totalEstimatedCostUsd}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-900">
            {curProvider ? (
              <>
                {/* Header with Title, Role Assignment, and Delete Action */}
                <div className="flex items-start justify-between pb-3 border-b border-slate-800">
                  <div className="space-y-1 flex-1 mr-4">
                    {curProvider.isCustom ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={curProvider.name}
                          onChange={(e) => updateProvider(curProvider.id, { name: e.target.value })}
                          className="text-base font-bold text-slate-100 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 font-sans max-w-xs"
                          placeholder="Provider 名称"
                        />
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                          自定义第三方
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-100">{curProvider.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          内置 Provider
                        </span>
                      </div>
                    )}
                    <p className="text-slate-400 text-[11px]">
                      配置该 Provider 的接口协议规范、网关地址、API Key 凭证与模型角色。
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isCurActive ? (
                      <span className="px-3 py-1.5 rounded-xl bg-blue-500/20 text-blue-300 text-xs font-medium border border-blue-500/30 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>当前主力生成模型</span>
                      </span>
                    ) : (
                      <button
                        onClick={handleSetAsActive}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>设为主力模型 (Code & Chat)</span>
                      </button>
                    )}

                    {curProvider.isCustom && (
                      <button
                        onClick={() => handleDeleteProvider(curProvider.id)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 transition"
                        title="删除该自定义 Provider"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Protocol Selector */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold block">接口协议规范 (Protocol)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['openai_compatible', 'anthropic', 'gemini', 'ollama_native'] as ProviderProtocol[]).map(
                      (proto) => {
                        const isSelected = curProvider.protocol === proto;
                        return (
                          <button
                            key={proto}
                            type="button"
                            onClick={() => {
                              updateProvider(curProvider.id, { protocol: proto });
                              // Auto suggest sensible default model if switching protocol
                              if (proto === 'anthropic' && curProvider.protocol !== 'anthropic') {
                                handleModelChange('claude-3-5-sonnet-20241022');
                              } else if (proto === 'openai_compatible' && curProvider.protocol !== 'openai_compatible') {
                                handleModelChange('deepseek-chat');
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 ${
                              isSelected
                                ? 'border-blue-500 bg-blue-950/40 text-blue-200 shadow-sm'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-slate-200">
                                {proto === 'openai_compatible' && 'OpenAI 兼容规范'}
                                {proto === 'anthropic' && 'Claude 兼容规范'}
                                {proto === 'gemini' && 'Google Gemini 原生'}
                                {proto === 'ollama_native' && '本地 Ollama 原生'}
                              </span>
                              {isSelected && <span className="w-2 h-2 rounded-full bg-blue-400" />}
                            </div>
                            <span className="text-[10px] text-slate-500">
                              {proto === 'openai_compatible' && '支持 DeepSeek, SiliconFlow, OpenRouter, OneAPI 等'}
                              {proto === 'anthropic' && '原生 /v1/messages 接口，支持 Claude 官方及兼容代理'}
                              {proto === 'gemini' && 'Google AI Studio / Generative Language 接口'}
                              {proto === 'ollama_native' && '本地部署 Ollama /api/chat 接口'}
                            </span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* API Base URL */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-semibold block">API Base URL (接口网关)</label>
                    <span className="text-[10px] text-slate-500">
                      {curProvider.protocol === 'openai_compatible' && '系统会自动调用 /chat/completions'}
                      {curProvider.protocol === 'anthropic' && '系统会自动调用 /v1/messages'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={curProvider.baseUrl}
                    onChange={(e) => updateProvider(curProvider.id, { baseUrl: e.target.value })}
                    placeholder={
                      curProvider.protocol === 'anthropic'
                        ? 'https://api.anthropic.com'
                        : 'https://api.openai.com/v1 或第三方代理地址'
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                  />
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-semibold block">API Key 凭证</label>
                    <span className="text-[10px] text-slate-500">仅存本地配置，绝不上报第三方</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="sk-••••••••••••••••"
                      value={curProvider.apiKey}
                      onChange={(e) => updateProvider(curProvider.id, { apiKey: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 pr-10 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition"
                      tabIndex={-1}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Model ID Binding */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-semibold block">当前分配的模型 ID (Model ID)</label>
                    <span className="text-[10px] text-slate-500">
                      支持任意第三方模型名，将作为测试与调用的 model 参数
                    </span>
                  </div>
                  <input
                    type="text"
                    value={curModelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    placeholder="输入模型 ID，如 deepseek-flash, claude-3-5-sonnet-20241022 等"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                  />

                  {/* Suggested Model Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] text-slate-500">常用模型推荐:</span>
                    {getSuggestedModels().map((mod) => (
                      <button
                        key={mod}
                        type="button"
                        onClick={() => handleModelChange(mod)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition ${
                          curModelId === mod
                            ? 'bg-blue-950 border-blue-500 text-blue-300 font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {mod}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Private Network / SSRF Settings (REQ-OD-04 / REQ-OD-07) */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-slate-300 font-semibold block text-xs">
                        允许访问局域网/内网端点 (Allow Private Network)
                      </label>
                      <span className="text-[10px] text-slate-500 block">
                        用于连接局域网私有模型服务器 (如 192.168.x.x, 10.x.x.x)。云元数据等受保护地址始终受到硬阻断。
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!curProvider.allowPrivateNetwork}
                        onChange={(e) => updateProvider(curProvider.id, { allowPrivateNetwork: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                {/* Connectivity Test */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-4">
                  <button
                    onClick={handleTestConnection}
                    disabled={testStatus.testing || (!curProvider.apiKey && curProvider.protocol !== 'ollama_native')}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-medium rounded-xl border border-slate-700 transition flex-shrink-0"
                  >
                    {testStatus.testing ? '正在测试连接...' : '测试连通性'}
                  </button>

                  {testStatus.message && (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {testStatus.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <span
                        className={`truncate text-xs ${
                          testStatus.success ? 'text-emerald-400' : 'text-red-400 font-mono'
                        }`}
                        title={testStatus.message}
                      >
                        {testStatus.message}
                      </span>
                    </div>
                  )}
                </div>

                {/* Security Notice (D4 / §3.1.3) */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5 text-[11px] text-slate-400">
                  <ShieldAlert className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-semibold text-slate-300 block mb-0.5">隐私与安全声明 (PRD D4)</span>
                    根据设计约定，本软件采用单机单人运行架构。API Key 仅以明文安全保留在您的本地客户端存储中，在对话与生成时仅直接发往您所填写的 Base URL，绝对不会上传至任何第三方服务器。
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                请从左侧选择或添加 Provider
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-xs transition shadow"
          >
            保存并关闭
          </button>
        </div>
      </div>
    </div>
  );
};
