/**
 * IFC Gateway Integration Example
 * 
 * This file demonstrates how to integrate FIDES IFC into OpenClaw's Gateway server.
 * Copy and adapt the patterns to your actual server implementation.
 */

import {
  createIFCExecutor,
  createAgentDojoPolicies,
  createLabel,
  getToolMetadata,
  type IFCConfig,
  type ToolMetadata,
} from './index.js';

/**
 * IFC Gateway Configuration
 * 
 * Add these to your config file or environment:
 * 
 * Environment variables:
 * - IFC_ENABLED=true|false
 * - IFC_DEBUG=true|false
 * - IFC_THROW_ON_VIOLATION=true|false
 */
export interface IFCGatewayConfig {
  enabled: boolean;
  debug: boolean;
  throwOnViolation: boolean;
  toolPolicies?: Record<string, Partial<ToolMetadata>>;
}

/**
 * Default tool policies for common OpenClaw tools
 */
export const DEFAULT_TOOL_POLICIES: Record<string, Partial<ToolMetadata>> = {
  // Messaging tools (consequential + egress)
  'message_send': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: true,
  },
  'message_broadcast': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: true,
  },
  
  // File operations (consequential)
  'read': {
    toolLabel: createLabel('U', ['user']),
    isConsequential: false,
    isEgress: false,
  },
  'write': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  'edit': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // Execution tools (consequential + potentially egress)
  'exec': {
    toolLabel: createLabel('U', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  'process': {
    toolLabel: createLabel('U', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // Browser tools (potentially egress)
  'browser': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: true,
  },
  
  // Web tools (egress)
  'web_search': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: true,
  },
  'web_fetch': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: true,
  },
  
  // Session management
  'sessions_send': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  'sessions_spawn': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // Memory tools (non-consequential)
  'memory_search': {
    toolLabel: createLabel('U', ['user']),
    isConsequential: false,
    isEgress: false,
  },
  'memory_get': {
    toolLabel: createLabel('U', ['user']),
    isConsequential: false,
    isEgress: false,
  },
  
  // TTS (egress)
  'tts': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: false,
    isEgress: true,
  },
  
  // Cron (consequential)
  'cron': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // Gateway operations (consequential)
  'gateway': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
};

/**
 * Create IFC executor for Gateway
 */
export function createGatewayIFCExecutor(config?: Partial<IFCGatewayConfig>) {
  const ifcConfig: IFCConfig = {
    enabled: config?.enabled ?? process.env.IFC_ENABLED === 'true',
    debug: config?.debug ?? process.env.IFC_DEBUG === 'true',
    throwOnViolation: config?.throwOnViolation ?? process.env.IFC_THROW_ON_VIOLATION === 'true',
    defaultIntegrity: 'T',
    defaultReaders: ['user'],
  };

  const executor = createIFCExecutor(ifcConfig);

  // Register default tool policies
  const policies = config?.toolPolicies ?? DEFAULT_TOOL_POLICIES;
  for (const [toolName, metadata] of Object.entries(policies)) {
    const baseMetadata = getToolMetadata(toolName);
    executor.registerTool({
      ...baseMetadata,
      ...metadata,
    });
  }

  return executor;
}

/**
 * Middleware function to wrap tool execution with IFC checks
 * 
 * Usage in your server:
 * 
 * ```typescript
 * const ifcExecutor = createGatewayIFCExecutor();
 * 
 * // In your tool execution handler:
 * async function handleToolInvoke(toolName: string, args: any) {
 *   // Check IFC policy
 *   const policyResult = ifcExecutor.checkToolCall(toolName, args);
 *   if (!policyResult.allowed) {
 *     return {
 *       success: false,
 *       error: `IFC Policy violation: ${policyResult.reason}`,
 *       policyType: policyResult.policyType,
 *     };
 *   }
 *   
 *   // Execute tool...
 * }
 * ```
 */
export function createIFCToolMiddleware(executor: ReturnType<typeof createGatewayIFCExecutor>) {
  return {
    /**
     * Check tool call before execution
     */
    async preExecute(params: {
      toolName: string;
      args: Record<string, unknown>;
      sessionKey?: string;
    }): Promise<{ allowed: boolean; reason?: string }> {
      const result = executor.checkToolCall(params.toolName, params.args);
      
      if (executor['config'].debug) {
        console.log('[IFC Middleware]', {
          tool: params.toolName,
          allowed: result.allowed,
          reason: result.reason,
          policyType: result.policyType,
        });
      }
      
      return {
        allowed: result.allowed,
        reason: result.reason,
      };
    },

    /**
     * Log tool execution result (optional post-processing)
     */
    async postExecute(params: {
      toolName: string;
      args: Record<string, unknown>;
      result: unknown;
      error?: Error;
    }): Promise<void> {
      if (executor['config'].debug) {
        console.log('[IFC Middleware] Tool executed:', {
          tool: params.toolName,
          success: !params.error,
          error: params.error?.message,
        });
      }
    },
  };
}

/**
 * Example: Integrate with Express-like HTTP handler
 * 
 * ```typescript
 * import { createGatewayIFCExecutor, createIFCToolMiddleware } from './security/ifc/gateway-integration.js';
 * 
 * const ifcExecutor = createGatewayIFCExecutor({ enabled: true });
 * const ifcMiddleware = createIFCToolMiddleware(ifcExecutor);
 * 
 * app.post('/tools/invoke', async (req, res) => {
 *   const { tool, args, sessionKey } = req.body;
 *   
 *   // IFC check
 *   const check = await ifcMiddleware.preExecute({ toolName: tool, args, sessionKey });
 *   if (!check.allowed) {
 *     return res.status(403).json({
 *       error: check.reason,
 *       policyViolation: true,
 *     });
 *   }
 *   
 *   // Execute tool...
 * });
 * ```
 */

/**
 * Example: Integrate with tool execution pipeline
 */
export async function executeToolWithIFC<T = unknown>(params: {
  executor: ReturnType<typeof createGatewayIFCExecutor>;
  toolName: string;
  executeFn: () => Promise<T>;
  args: Record<string, unknown>;
  sessionKey?: string;
}): Promise<{ success: boolean; result?: T; error?: string }> {
  const { executor, toolName, executeFn, args } = params;

  // Pre-execution IFC check
  const policyResult = executor.checkToolCall(toolName, args);
  
  if (!policyResult.allowed) {
    if (executor['config'].throwOnViolation) {
      throw new Error(`IFC Policy violation: ${policyResult.reason}`);
    }
    
    return {
      success: false,
      error: `Policy blocked: ${policyResult.reason}`,
    };
  }

  // Execute tool
  try {
    const result = await executeFn();
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Audit log for IFC decisions
 */
export interface IFCDecisionLog {
  timestamp: string;
  toolName: string;
  sessionKey?: string;
  allowed: boolean;
  reason?: string;
  policyType: 'P-T' | 'P-F' | 'none';
  contextLabel?: {
    integrity: string;
    readers: string[];
  };
}

/**
 * Create IFC audit logger
 */
export function createIFCAuditLogger(options: {
  logToFile?: boolean;
  logPath?: string;
  logAllowed?: boolean; // Log allowed decisions (default: false, only log violations)
} = {}) {
  const logs: IFCDecisionLog[] = [];

  return {
    log(decision: IFCDecisionLog): void {
      // Always log violations
      if (!decision.allowed || options.logAllowed) {
        logs.push(decision);
        
        if (options.logToFile) {
          // Implement file logging as needed
          console.log('[IFC Audit]', JSON.stringify(decision));
        }
      }
    },

    getLogs(): IFCDecisionLog[] {
      return [...logs];
    },

    clearLogs(): void {
      logs.length = 0;
    },
  };
}
