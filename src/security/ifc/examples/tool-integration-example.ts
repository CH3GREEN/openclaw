/**
 * Example: Integrating IFC into OpenClaw Tool Creation
 * 
 * This example shows how to wrap OpenClaw tools with IFC checks.
 */

import type { AnyAgentTool } from '../../agents/tools/common.js';
import {
  wrapOpenClawToolWithIFC,
  createOpenClawPolicyEngine,
  type IFCToolWrapper,
} from '../tool-wrapper.js';
import { IFCSecurityMiddleware } from '../../middleware/ifc-middleware.js';
import type { OpenClawConfig } from '../../config/config.js';
import { resolveIFCConfig, isIFCEnforced } from '../../config/types.ifc.js';

/**
 * Example: Create tools with IFC wrapping
 */
export function createOpenClawToolsWithIFC(
  baseTools: AnyAgentTool[],
  config?: OpenClawConfig,
): AnyAgentTool[] {
  const ifcConfig = resolveIFCConfig(config?.security?.ifc);
  
  // If IFC is disabled, return tools as-is
  if (!ifcConfig.enabled) {
    return baseTools;
  }
  
  // Create policy engine
  const policyEngine = createOpenClawPolicyEngine();
  
  // Wrap each tool with IFC
  const wrappedTools = baseTools.map((tool) => {
    // Wrap tool with IFC checks
    const wrappedTool = wrapOpenClawToolWithIFC(tool, policyEngine);
    
    // Override execute to add IFC checks
    const originalExecute = tool.execute.bind(tool);
    
    return {
      ...wrappedTool,
      
      async execute(args: Record<string, unknown>) {
        // In enforce mode, check policy before execution
        if (isIFCEnforced(ifcConfig)) {
          const checkResult = wrappedTool.executeLabeled(
            Object.fromEntries(
              Object.entries(args).map(([k, v]) => [
                k,
                {
                  value: v,
                  label: { integrity: 'T' as const, confidentiality: new Set(['user']) },
                },
              ])
            )
          );
          
          try {
            const result = await checkResult;
            return result.value;
          } catch (error) {
            // In enforce mode, throw on violation
            if (ifcConfig.throwOnViolation) {
              throw error;
            }
            // In audit mode, log but continue
            console.warn('[IFC Audit]', error instanceof Error ? error.message : String(error));
            return originalExecute(args);
          }
        }
        
        return originalExecute(args);
      },
    } as AnyAgentTool;
  });
  
  return wrappedTools;
}

/**
 * Example: Use IFC middleware in session handler
 */
export function createSessionHandlerWithIFC(config?: OpenClawConfig) {
  const ifcConfig = resolveIFCConfig(config?.security?.ifc);
  
  if (!ifcConfig.enabled) {
    return null;
  }
  
  const ifc = new IFCSecurityMiddleware();
  
  // Initialize with system prompt from config
  const systemPrompt = config?.agents?.defaults?.systemPrompt ?? 
                       "You are a helpful assistant with built-in security controls.";
  ifc.initialize(systemPrompt);
  
  return {
    /**
     * Process user message with IFC tracking
     */
    async processUserMessage(message: string, userId: string) {
      const action = ifc.processUserInput(message, userId);
      
      if (ifcConfig.debug) {
        console.log('[IFC] User action:', action.type);
        console.log('[IFC] Context label:', ifc.getSecurityStatus().contextLabel);
      }
      
      return action;
    },
    
    /**
     * Check tool call before execution
     */
    checkToolCall(toolName: string, args: Record<string, unknown>): boolean {
      const allowed = ifc.checkToolCall(toolName, args);
      
      if (ifcConfig.debug) {
        console.log('[IFC] Tool check:', toolName, allowed ? '✓' : '✗');
      }
      
      return allowed;
    },
    
    /**
     * Get current security status
     */
    getStatus() {
      return ifc.getSecurityStatus();
    },
  };
}

/**
 * Example: Integration in gateway server
 * 
 * Add this to src/gateway/server-chat.ts or similar
 */
export async function exampleGatewayIntegration() {
  // Load config
  const config: OpenClawConfig = {
    security: {
      ifc: {
        enabled: true,
        mode: 'enforce',
        throwOnViolation: true,
        debug: false,
      },
    },
  };
  
  // Create base tools (from openclaw-tools.ts)
  const baseTools: AnyAgentTool[] = []; // Would be created by createOpenClawTools()
  
  // Wrap with IFC
  const toolsWithIFC = createOpenClawToolsWithIFC(baseTools, config);
  
  // Create session handler
  const sessionHandler = createSessionHandlerWithIFC(config);
  
  // Example: Handle user message
  if (sessionHandler) {
    const userAction = await sessionHandler.processUserMessage(
      "Send an email to john@example.com",
      "user123"
    );
    
    console.log('Action:', userAction);
    console.log('Security Status:', sessionHandler.getStatus());
  }
  
  return { tools: toolsWithIFC, sessionHandler };
}

/**
 * Example: Usage in agent loop
 */
export async function exampleAgentLoop() {
  const config: OpenClawConfig = {
    security: {
      ifc: {
        enabled: true,
        mode: 'enforce',
      },
    },
  };
  
  const sessionHandler = createSessionHandlerWithIFC(config);
  
  if (!sessionHandler) {
    throw new Error("IFC not enabled");
  }
  
  // Simulate conversation
  const messages = [
    { role: 'user' as const, content: 'What is the weather?' },
    { role: 'assistant' as const, content: 'Let me check...' },
    { role: 'tool' as const, content: 'Sunny, 72°F', toolName: 'web_search' },
  ];
  
  for (const msg of messages) {
    if (msg.role === 'user') {
      const action = await sessionHandler.processUserMessage(msg.content, 'user123');
      console.log('User action:', action);
    } else if (msg.role === 'tool') {
      // Track tool result
      const allowed = sessionHandler.checkToolCall(msg.toolName!, {});
      console.log(`Tool ${msg.toolName} allowed:`, allowed);
    }
  }
  
  console.log('Final security status:', sessionHandler.getStatus());
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running IFC integration examples...\n');
  
  exampleGatewayIntegration()
    .then(() => exampleAgentLoop())
    .then(() => console.log('\n✓ Examples completed'))
    .catch(console.error);
}
