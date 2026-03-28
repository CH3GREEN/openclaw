# IFC Integration Patch Guide

This document shows the exact changes needed to integrate IFC into OpenClaw.

## File 1: `src/agents/openclaw-tools.ts`

Add IFC imports and wrapping:

```typescript
// Add at top of file (after other imports)
import {
  wrapOpenClawToolWithIFC,
  createOpenClawPolicyEngine,
} from '../security/ifc/tool-wrapper.js';
import { resolveIFCConfig, isIFCEnforced } from '../config/types.ifc.js';

// Modify createOpenClawTools function
export function createOpenClawTools(options?: {...}): AnyAgentTool[] {
  const workspaceDir = resolveWorkspaceRoot(options?.workspaceDir);
  
  // ... existing tool creation code ...
  
  const tools: AnyAgentTool[] = [
    // ... existing tools ...
  ];
  
  // === ADD IFC WRAPPING HERE ===
  const ifcConfig = resolveIFCConfig(options?.config?.security?.ifc);
  
  if (ifcConfig.enabled) {
    const policyEngine = createOpenClawPolicyEngine();
    
    return tools.map((tool) => {
      const wrappedTool = wrapOpenClawToolWithIFC(tool, policyEngine);
      
      if (isIFCEnforced(ifcConfig)) {
        // In enforce mode, wrap execute to check IFC
        const originalExecute = tool.execute.bind(tool);
        
        return {
          ...wrappedTool,
          async execute(args: Record<string, unknown>) {
            try {
              const result = await wrappedTool.executeLabeled(
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
              return result.value;
            } catch (error) {
              if (ifcConfig.throwOnViolation) {
                throw error;
              }
              console.warn('[IFC Audit]', error instanceof Error ? error.message : String(error));
              return originalExecute(args);
            }
          },
        } as AnyAgentTool;
      }
      
      return wrappedTool;
    });
  }
  // =============================
  
  return tools;
}
```

## File 2: `src/gateway/server-chat.ts` (or main chat handler)

Add IFC session tracking:

```typescript
// Add import
import { IFCSecurityMiddleware } from '../security/ifc-middleware.js';
import { resolveIFCConfig } from '../config/types.ifc.js';

// In chat handler class/function
class ChatHandler {
  private ifc?: IFCSecurityMiddleware;
  
  constructor(private config: OpenClawConfig) {
    const ifcConfig = resolveIFCConfig(config.security?.ifc);
    
    if (ifcConfig.enabled) {
      this.ifc = new IFCSecurityMiddleware();
      this.ifc.initialize(config.agents?.defaults?.systemPrompt);
    }
  }
  
  async handleToolCall(toolName: string, args: Record<string, unknown>) {
    // === ADD IFC CHECK ===
    if (this.ifc) {
      const allowed = this.ifc.checkToolCall(toolName, args);
      
      if (!allowed) {
        throw new Error(`Tool call blocked by IFC policy`);
      }
    }
    // =====================
    
    // ... existing tool execution ...
  }
}
```

## File 3: `src/config/types.ts`

Export IFC types:

```typescript
// Add export
export * from './types.ifc.js';
```

## File 4: `src/config/schema.ts` or `src/config/zod-schema.ts`

Add IFC schema validation:

```typescript
import { z } from 'zod';

// Add IFC schema
const IFCConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(['enforce', 'audit', 'disabled']).default('audit'),
  throwOnViolation: z.boolean().default(true),
  debug: z.boolean().default(false),
  queryLlm: z.object({
    model: z.string().optional(),
    provider: z.string().optional(),
    timeoutMs: z.number().optional(),
  }).optional(),
  tools: z.record(z.object({
    integrity: z.enum(['T', 'U']).optional(),
    readers: z.array(z.string()).optional(),
    isConsequential: z.boolean().optional(),
    isEgress: z.boolean().optional(),
  })).optional(),
}).optional();

// Add to security config
const SecurityConfigSchema = z.object({
  ifc: IFCConfigSchema,
  // ... other security settings ...
}).optional();

// Add to main config schema
export const OpenClawConfigSchema = z.object({
  // ... existing fields ...
  security: SecurityConfigSchema,
});
```

## File 5: `src/security/index.ts`

Already created - exports all security modules.

## Configuration Example

Add to `config.json`:

```json
{
  "security": {
    "ifc": {
      "enabled": true,
      "mode": "enforce",
      "throwOnViolation": true,
      "debug": false,
      "queryLlm": {
        "model": "gpt-4o-mini",
        "provider": "openai",
        "timeoutMs": 30000
      }
    }
  }
}
```

## Testing

After making changes:

```bash
# Build to check for TypeScript errors
npm run build

# Run tests
npm test

# Test IFC specifically
npm test -- src/security/ifc/
```

## Rollback

To disable IFC without removing code:

```json
{
  "security": {
    "ifc": {
      "enabled": false
    }
  }
}
```

Or set environment variable:
```bash
OPENCLAW_IFC_DISABLED=1 openclaw start
```

## Next Steps

1. Review and adjust tool metadata in `tool-wrapper.ts`
2. Test with your specific tools
3. Add audit logging integration
4. Consider adding IFC status to `/status` command
