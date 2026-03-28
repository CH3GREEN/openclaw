# IFC 系统集成总结

## 文件结构

```
src/
├── index.ts                          # 主入口，导出 IFC 功能
├── security/
│   ├── index.ts                      # 安全模块导出
│   └── ifc/
│       ├── index.ts                  # IFC 模块导出
│       ├── core.ts                   # FIDES 核心算法实现
│       ├── tool-wrapper.ts           # 工具包装器
│       ├── executor.ts               # IFC 执行器
│       ├── gateway-integration.ts    # Gateway 集成示例
│       ├── ifc-middleware.ts         # (在 middleware 目录)
│       ├── USAGE.md                  # 使用指南
│       ├── README-Integration.md     # 集成文档
│       └── examples/                 # 示例代码
└── middleware/
    ├── index.ts                      # 中间件模块导出
    └── ifc-middleware.ts             # IFC 中间件
```

## 已完成的集成

### 1. 核心模块导出 ✅

- `src/security/ifc/index.ts` - 导出所有 IFC 核心功能
- `src/security/index.ts` - 将 IFC 添加到安全模块导出
- `src/middleware/index.ts` - 导出 IFC 中间件
- `src/index.ts` - 主入口导出 IFC 功能

### 2. IFC 组件 ✅

- **core.ts**: FIDES 算法核心实现
  - 安全标签 (SecurityLabel)
  - 晶格操作 (Lattice operations)
  - 策略引擎 (PolicyEngine)
  - 污点追踪 (TaintTracker)
  - 规划器 (BasicPlanner, FidesPlanner)
  - 查询 LLM (Query LLM)

- **tool-wrapper.ts**: 工具包装器
  - OpenClaw 工具元数据规则
  - 工具包装函数
  - 策略检查函数

- **executor.ts**: IFC 执行器
  - 配置管理
  - 工具注册
  - 策略检查
  - 工具包装

- **gateway-integration.ts**: Gateway 集成
  - 默认工具策略
  - 中间件函数
  - 审计日志

- **ifc-middleware.ts**: 中间件封装
  - 简化 API
  - 状态管理

### 3. 文档 ✅

- **USAGE.md**: 详细使用指南
- **README-Integration.md**: 集成说明
- **INTEGRATION-SUMMARY.md**: 本文件

## 快速启用

### 方法 1: 使用中间件

```typescript
import { IFCSecurityMiddleware } from 'openclaw';

const ifc = new IFCSecurityMiddleware();
ifc.initialize("You are a secure assistant.");

// 处理用户输入
const action = ifc.processUserInput("Send email to John", "user123");

// 检查工具调用
const allowed = ifc.checkToolCall('message_send', { to: 'john@example.com' });
```

### 方法 2: 使用执行器

```typescript
import { createIFCExecutor, createLabel } from 'openclaw';

const executor = createIFCExecutor({
  enabled: true,
  throwOnViolation: true,
  debug: true,
});

// 注册工具
executor.registerTool({
  name: 'message_send',
  toolLabel: createLabel('T', ['user']),
  reads: [],
  writes: ['message'],
  isConsequential: true,
  isEgress: true,
});

// 包装工具
const safeSend = executor.wrapTool('message_send', originalSendFunction);
```

### 方法 3: Gateway 集成

```typescript
import { 
  createGatewayIFCExecutor, 
  createIFCToolMiddleware 
} from 'openclaw/security/ifc/gateway-integration.js';

const ifcExecutor = createGatewayIFCExecutor({ enabled: true });
const ifcMiddleware = createIFCToolMiddleware(ifcExecutor);

// 在工具执行前检查
async function handleToolInvoke(toolName: string, args: any) {
  const check = await ifcMiddleware.preExecute({ toolName, args });
  if (!check.allowed) {
    throw new Error(`IFC blocked: ${check.reason}`);
  }
  // 执行工具...
}
```

## 配置选项

### 环境变量

```bash
# .env 文件
IFC_ENABLED=true
IFC_DEBUG=true
IFC_THROW_ON_VIOLATION=true
```

### 代码配置

```typescript
{
  enabled: boolean;              // 是否启用 IFC
  debug: boolean;                // 调试日志
  throwOnViolation: boolean;     // 违规时抛出异常
  defaultIntegrity: 'T' | 'U';   // 默认完整性标签
  defaultReaders: string[];      // 默认读者集合
}
```

## 工具策略

默认已配置以下工具策略：

| 工具 | Integrity | Readers | Consequential | Egress |
|------|-----------|---------|---------------|--------|
| read | U | public | ❌ | ❌ |
| write | T | user | ✅ | ❌ |
| edit | T | user | ✅ | ❌ |
| exec | U | user | ✅ | ❌ |
| message | T | user | ✅ | ✅ |
| browser | T | user | ✅ | ✅ |
| web_search | U | public | ❌ | ✅ |
| memory_* | U | user | ❌ | ❌ |
| tts | T | user | ❌ | ✅ |
| cron | T | user | ✅ | ❌ |
| gateway | T | user | ✅ | ❌ |

## 策略类型说明

### P-T (Policy-Trusted)

**目的**: 防止不可信数据触发重要操作

**适用工具**: consequential tools
- 发送邮件
- 删除文件
- 创建日历事件
- 执行命令

**检查规则**: 
- 工具 integrity 必须是 'T'
- 所有参数 integrity 必须是 'T'

### P-F (Policy-Flow)

**目的**: 防止数据泄露给未授权读者

**适用工具**: egress tools
- 发送消息
- 分享文件
- 发布网页

**检查规则**:
- 参数的 readers 必须是工具允许 readers 的子集

## 测试 IFC

### 单元测试示例

```typescript
import { describe, it, expect } from 'vitest';
import { createIFCExecutor, createLabel } from 'openclaw';

describe('IFC', () => {
  it('should allow trusted tool call', () => {
    const executor = createIFCExecutor({ enabled: true });
    
    executor.registerTool({
      name: 'test_tool',
      toolLabel: createLabel('T', ['user']),
      reads: [],
      writes: [],
      isConsequential: true,
      isEgress: false,
    });
    
    const result = executor.checkToolCall('test_tool', { data: 'test' });
    expect(result.allowed).toBe(true);
  });
  
  it('should block untrusted tool call', () => {
    const executor = createIFCExecutor({ enabled: true });
    
    // Tool with untrusted integrity
    executor.registerTool({
      name: 'untrusted_tool',
      toolLabel: createLabel('U', ['user']),
      reads: [],
      writes: [],
      isConsequential: true,
      isEgress: false,
    });
    
    const result = executor.checkToolCall('untrusted_tool', { data: 'test' });
    expect(result.allowed).toBe(false);
    expect(result.policyType).toBe('P-T');
  });
});
```

## 调试技巧

### 1. 启用调试日志

```typescript
const executor = createIFCExecutor({ debug: true });
```

### 2. 查看变量存储

```typescript
const planner = new FidesPlanner({...});
console.log(planner.getVariableStoreDebugInfo());
```

### 3. 查看安全状态

```typescript
const status = executor.getStatus();
console.log(status);
```

### 4. 审计日志

```typescript
import { createIFCAuditLogger } from 'openclaw/security/ifc/gateway-integration.js';

const logger = createIFCAuditLogger({ logToFile: true });
```

## 性能考虑

IFC 会增加少量开销：

- **标签计算**: ~1-5ms/操作
- **策略检查**: ~0.1-1ms/工具调用
- **变量隐藏**: ~1-10ms/复杂对象

**优化建议**:
- 只对 consequential 工具启用 P-T 检查
- 只对 egress 工具启用 P-F 检查
- 生产环境关闭 debug 日志

## 常见问题

### Q: IFC 会影响现有功能吗？

A: 默认情况下 `enabled: false`，不会影响现有功能。启用后，只有违反策略的操作会被阻止。

### Q: 如何添加自定义工具策略？

A: 使用 `executor.registerTool()` 注册工具元数据。

### Q: 如何禁用特定工具的检查？

A: 设置 `isConsequential: false` 和 `isEgress: false`。

### Q: IFC 与现有安全机制冲突吗？

A: 不会。IFC 是额外的安全层，与现有的 audit、policy 等机制互补。

## 下一步

1. **测试**: 在开发环境启用 IFC，测试所有工具
2. **调优**: 根据测试结果调整工具策略
3. **部署**: 在生产环境启用 IFC
4. **监控**: 定期检查审计日志

## 参考资料

- FIDES 论文：arXiv:2505.23643v2
- AgentDojo: https://agentdojo.ethz.ch/
- OpenClaw 文档：/usr/lib/node_modules/openclaw/docs

## 支持

如有问题，请查看：
- `USAGE.md` - 详细使用指南
- `gateway-integration.ts` - Gateway 集成示例
- `examples/` - 示例代码
