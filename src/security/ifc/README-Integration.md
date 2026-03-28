# FIDES IFC Integration Guide for OpenClaw

This guide explains how to integrate the FIDES Information Flow Control (IFC) system into OpenClaw.

## Overview

FIDES provides:
- **Taint tracking**: Track information flow through agent conversations
- **Policy enforcement**: Block unauthorized information flows
- **Tool wrapping**: Add security checks to tool executions

## Quick Start

### 1. Enable IFC in Configuration

Add to your `config.json`:

```json
{
  "security": {
    "ifc": {
      "enabled": true,
      "mode": "enforce",  // "enforce" | "audit" | "disabled"
      "throwOnViolation": true,
      "debug": false
    }
  }
}
```

### 2. Use IFC Middleware

```typescript
import { IFCSecurityMiddleware } from './middleware/ifc-middleware.js';

// Create middleware instance
const ifc = new IFCSecurityMiddleware();

// Initialize with system prompt
ifc.initialize("You are a helpful assistant with built-in security controls.");

// Process user input
const action = ifc.processUserInput("Send an email to John", "user123");

// Check tool calls before execution
if (action.type === 'MakeCall') {
  const allowed = ifc.checkToolCall(action.tool, action.arguments);
  if (!allowed) {
    throw new Error("Tool call blocked by IFC policy");
  }
}
```

### 3. Wrap Tools with IFC

```typescript
import { wrapOpenClawToolWithIFC, createOpenClawPolicyEngine } from './security/ifc/tool-wrapper.js';

// Create policy engine
const policyEngine = createOpenClawPolicyEngine();

// Wrap existing tools
const wrappedExecTool = wrapOpenClawToolWithIFC(execTool, policyEngine);
const wrappedMessageTool = wrapOpenClawToolWithIFC(messageTool, policyEngine);

// Use wrapped tools - they automatically check IFC policies
const result = await wrappedExecTool.execute({ command: 'ls -la' });
```

## Architecture

### Security Labels

Every piece of data has a security label:

```typescript
interface SecurityLabel {
  integrity: 'T' | 'U';  // Trusted | Untrusted
  confidentiality: Set<string>;  // Readers allowed
}
```

### Label Rules

| Operation | Integrity | Confidentiality |
|-----------|-----------|-----------------|
| User input | T | {user, public} |
| System prompt | T | {public} |
| Web search | U | {public} |
| File read | U | {user} |
| Send message | T | {user} (egress) |
| Exec command | T | {user} (consequential) |

### Policy Types

- **P-T (Trusted Action)**: Consequential tools require trusted inputs
- **P-F (Permitted Flow)**: Egress tools check data flow permissions

## Integration Points

### 1. Tool Creation (`src/agents/openclaw-tools.ts`)

Wrap tools when creating them:

```typescript
import { wrapOpenClawToolWithIFC } from '../security/ifc/tool-wrapper.js';

const execTool = createExecTool({...});
const ifcExecTool = wrapOpenClawToolWithIFC(execTool, policyEngine);
```

### 2. Session Handler (`src/gateway/server-chat.ts`)

Add IFC checks before tool execution:

```typescript
import { IFCSecurityMiddleware } from '../security/ifc-middleware.js';

const ifc = new IFCSecurityMiddleware();

// In tool execution handler
if (config.security?.ifc?.enabled) {
  const check = ifc.checkToolCall(toolName, args);
  if (!check.allowed) {
    throw new Error(`IFC blocked: ${check.reason}`);
  }
}
```

### 3. Agent Loop (`src/agents/agent-loop.ts`)

Track information flow through conversation:

```typescript
import { FidesPlanner, createOpenClawPolicyEngine } from '../security/ifc/core.js';

const planner = new FidesPlanner({
  policyEngine: createOpenClawPolicyEngine(),
  queryLlmConfig: { model: 'gpt-4o', provider: 'openai', timeoutMs: 30000 },
  throwOnViolation: true,
});

// Process each turn
planner.handleUserInput(userMessage);
// ... LLM response
planner.handleLLMResponse(content, toolCalls);
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | false | Enable IFC system |
| `mode` | string | "audit" | "enforce" | "audit" | "disabled" |
| `throwOnViolation` | boolean | true | Throw error on policy violation |
| `debug` | boolean | false | Enable debug logging |
| `model` | string | "gpt-4o-mini" | Model for query LLM |

## Testing

```bash
# Run IFC tests
npm test -- src/security/ifc/core.test.ts

# Test tool wrapping
npm test -- src/security/ifc/tool-wrapper.test.ts
```

## Examples

See `src/security/ifc/examples/` for complete usage examples.

## Troubleshooting

### Tool calls blocked unexpectedly

Check the tool's IFC metadata in `tool-wrapper.ts`. You may need to adjust the label or policy.

### Performance concerns

IFC adds minimal overhead (<5ms per tool call). Enable `debug: true` to profile.

### False positives

Run in `mode: "audit"` first to identify issues without blocking.

## References

- FIDES Paper: arXiv:2505.23643v2
- Core implementation: `src/security/ifc/core.ts`
- Tool wrapper: `src/security/ifc/tool-wrapper.ts`
- Middleware: `src/middleware/ifc-middleware.ts`
