/**
 * IFC Tool Wrapper for OpenClaw
 * 
 * Wraps OpenClaw tools with Information Flow Control checks
 * based on the FIDES algorithm (arXiv:2505.23643v2)
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
  type SecurityLabel,
  type MakeCallAction,
  type ToolMetadata,
  PolicyEngine,
  checkCombinedPolicy,
  createLabel,
  joinLabels,
  type LabeledValue,
  PolicyViolationError,
} from './core.js';

/**
 * IFC-enhanced tool wrapper
 */
export interface IFCToolWrapper<TArgs extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> 
  extends AgentTool<TArgs, TResult> {
  /** IFC metadata for this tool */
  ifcMetadata: ToolMetadata;
  /** Execute with IFC label tracking */
  executeLabeled: (args: Record<string, LabeledValue>) => Promise<{ value: TResult; label: SecurityLabel }>;
}

/**
 * Default tool metadata rules for OpenClaw tools
 */
export const OPENCLAW_TOOL_IFC_RULES: Record<string, Partial<ToolMetadata>> = {
  // Read operations - untrusted, public
  'read': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: false,
  },
  
  'web_search': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: false,
  },
  
  'web_fetch': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: false,
  },
  
  'image': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: false,
  },
  
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
  
  // Write operations - trusted, user
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
  
  'exec': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // Communication - trusted, egress
  'message': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: true,
  },
  
  'sessions_send': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: true,
  },
  
  'sessions_spawn': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // Browser - trusted, can be egress
  'browser': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: true,
  },
  
  // Canvas - trusted
  'canvas': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // Cron - trusted
  'cron': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // Gateway - trusted
  'gateway': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // Nodes - trusted
  'nodes': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  // TTS - trusted, egress (produces media)
  'tts': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: true,
  },
  
  // Default - conservative
  'default': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: false,
  },
};

/**
 * Get IFC metadata for a tool
 */
export function getOpenClawToolMetadata(toolName: string): ToolMetadata {
  const rules = OPENCLAW_TOOL_IFC_RULES[toolName] ?? OPENCLAW_TOOL_IFC_RULES['default'];
  
  return {
    name: toolName,
    toolLabel: rules.toolLabel ?? OPENCLAW_TOOL_IFC_RULES['default'].toolLabel!,
    reads: rules.reads ?? [],
    writes: rules.writes ?? [],
    isConsequential: rules.isConsequential ?? false,
    isEgress: rules.isEgress ?? false,
  };
}

/**
 * Wrap an OpenClaw tool with IFC checks
 */
export function wrapOpenClawToolWithIFC<TArgs extends Record<string, unknown>, TResult>(
  tool: AgentTool<TArgs, TResult>,
  policyEngine?: PolicyEngine,
): IFCToolWrapper<TArgs, TResult> {
  const metadata = getOpenClawToolMetadata(tool.name);
  
  return {
    ...tool,
    ifcMetadata: metadata,
    
    async executeLabeled(
      args: Record<string, LabeledValue>,
    ): Promise<{ value: TResult; label: SecurityLabel }> {
      // Collect argument labels
      const argLabels: SecurityLabel[] = [];
      const expandedArgs: Record<string, unknown> = {};
      
      for (const [key, labeledVal] of Object.entries(args)) {
        expandedArgs[key] = labeledVal.value;
        argLabels.push(labeledVal.label);
      }
      
      // Check policy if engine provided
      if (policyEngine) {
        const action: MakeCallAction = {
          type: 'MakeCall',
          tool: tool.name,
          toolLabel: metadata.toolLabel,
          arguments: args,
        };
        
        const policyResult = policyEngine.checkAction(action);
        if (!policyResult.allowed) {
          throw new PolicyViolationError(
            `IFC policy violation: ${policyResult.reason}`,
            action,
            policyResult.policyType,
          );
        }
      }
      
      // Execute the tool
      const result = await tool.execute(expandedArgs as TArgs);
      
      // Compute result label (join of tool label and all argument labels)
      const resultLabel = argLabels.reduce(
        (acc, label) => joinLabels(acc, label),
        metadata.toolLabel,
      );
      
      return {
        value: result,
        label: resultLabel,
      };
    },
  };
}

/**
 * Create a policy engine with OpenClaw-specific tool policies
 */
export function createOpenClawPolicyEngine(): PolicyEngine {
  const engine = new PolicyEngine();
  
  // Register all known OpenClaw tools
  for (const [toolName, rules] of Object.entries(OPENCLAW_TOOL_IFC_RULES)) {
    if (toolName !== 'default') {
      engine.registerTool({
        name: toolName,
        toolLabel: rules.toolLabel ?? createLabel('U', ['public']),
        reads: rules.reads ?? [],
        writes: rules.writes ?? [],
        isConsequential: rules.isConsequential ?? false,
        isEgress: rules.isEgress ?? false,
      });
    }
  }
  
  return engine;
}

/**
 * Check if a tool call is allowed by IFC policy
 */
export function checkIFCToolCall(
  toolName: string,
  args: Record<string, unknown>,
  contextLabel?: SecurityLabel,
): { allowed: boolean; reason?: string } {
  const metadata = getOpenClawToolMetadata(toolName);
  const label = contextLabel ?? createLabel('T', ['user']);
  
  const labeledArgs: Record<string, LabeledValue> = Object.fromEntries(
    Object.entries(args).map(([k, v]) => [
      k,
      { value: v, label },
    ]),
  );
  
  const action: MakeCallAction = {
    type: 'MakeCall',
    tool: toolName,
    toolLabel: label,
    arguments: labeledArgs,
  };
  
  const result = checkCombinedPolicy(action, metadata);
  
  return {
    allowed: result.allowed,
    reason: result.reason,
  };
}
