import { GlobalRegistrator } from '@happy-dom/global-registrator';

// bun test 默认无 DOM；文本节点工具与组件指纹均依赖 DOMParser
GlobalRegistrator.register();
