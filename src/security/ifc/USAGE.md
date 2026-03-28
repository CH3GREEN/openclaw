# FIDES IFC 系统集成指南

## 概述

FIDES (Flow-based Information Defense for Embedded Systems) 是一个基于信息流控制 (IFC) 的安全系统，用于防止 AI 代理执行未经授权的操作或泄露敏感信息。

## 快速开始

### 1. 基础使用

```typescript
import { 
  IFCSecurityMiddleware,
  PolicyEngine,
  createAgentDojoPolicies,
  createLabel,
  FidesPlanner
} from 'openclaw';

// 创建中间件实例
const ifc = new IFCSecurityMiddleware();

// 初始化系统提示
ifc.initialize("You are a helpful assistant with security controls.");

// 处理用户输入
const action = ifc.processUserInput("Send an email to John", "user123");
```

### 2. 工具包装

```typescript
import { createIFCExecutor } from 'openclaw';

// 创建 IFC 执行器
const executor = createIFCExecutor({
  enabled: true,
  throwOnViolation: true,
  debug: true,
});

// 注册工具元数据
executor.registerTool({
  name: 'send_email',
  toolLabel: createLabel('T', ['user']),
  reads: [],
  writes: ['email'],
  isConsequential: true,
  isEgress: true,
});

// 包装工具函数
const originalSendEmail = async (args: { to: string; body: string }) => {
  // 实际发送邮件逻辑
};

const safeSendEmail = executor.wrapTool('send_email', originalSendEmail);

// 使用包装后的工具
await safeSendEmail({ to: 'john@example.com', body: 'Hello!' });
```

### 3. 策略检查

```typescript
// 检查工具调用是否符合策略
const result = executor.checkToolCall('send_email', {
  to: 'john@example.com',
  body: 'Hello!'
});

if (result.allowed) {
  console.log('工具调用允许执行');
} else {
  console.log(`策略阻止：${result.reason}`);
  console.log(`策略类型：${result.policyType}`); // P-T 或 P-F
}
```

## 核心概念

### 安全标签 (Security Labels)

每个数据都有两个维度的标签：

```typescript
interface SecurityLabel {
  integrity: 'T' | 'U';  // T=Trusted, U=Untrusted
  confidentiality: Set<string>;  // 允许访问的读者集合
}
```

### 标签示例

```typescript
// 用户输入：可信，只有用户可以访问
const userLabel = createLabel('T', ['user']);

// 公开数据：可信，任何人都可以访问
const publicLabel = createLabel('T', ['public']);

// 外部数据：不可信，只有用户可以访问
const externalLabel = createLabel('U', ['user']);

// 系统数据：可信，公开
const systemLabel = createLabel('T', ['public']);
```

### 策略类型

1. **P-T (Policy-Trusted)**: 确保只有可信数据能触发重要操作
   - 适用于：发送邮件、删除文件、转账等
   - 检查：工具和参数的 integrity 必须是 'T'

2. **P-F (Policy-Flow)**: 确保数据不会泄露给未授权的读者
   - 适用于：发送消息、分享文件等
   - 检查：参数的 readers 必须是工具允许的子集

## 配置选项

```typescript
interface IFCConfig {
  enabled: boolean;              // 是否启用 IFC (默认：false)
  throwOnViolation: boolean;     // 违规时抛出异常 (默认：true)
  debug: boolean;                // 调试日志 (默认：false)
  defaultIntegrity: 'T' | 'U';   // 默认完整性标签 (默认：'T')
  defaultReaders: string[];      // 默认读者集合 (默认：['user'])
  policyEngine?: PolicyEngine;   // 自定义策略引擎
}
```

## 工具元数据注册

```typescript
// 重要工具（需要 P-T 检查）
executor.registerTool({
  name: 'send_email',
  toolLabel: createLabel('T', ['user']),
  reads: [],
  writes: ['email'],
  isConsequential: true,  // 启用 P-T 检查
  isEgress: true,         // 启用 P-F 检查
});

// 只读工具（不需要检查）
executor.registerTool({
  name: 'read_emails',
  toolLabel: createLabel('U', ['user']),
  reads: ['email'],
  writes: [],
  isConsequential: false,
  isEgress: false,
});

// 外部数据工具
executor.registerTool({
  name: 'web_search',
  toolLabel: createLabel('U', ['public']),
  reads: [],
  writes: [],
  isConsequential: false,
  isEgress: false,
});
```

## 与 OpenClaw 集成

### 在 Gateway 中启用 IFC

```typescript
// gateway/server.ts 或类似入口文件
import { createIFCExecutor, getToolMetadata } from './security/ifc/index.js';

// 创建全局 IFC 执行器
const ifcExecutor = createIFCExecutor({
  enabled: process.env.IFC_ENABLED === 'true',
  throwOnViolation: true,
  debug: process.env.NODE_ENV === 'development',
});

// 在工具执行前检查
async function executeTool(toolName: string, args: any) {
  const result = ifcExecutor.checkToolCall(toolName, args);
  
  if (!result.allowed) {
    throw new Error(`IFC Policy violation: ${result.reason}`);
  }
  
  // 执行工具...
}
```

### 环境变量

```bash
# .env 文件
IFC_ENABLED=true
IFC_DEBUG=true
IFC_THROW_ON_VIOLATION=true
```

## 调试

### 查看变量存储

```typescript
const planner = new FidesPlanner({...});
console.log('变量存储:', planner.getVariableStoreDebugInfo());
```

### 查看安全状态

```typescript
const status = executor.getStatus();
console.log('IFC 状态:', status);
// 输出:
// {
//   enabled: true,
//   config: {...},
//   registeredTools: ['send_email', 'read_emails', ...]
// }
```

### 查看上下文标签

```typescript
const state = planner.getState();
console.log('上下文标签:', state.contextLabel);
// 输出：{ integrity: 'T', confidentiality: Set{'user', 'public'} }
```

## 最佳实践

1. **渐进式启用**: 先在开发环境测试，确认无误后再在生产环境启用
2. **工具分类**: 明确区分 consequential 和 non-consequential 工具
3. **最小权限**: 为工具设置最小的必要读者集合
4. **日志记录**: 启用调试模式记录所有策略检查
5. **定期审计**: 定期检查工具元数据和策略配置

## 故障排除

### 常见问题

**Q: 所有工具调用都被阻止**
- 检查 `enabled` 配置
- 确认工具已正确注册
- 检查标签配置是否过于严格

**Q: 标签传播不正确**
- 使用 `planner.getVariableStoreDebugInfo()` 查看变量状态
- 确认 `hideValue` 和 `expandVariables` 正确使用

**Q: 性能问题**
- IFC 会增加少量开销（标签计算和策略检查）
- 考虑只对 consequential 工具启用检查

## 参考资料

- 论文：arXiv:2505.23643v2
- AgentDojo 基准测试
- OpenClaw 安全文档

## 支持

如有问题，请查看：
- `/src/security/ifc/README-Integration.md`
- `/src/security/ifc/examples/` 目录中的示例代码
