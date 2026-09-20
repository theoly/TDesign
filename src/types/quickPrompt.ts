export type QuickPromptScope = 'project' | 'global';

export interface QuickPromptItem {
  id: string;
  title: string;
  content: string;
  scope: QuickPromptScope;
  isBuiltin?: boolean;
  createdAt?: number;
}
