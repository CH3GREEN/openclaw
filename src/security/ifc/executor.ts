/**
 * IFC Tool Execution Integration
 * 
 * Integrates FIDES IFC system with OpenClaw's tool execution pipeline.
 * Provides policy enforcement for tool calls based on information flow labels.
 */

import {
  PolicyEngine,
  FidesPlanner,
  createAgentDojoPolicies,
  wrapToolWithIFC,
  getToolMetadata,
  createLabel,
  type SecurityLabel,
  type LabeledValue,
  type ToolMetadata,
  type MakeCallAction,
} from '../security/ifc/index.js';

export interface IFCConfig {
  /** Enable IFC enforcement (default: false for backward compatibility) */
  enabled: boolean;
  
  /** Throw on policy violation (default: true) */
  throwOnViolation: boolean;
  
  /** Enable debug logging */
  debug: boolean;
  
  /** Custom policy engine (optional) */
  policyEngine?: PolicyEngine;
  
  /** Default integrity label for tools (default: 'T') */
  defaultIntegrity: 'T' | 'U';
  
  /** Default readers for tools (default: ['user']) */
  defaultReaders: string[];
}

const DEFAULT_IFC_CONFIG: IFCConfig = {
  enabled: false,
  throwOnViolation: true,
  debug: false,
  defaultIntegrity: 'T',
  defaultReaders: ['user'],
};

export class IFCExecutor {
  private config: IFCConfig;
  private policyEngine: PolicyEngine;
  private planner?: FidesPlanner;
  private enabled: boolean;

  constructor(config: Partial<IFCConfig> = {}) {
    this.config = { ...DEFAULT_IFC_CONFIG, ...config };
    this.enabled = this.config.enabled;
    this.policyEngine = config.policyEngine ?? createAgentDojoPolicies();
    
    if (this.enabled) {
      this.planner = new FidesPlanner({
        policyEngine: this.policyEngine,
        queryLlmConfig: {
          model: 'gpt-4o-mini',
          provider: 'openai',
          timeoutMs: 30000,
        },
        debug: this.config.debug,
        throwOnViolation: this.config.throwOnViolation,
      });
    }
  }

  /**
   * Enable IFC enforcement
   */
  enable(): void {
    this.enabled = true;
    if (!this.planner) {
      this.planner = new FidesPlanner({
        policyEngine: this.policyEngine,
        queryLlmConfig: {
          model: 'gpt-4o-mini',
          provider: 'openai',
          timeoutMs: 30000,
        },
        debug: this.config.debug,
        throwOnViolation: this.config.throwOnViolation,
      });
    }
  }

  /**
   * Disable IFC enforcement
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if IFC is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Register tool metadata for IFC policy enforcement
   */
  registerTool(metadata: ToolMetadata): void {
    this.policyEngine.registerTool(metadata);
    if (this.config.debug) {
      console.log(`[IFC] Registered tool: ${metadata.name}`);
    }
  }

  /**
   * Get tool metadata
   */
  getToolMetadata(toolName: string): ToolMetadata {
    const metadata = this.policyEngine.getToolMetadata(toolName);
    if (metadata) {
      return metadata;
    }
    
    // Return default metadata if not registered
    return {
      name: toolName,
      toolLabel: createLabel(this.config.defaultIntegrity, this.config.defaultReaders),
      reads: [],
      writes: [],
      isConsequential: false,
      isEgress: false,
    };
  }

  /**
   * Check if a tool call is allowed by IFC policy
   */
  checkToolCall(toolName: string, args: Record<string, unknown>): {
    allowed: boolean;
    reason?: string;
    policyType: 'P-T' | 'P-F' | 'none';
  } {
    if (!this.enabled) {
      return { allowed: true, policyType: 'none' };
    }

    const metadata = this.getToolMetadata(toolName);
    
    // Create labeled arguments with default labels
    const labeledArgs: Record<string, LabeledValue> = {};
    for (const [key, value] of Object.entries(args)) {
      labeledArgs[key] = {
        value,
        label: createLabel(this.config.defaultIntegrity, this.config.defaultReaders),
      };
    }

    const action: MakeCallAction = {
      type: 'MakeCall',
      tool: toolName,
      toolLabel: metadata.toolLabel,
      arguments: labeledArgs,
    };

    return this.policyEngine.checkAction(action);
  }

  /**
   * Execute a tool with IFC enforcement
   */
  async executeWithIFC<TArgs extends Record<string, unknown>, TResult>(
    toolName: string,
    executeFn: (args: TArgs) => Promise<TResult>,
    args: TArgs,
  ): Promise<{
    success: boolean;
    result?: TResult;
    error?: string;
    policyViolation?: boolean;
  }> {
    // If IFC is disabled, execute directly
    if (!this.enabled) {
      try {
        const result = await executeFn(args);
        return { success: true, result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Check policy before execution
    const policyCheck = this.checkToolCall(toolName, args);
    
    if (!policyCheck.allowed) {
      if (this.config.throwOnViolation) {
        throw new Error(
          `IFC Policy violation: ${policyCheck.reason ?? 'Unknown policy violation'}`,
        );
      }
      
      return {
        success: false,
        policyViolation: true,
        error: policyCheck.reason ?? 'Policy violation',
      };
    }

    // Execute the tool
    try {
      const result = await executeFn(args);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Wrap a tool function with IFC enforcement
   */
  wrapTool<TArgs extends Record<string, unknown>, TResult>(
    toolName: string,
    executeFn: (args: TArgs) => Promise<TResult>,
  ): (args: TArgs) => Promise<TResult> {
    // Register tool with default metadata if not already registered
    if (!this.policyEngine.getToolMetadata(toolName)) {
      this.registerTool({
        name: toolName,
        toolLabel: createLabel(this.config.defaultIntegrity, this.config.defaultReaders),
        reads: [],
        writes: [],
        isConsequential: false,
        isEgress: false,
      });
    }

    return async (args: TArgs) => {
      const execution = await this.executeWithIFC(toolName, executeFn, args);
      
      if (!execution.success) {
        if (execution.policyViolation) {
          throw new Error(`IFC Policy blocked tool call: ${execution.error}`);
        }
        throw new Error(execution.error ?? 'Tool execution failed');
      }
      
      return execution.result!;
    };
  }

  /**
   * Get IFC status for debugging/monitoring
   */
  getStatus() {
    return {
      enabled: this.enabled,
      config: this.config,
      registeredTools: Array.from(
        this.policyEngine['toolMetadata'].keys(),
      ),
    };
  }
}

/**
 * Create IFC executor with default configuration
 */
export function createIFCExecutor(config?: Partial<IFCConfig>): IFCExecutor {
  return new IFCExecutor(config);
}

/**
 * Default IFC executor instance (lazy initialization)
 */
let defaultExecutor: IFCExecutor | undefined;

export function getDefaultIFCExecutor(): IFCExecutor {
  if (!defaultExecutor) {
    defaultExecutor = createIFCExecutor();
  }
  return defaultExecutor;
}

/**
 * Reset default executor (for testing)
 */
export function resetDefaultIFCExecutor(): void {
  defaultExecutor = undefined;
}
