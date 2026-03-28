/**
 * FIDES IFC Middleware for OpenClaw
 */
import {
  FidesPlanner,
  PolicyEngine,
  createAgentDojoPolicies,
  wrapToolWithIFC,
  createLabel,
  SecurityLabel,
  LabeledValue
} from '../security/ifc/core';

export class IFCSecurityMiddleware {
  private planner: FidesPlanner;
  private policyEngine: PolicyEngine;
  
  constructor() {
    this.policyEngine = createAgentDojoPolicies();
    this.planner = new FidesPlanner({
      policyEngine: this.policyEngine,
      queryLlmConfig: {
        model: 'gpt-4o-mini', // 可配置
        provider: 'openai',
        timeoutMs: 30000,
      },
      debug: process.env.NODE_ENV === 'development',
      throwOnViolation: true
    });
  }
  
  /**
   * 初始化IFC系统
   */
  initialize(systemPrompt: string = "You are a helpful assistant with built-in security controls."): void {
    this.planner.initialize(systemPrompt);
  }
  
  /**
   * 处理用户输入
   */
  processUserInput(userInput: string, userId: string = 'user') {
    return this.planner.handleUserInput(userInput, userId);
  }
  
  /**
   * 包装工具以支持IFC
   */
  wrapToolForIFC<TArgs extends Record<string, unknown>, TResult>(
    originalTool: {
      name: string;
      execute: (args: TArgs) => Promise<TResult>;
    }
  ) {
    return wrapToolWithIFC(originalTool);
  }
  
  /**
   * 检查工具调用是否符合安全策略
   */
  checkToolCall(toolName: string, args: any): boolean {
    const mockAction = {
      type: 'MakeCall' as const,
      tool: toolName,
      toolLabel: createLabel('T', ['user']), // 默认标签
      arguments: Object.fromEntries(
        Object.entries(args).map(([k, v]) => [
          k,
          { value: v, label: createLabel('T', ['user']) } // 默认标签
        ])
      )
    };
    
    const result = this.policyEngine.checkAction(mockAction);
    return result.allowed;
  }
  
  /**
   * 获取当前安全状态
   */
  getSecurityStatus() {
    return {
      contextLabel: this.planner.getState().contextLabel,
      variableCount: this.planner.getState().memory.size,
      policyViolations: 0 // 可以扩展以跟踪违规
    };
  }
}