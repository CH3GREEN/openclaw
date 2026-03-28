/**
 * FIDES IFC Basic Usage Example
 * 
 * This example demonstrates how to use the FIDES IFC system
 * to secure tool execution in OpenClaw.
 */

import {
  createIFCExecutor,
  createLabel,
  PolicyEngine,
  createAgentDojoPolicies,
  type SecurityLabel,
  type LabeledValue,
} from '../index.js';

// ============================================================================
// Example 1: Basic IFC Setup
// ============================================================================

function example1_BasicSetup() {
  console.log('\n=== Example 1: Basic IFC Setup ===\n');

  // Create IFC executor with default configuration
  const executor = createIFCExecutor({
    enabled: true,
    debug: true,
    throwOnViolation: false, // Don't throw, just return error
  });

  // Check if IFC is enabled
  console.log('IFC enabled:', executor.isEnabled());

  // Get status
  const status = executor.getStatus();
  console.log('Status:', status);
}

// ============================================================================
// Example 2: Registering Tools with Policies
// ============================================================================

function example2_ToolRegistration() {
  console.log('\n=== Example 2: Tool Registration ===\n');

  const executor = createIFCExecutor({ enabled: true });

  // Register a consequential tool (requires trusted data)
  executor.registerTool({
    name: 'send_email',
    toolLabel: createLabel('T', ['user']),
    reads: [],
    writes: ['email'],
    isConsequential: true, // Enable P-T check
    isEgress: true,        // Enable P-F check
  });

  // Register a read-only tool (no checks needed)
  executor.registerTool({
    name: 'read_file',
    toolLabel: createLabel('U', ['user']),
    reads: ['file'],
    writes: [],
    isConsequential: false,
    isEgress: false,
  });

  // Register an external data tool
  executor.registerTool({
    name: 'web_search',
    toolLabel: createLabel('U', ['public']),
    reads: [],
    writes: [],
    isConsequential: false,
    isEgress: true,
  });

  console.log('Registered tools:', executor.getStatus().registeredTools);
}

// ============================================================================
// Example 3: Policy Checking
// ============================================================================

function example3_PolicyChecking() {
  console.log('\n=== Example 3: Policy Checking ===\n');

  const executor = createIFCExecutor({ 
    enabled: true,
    throwOnViolation: false,
  });

  // Register tool
  executor.registerTool({
    name: 'send_message',
    toolLabel: createLabel('T', ['user']),
    reads: [],
    writes: ['message'],
    isConsequential: true,
    isEgress: true,
  });

  // Check allowed tool call
  const result1 = executor.checkToolCall('send_message', {
    to: 'user@example.com',
    body: 'Hello!',
  });

  console.log('Allowed call:', {
    allowed: result1.allowed,
    reason: result1.reason,
    policyType: result1.policyType,
  });

  // The check would fail if we had untrusted data
  // (This is just illustrative - actual failure depends on context)
}

// ============================================================================
// Example 4: Tool Wrapping
// ============================================================================

async function example4_ToolWrapping() {
  console.log('\n=== Example 4: Tool Wrapping ===\n');

  const executor = createIFCExecutor({ 
    enabled: true,
    throwOnViolation: true,
  });

  // Register tool
  executor.registerTool({
    name: 'safe_write',
    toolLabel: createLabel('T', ['user']),
    reads: [],
    writes: ['file'],
    isConsequential: true,
    isEgress: false,
  });

  // Original tool function
  const originalWrite = async (args: { path: string; content: string }) => {
    console.log(`Writing to ${args.path}: ${args.content}`);
    return { success: true };
  };

  // Wrap with IFC
  const safeWrite = executor.wrapTool('safe_write', originalWrite);

  try {
    // Execute wrapped tool
    const result = await safeWrite({
      path: '/tmp/test.txt',
      content: 'Hello, World!',
    });
    console.log('Tool result:', result);
  } catch (error) {
    console.log('Tool blocked:', error instanceof Error ? error.message : error);
  }
}

// ============================================================================
// Example 5: Advanced - Manual Label Management
// ============================================================================

function example5_ManualLabels() {
  console.log('\n=== Example 5: Manual Label Management ===\n');

  // Create custom labels
  const userPrivate = createLabel('T', ['user', 'admin']);
  const publicData = createLabel('T', ['public']);
  const externalUntrusted = createLabel('U', ['user']);

  console.log('User private label:', {
    integrity: userPrivate.integrity,
    readers: Array.from(userPrivate.confidentiality),
  });

  console.log('Public data label:', {
    integrity: publicData.integrity,
    readers: Array.from(publicData.confidentiality),
  });

  console.log('External untrusted label:', {
    integrity: externalUntrusted.integrity,
    readers: Array.from(externalUntrusted.confidentiality),
  });
}

// ============================================================================
// Example 6: Using the Middleware
// ============================================================================

async function example6_Middleware() {
  console.log('\n=== Example 6: Using IFC Middleware ===\n');

  const { IFCSecurityMiddleware } = await import('../../middleware/ifc-middleware.js');

  const ifc = new IFCSecurityMiddleware();

  // Initialize with system prompt
  ifc.initialize("You are a helpful assistant with security controls.");

  // Process user input
  const action = ifc.processUserInput("Send an email to John", "user123");
  console.log('Action:', action);

  // Check tool call
  const allowed = ifc.checkToolCall('message_send', {
    to: 'john@example.com',
    message: 'Hello!',
  });
  console.log('Tool call allowed:', allowed);

  // Get security status
  const status = ifc.getSecurityStatus();
  console.log('Security status:', status);
}

// ============================================================================
// Example 7: Gateway Integration
// ============================================================================

async function example7_GatewayIntegration() {
  console.log('\n=== Example 7: Gateway Integration ===\n');

  const { 
    createGatewayIFCExecutor,
    createIFCToolMiddleware,
  } = await import('./gateway-integration.js');

  // Create executor with gateway defaults
  const executor = createGatewayIFCExecutor({
    enabled: true,
    debug: true,
  });

  // Create middleware
  const middleware = createIFCToolMiddleware(executor);

  // Simulate tool invocation
  const toolName = 'message_send';
  const args = {
    to: 'user@example.com',
    message: 'Hello from Gateway!',
  };

  // Pre-execution check
  const check = await middleware.preExecute({ toolName, args });
  console.log('Pre-execution check:', check);

  if (check.allowed) {
    console.log('Tool execution allowed');
    // Execute tool...
  } else {
    console.log('Tool execution blocked:', check.reason);
  }
}

// ============================================================================
// Main - Run All Examples
// ============================================================================

async function runAllExamples() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   FIDES IFC Usage Examples            ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    example1_BasicSetup();
    example2_ToolRegistration();
    example3_PolicyChecking();
    await example4_ToolWrapping();
    example5_ManualLabels();
    await example6_Middleware();
    await example7_GatewayIntegration();

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   All examples completed!             ║');
    console.log('╚════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run if this file is executed directly
if (process.argv[1]?.endsWith('basic-usage.ts')) {
  runAllExamples();
}

export {
  example1_BasicSetup,
  example2_ToolRegistration,
  example3_PolicyChecking,
  example4_ToolWrapping,
  example5_ManualLabels,
  example6_Middleware,
  example7_GatewayIntegration,
  runAllExamples,
};
