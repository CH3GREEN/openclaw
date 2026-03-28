/**
 * FIDES IFC (Information Flow Control) System
 * Implements the algorithm from paper arXiv:2505.23643v2
 */

// Type definitions
export type IntegrityLabel = 'T' | 'U';
export type ConfidentialityLabel = Set<string>;

export interface SecurityLabel {
  integrity: IntegrityLabel;
  confidentiality: ConfidentialityLabel;
}

export const BOTTOM_LABEL: SecurityLabel = {
  integrity: 'T',
  confidentiality: new Set(['public']),
};

export const TOP_LABEL: SecurityLabel = {
  integrity: 'U',
  confidentiality: new Set([]),
};

export interface LabeledValue<T = unknown> {
  value: T;
  label: SecurityLabel;
  typeLabel?: 'bool' | 'enum' | 'string' | 'number';
  variableName?: string;
}

export type VariableStore = Map<string, LabeledValue>;

export interface PlannerState {
  history: LabeledMessage[];
  contextLabel: SecurityLabel;
  memory: VariableStore;
}

export interface LabeledMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | LabeledValue[];
  label: SecurityLabel;
  toolCalls?: LabeledToolCall[];
  toolCallId?: string;
}

export interface LabeledToolCall {
  id: string;
  name: string;
  arguments: Record<string, LabeledValue>;
  label: SecurityLabel;
}

export type Action = 
  | QueryAction 
  | MakeCallAction 
  | FinishAction;

export interface QueryAction {
  type: 'Query';
  history: LabeledMessage[];
}

export interface MakeCallAction {
  type: 'MakeCall';
  tool: string;
  toolLabel: SecurityLabel;
  arguments: Record<string, LabeledValue>;
}

export interface FinishAction {
  type: 'Finish';
  response: string;
  label: SecurityLabel;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  policyType: 'P-T' | 'P-F' | 'none';
}

export interface ToolMetadata {
  name: string;
  toolLabel: SecurityLabel;
  reads: string[];
  writes: string[];
  isConsequential: boolean;
  isEgress: boolean;
}

export interface ToolExecutionResult {
  value: unknown;
  label: SecurityLabel;
  createdVariable?: string;
}

export class PolicyViolationError extends Error {
  constructor(
    message: string,
    public action: MakeCallAction,
    public policyType: 'P-T' | 'P-F',
  ) {
    super(message);
    this.name = 'PolicyViolationError';
  }
}

// Lattice operations
export function integrityFlowsTo(a: IntegrityLabel, b: IntegrityLabel): boolean {
  return a === 'T' || b === 'U';
}

export function joinIntegrity(a: IntegrityLabel, b: IntegrityLabel): IntegrityLabel {
  return (a === 'U' || b === 'U') ? 'U' : 'T';
}

export function confidentialityFlowsTo(
  a: ConfidentialityLabel,
  b: ConfidentialityLabel,
): boolean {
  for (const reader of b) {
    if (!a.has(reader)) {
      return false;
    }
  }
  return true;
}

export function joinConfidentiality(
  a: ConfidentialityLabel,
  b: ConfidentialityLabel,
): ConfidentialityLabel {
  const result = new Set<string>();
  for (const reader of a) {
    if (b.has(reader)) {
      result.add(reader);
    }
  }
  return result;
}

export function flowsTo(l1: SecurityLabel, l2: SecurityLabel): boolean {
  return (
    integrityFlowsTo(l1.integrity, l2.integrity) &&
    confidentialityFlowsTo(l1.confidentiality, l2.confidentiality)
  );
}

export function joinLabels(l1: SecurityLabel, l2: SecurityLabel): SecurityLabel {
  return {
    integrity: joinIntegrity(l1.integrity, l2.integrity),
    confidentiality: joinConfidentiality(l1.confidentiality, l2.confidentiality),
  };
}

export function joinAllLabels(labels: SecurityLabel[]): SecurityLabel {
  if (labels.length === 0) {
    return { integrity: 'T', confidentiality: new Set(['public']) };
  }
  return labels.reduce((acc, label) => joinLabels(acc, label));
}

export function createLabel(
  integrity: IntegrityLabel,
  readers: string[],
): SecurityLabel {
  return {
    integrity,
    confidentiality: new Set(readers),
  };
}

// Variable store management
let variableCounter = 0;

export function freshVariable(prefix = 'var'): string {
  variableCounter += 1;
  return `#${prefix}-${variableCounter}#`;
}

export function resetVariableCounter(): void {
  variableCounter = 0;
}

export function hideValue<T>(
  value: LabeledValue<T>,
  contextLabel: SecurityLabel,
  memory: VariableStore,
): { type: 'variable'; name: string } | { type: 'value'; value: LabeledValue<T> } {
  
  const needsHiding = !flowsTo(value.label, contextLabel);
  
  if (needsHiding) {
    const varName = freshVariable('hidden');
    memory.set(varName, value);
    return { type: 'variable', name: varName };
  }
  
  return { type: 'value', value };
}

export function hideObject(
  obj: Record<string, unknown>,
  objLabel: SecurityLabel,
  contextLabel: SecurityLabel,
  memory: VariableStore,
  path = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, val] of Object.entries(obj)) {
    const fieldPath = path ? `${path}.${key}` : key;
    
    const fieldLabel: SecurityLabel = {
      integrity: objLabel.integrity,
      confidentiality: objLabel.confidentiality,
    };
    
    const labeledValue: LabeledValue = {
      value: val,
      label: fieldLabel,
    };
    
    const hidden = hideValue(labeledValue, contextLabel, memory);
    
    if (hidden.type === 'variable') {
      const detailedVarName = freshVariable(fieldPath.replace(/\./g, '-'));
      memory.set(detailedVarName, labeledValue);
      result[key] = detailedVarName;
    } else {
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = hideObject(
          val as Record<string, unknown>, 
          fieldLabel, 
          contextLabel, 
          memory,
          fieldPath
        );
      } else if (Array.isArray(val)) {
        result[key] = val.map((item, idx) => {
          if (item !== null && typeof item === 'object') {
            return hideObject(
              item as Record<string, unknown>,
              fieldLabel,
              contextLabel,
              memory,
              `${fieldPath}[${idx}]`
            );
          }
          return item;
        });
      } else {
        result[key] = val;
      }
    }
  }
  
  return result;
}

export function expandVariables(
  args: Record<string, LabeledValue>,
  memory: VariableStore,
): Record<string, LabeledValue> {
  const result: Record<string, LabeledValue> = {};
  
  for (const [key, val] of Object.entries(args)) {
    if (
      typeof val.value === 'string' && 
      val.value.startsWith('#') && 
      val.value.endsWith('#') &&
      memory.has(val.value)
    ) {
      const storedValue = memory.get(val.value)!;
      result[key] = storedValue;
    } else {
      result[key] = val;
    }
  }
  
  return result;
}

export function inspectVariable(
  varName: string,
  memory: VariableStore,
): LabeledValue | undefined {
  return memory.get(varName);
}

export function createVariableStore(): VariableStore {
  return new Map();
}

// Policy engine
export function checkTrustedAction(action: MakeCallAction): PolicyResult {
  if (action.toolLabel.integrity !== 'T') {
    return {
      allowed: false,
      reason: `Tool call has untrusted integrity label: ${action.toolLabel.integrity}`,
      policyType: 'P-T',
    };
  }
  
  for (const [argName, argValue] of Object.entries(action.arguments)) {
    if (argValue.label.integrity !== 'T') {
      return {
        allowed: false,
        reason: `Argument "${argName}" has untrusted integrity label: ${argValue.label.integrity}`,
        policyType: 'P-T',
      };
    }
  }
  
  return {
    allowed: true,
    policyType: 'P-T',
  };
}

export function checkPermittedFlow(
  action: MakeCallAction,
  toolMetadata: ToolMetadata,
): PolicyResult {
  const allowedReaders = toolMetadata.toolLabel.confidentiality;
  
  for (const [argName, argValue] of Object.entries(action.arguments)) {
    const argReaders = argValue.label.confidentiality;
    
    for (const reader of argReaders) {
      if (!allowedReaders.has(reader)) {
        return {
          allowed: false,
          reason: `Argument "${argName}" contains unauthorized reader: ${reader}`,
          policyType: 'P-F',
        };
      }
    }
  }
  
  return {
    allowed: true,
    policyType: 'P-F',
  };
}

export function checkCombinedPolicy(
  action: MakeCallAction,
  toolMetadata: ToolMetadata,
): PolicyResult {
  if (toolMetadata.isConsequential) {
    const ptResult = checkTrustedAction(action);
    if (!ptResult.allowed) {
      return ptResult;
    }
  }
  
  if (toolMetadata.isEgress) {
    const pfResult = checkPermittedFlow(action, toolMetadata);
    if (!pfResult.allowed) {
      return pfResult;
    }
  }
  
  return {
    allowed: true,
    policyType: toolMetadata.isConsequential ? 'P-T' : 
                toolMetadata.isEgress ? 'P-F' : 'none',
  };
}

export class PolicyEngine {
  private toolMetadata: Map<string, ToolMetadata> = new Map();
  
  registerTool(metadata: ToolMetadata): void {
    this.toolMetadata.set(metadata.name, metadata);
  }
  
  checkAction(action: MakeCallAction): PolicyResult {
    const metadata = this.toolMetadata.get(action.tool);
    if (!metadata) {
      return {
        allowed: false,
        reason: `Unknown tool: ${action.tool}`,
        policyType: 'none',
      };
    }
    
    return checkCombinedPolicy(action, metadata);
  }
  
  enforceAction(action: MakeCallAction): void {
    const result = this.checkAction(action);
    if (!result.allowed) {
      throw new PolicyViolationError(
        `Policy violation: ${result.reason}`,
        action,
        result.policyType,
      );
    }
  }
  
  getToolMetadata(toolName: string): ToolMetadata | undefined {
    return this.toolMetadata.get(toolName);
  }
}

export function createAgentDojoPolicies(): PolicyEngine {
  const engine = new PolicyEngine();
  
  const consequentialTools = [
    'send_email',
    'create_calendar_event',
    'append_to_file',
    'send_direct_message',
    'send_channel_message',
    'delete_email',
    'reschedule_calendar_event',
    'cancel_calendar_event',
    'create_file',
    'delete_file',
    'share_file',
    'reserve_hotel',
    'reserve_restaurant',
    'reserve_car_rental',
    'send_money',
    'schedule_transaction',
    'update_scheduled_transaction',
    'update_password',
    'update_user_info',
    'add_user_to_channel',
    'invite_user_to_slack',
    'remove_user_from_slack',
    'get_webpage',
    'post_webpage',
    'download_file',
    'add_calendar_event_participants',
  ];
  
  for (const toolName of consequentialTools) {
    engine.registerTool({
      name: toolName,
      toolLabel: { integrity: 'T', confidentiality: new Set(['user']) },
      reads: [],
      writes: [],
      isConsequential: true,
      isEgress: toolName.includes('send') || 
                toolName.includes('post') || 
                toolName.includes('share'),
    });
  }
  
  return engine;
}

// Taint tracker
export function computeContextLabel(messages: LabeledMessage[]): SecurityLabel {
  if (messages.length === 0) {
    return BOTTOM_LABEL;
  }
  
  const labels = messages.map(m => m.label);
  return joinAllLabels(labels);
}

export function createUserMessageLabel(userId = 'user'): SecurityLabel {
  return {
    integrity: 'T',
    confidentiality: new Set([userId, 'public']),
  };
}

export function createSystemMessageLabel(): SecurityLabel {
  return {
    integrity: 'T',
    confidentiality: new Set(['public']),
  };
}

export class TaintTracker {
  private state: PlannerState;
  
  constructor(initialState?: PlannerState) {
    this.state = initialState ?? {
      history: [],
      contextLabel: BOTTOM_LABEL,
      memory: new Map(),
    };
  }
  
  addMessage(message: LabeledMessage): void {
    this.state.history.push(message);
    this.state.contextLabel = computeContextLabel(this.state.history);
  }
  
  getState(): PlannerState {
    return { ...this.state };
  }
  
  getContextLabel(): SecurityLabel {
    return this.state.contextLabel;
  }
  
  processToolResult(
    toolName: string,
    toolCallId: string,
    result: ToolExecutionResult,
  ): LabeledMessage {
    const toolMessage: LabeledMessage = {
      role: 'tool',
      content: String(result.value),
      label: result.label,
      toolCallId: toolCallId,
    };
    
    this.addMessage(toolMessage);
    return toolMessage;
  }
  
  processLLMResponse(
    content: string,
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>,
  ): LabeledMessage {
    const responseLabel = this.state.contextLabel;
    
    const assistantMessage: LabeledMessage = {
      role: 'assistant',
      content: content,
      label: responseLabel,
      toolCalls: toolCalls?.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: Object.fromEntries(
          Object.entries(tc.arguments).map(([k, v]) => [
            k,
            {
              value: v,
              label: responseLabel,
            },
          ])
        ),
        label: responseLabel,
      })),
    };
    
    this.addMessage(assistantMessage);
    return assistantMessage;
  }
  
  reset(): void {
    this.state = {
      history: [],
      contextLabel: BOTTOM_LABEL,
      memory: new Map(),
    };
  }
}

// Quarantined LLM
export interface QueryLlmParams {
  prompt: string;
  variables: string[];
  output_type: 'bool' | 'enum' | 'string';
  enum_values?: string[];
}

export interface QueryLlmResult {
  value: unknown;
  label: SecurityLabel;
  outputType: 'bool' | 'enum' | 'string';
}

const TYPE_HIERARCHY = {
  bool: 0,
  enum: 1,
  string: 2,
};

export function isTypeConstraintSatisfied(
  actualType: 'bool' | 'enum' | 'string',
  requiredType: 'bool' | 'enum' | 'string',
): boolean {
  return TYPE_HIERARCHY[actualType] <= TYPE_HIERARCHY[requiredType];
}

export function parseConstrainedOutput(
  rawOutput: string,
  outputType: 'bool' | 'enum' | 'string',
  enumValues?: string[],
): unknown {
  const trimmed = rawOutput.trim().toLowerCase();
  
  switch (outputType) {
    case 'bool':
      if (trimmed === 'true' || trimmed === 'yes' || trimmed === '1') {
        return true;
      }
      if (trimmed === 'false' || trimmed === 'no' || trimmed === '0') {
        return false;
      }
      console.warn(`Failed to parse bool from: ${rawOutput}, defaulting to false`);
      return false;
      
    case 'enum':
      if (enumValues) {
        const normalizedEnum = enumValues.map(v => v.toLowerCase());
        const index = normalizedEnum.indexOf(trimmed);
        if (index >= 0) {
          return enumValues[index];
        }
        console.warn(`Value ${rawOutput} not in enum ${enumValues}, defaulting to ${enumValues[0]}`);
        return enumValues[0];
      }
      return trimmed;
      
    case 'string':
      return rawOutput.slice(0, 1000);
      
    default:
      return rawOutput;
  }
}

export async function executeQueryLlm(
  params: QueryLlmParams,
  variableStore: Map<string, LabeledValue>,
  callLLM: (prompt: string, options: { constrainOutput?: boolean }) => Promise<string>,
): Promise<QueryLlmResult> {
  const variableValues: Array<{ name: string; value: LabeledValue }> = [];
  for (const varName of params.variables) {
    const val = variableStore.get(varName);
    if (!val) {
      throw new Error(`Variable not found: ${varName}`);
    }
    variableValues.push({ name: varName, value: val });
  }
  
  const contextText = variableValues
    .map(v => `[${v.name}]: ${JSON.stringify(v.value.value)}`)
    .join('\n');
  
  const fullPrompt = `
You are a secure data extraction assistant. You have access to the following variables:
${contextText}

Task: ${params.prompt}

Important constraints:
- You can ONLY extract and format information from the variables above.
- You CANNOT execute any actions or call any tools.
- Your response MUST be a valid ${params.output_type}.
${params.output_type === 'bool' ? '- Respond with only "true" or "false".' : ''}
${params.output_type === 'enum' && params.enum_values ? `- Respond with one of: ${params.enum_values.join(', ')}.` : ''}
${params.output_type === 'string' ? '- Provide a concise answer (max 1000 chars).' : ''}

Response:
`.trim();
  
  const rawResponse = await callLLM(fullPrompt, {
    constrainOutput: true,
  });
  
  const parsedValue = parseConstrainedOutput(
    rawResponse,
    params.output_type,
    params.enum_values,
  );
  
  const resultLabel = variableValues.reduce(
    (acc, v) => joinAllLabels([acc, v.value.label]),
    variableValues[0]?.value.label ?? { integrity: 'T', confidentiality: new Set(['public']) },
  );
  
  return {
    value: parsedValue,
    label: resultLabel,
    outputType: params.output_type,
  };
}

// Tool wrapper
const TOOL_LABEL_RULES: Record<string, Partial<ToolMetadata>> = {
  'read_user_input': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: false,
    isEgress: false,
  },
  
  'read_emails': {
    toolLabel: createLabel('U', ['user']),
    isConsequential: false,
    isEgress: false,
  },
  
  'web_search': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: false,
  },
  
  'send_email': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: true,
  },
  
  'send_message': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: true,
  },
  
  'create_file': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  'delete_file': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  'create_calendar_event': {
    toolLabel: createLabel('T', ['user']),
    isConsequential: true,
    isEgress: false,
  },
  
  'default': {
    toolLabel: createLabel('U', ['public']),
    isConsequential: false,
    isEgress: false,
  },
};

export function getToolMetadata(toolName: string): ToolMetadata {
  const rules = TOOL_LABEL_RULES[toolName] ?? TOOL_LABEL_RULES['default'];
  
  return {
    name: toolName,
    toolLabel: rules.toolLabel ?? TOOL_LABEL_RULES['default'].toolLabel!,
    reads: rules.reads ?? [],
    writes: rules.writes ?? [],
    isConsequential: rules.isConsequential ?? false,
    isEgress: rules.isEgress ?? false,
  };
}

export function wrapToolWithIFC<TArgs extends Record<string, unknown>, TResult>(
  originalTool: {
    name: string;
    execute: (args: TArgs) => Promise<TResult>;
  },
) {
  const metadata = getToolMetadata(originalTool.name);
  
  return {
    ...originalTool,
    metadata,
    
    async executeLabeled(
      args: Record<string, LabeledValue>,
    ): Promise<{ value: TResult; label: SecurityLabel }> {
      const expandedArgs: Record<string, unknown> = {};
      const argLabels: SecurityLabel[] = [];
      
      for (const [key, labeledVal] of Object.entries(args)) {
        expandedArgs[key] = labeledVal.value;
        argLabels.push(labeledVal.label);
      }
      
      const result = await originalTool.execute(expandedArgs as TArgs);
      
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

// Basic planner
export interface BasicPlannerConfig {
  policyEngine: PolicyEngine;
  throwOnViolation?: boolean;
}

export class BasicPlanner {
  private state: PlannerState;
  private config: BasicPlannerConfig;
  private taintTracker: TaintTracker;
  
  constructor(config: BasicPlannerConfig, initialState?: PlannerState) {
    this.config = config;
    this.state = initialState ?? {
      history: [],
      contextLabel: BOTTOM_LABEL,
      memory: new Map(),
    };
    this.taintTracker = new TaintTracker(this.state);
  }
  
  initialize(systemPrompt: string): void {
    const systemMessage: LabeledMessage = {
      role: 'system',
      content: systemPrompt,
      label: BOTTOM_LABEL,
    };
    this.taintTracker.addMessage(systemMessage);
    this.state = this.taintTracker.getState();
  }
  
  handleUserInput(userPrompt: string, userId = 'user'): Action {
    const userMessage: LabeledMessage = {
      role: 'user',
      content: userPrompt,
      label: createUserMessageLabel(userId),
    };
    this.taintTracker.addMessage(userMessage);
    this.state = this.taintTracker.getState();
    
    return {
      type: 'Query',
      history: this.state.history,
    };
  }
  
  handleToolResult(
    toolName: string,
    toolCallId: string,
    result: { value: unknown; label: SecurityLabel },
  ): Action {
    const toolMessage = this.taintTracker.processToolResult(
      toolName,
      toolCallId,
      { value: result.value, label: result.label },
    );
    this.state = this.taintTracker.getState();
    
    return {
      type: 'Query',
      history: this.state.history,
    };
  }
  
  handleLLMResponse(
    content: string,
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>,
  ): Action {
    const assistantMessage = this.taintTracker.processLLMResponse(content, toolCalls);
    this.state = this.taintTracker.getState();
    
    if (toolCalls && toolCalls.length > 0) {
      const tc = toolCalls[0];
      
      const action: MakeCallAction = {
        type: 'MakeCall',
        tool: tc.name,
        toolLabel: this.state.contextLabel,
        arguments: Object.fromEntries(
          Object.entries(tc.arguments).map(([k, v]) => [
            k,
            {
              value: v,
              label: this.state.contextLabel,
            },
          ])
        ),
      };
      
      const policyResult = this.config.policyEngine.checkAction(action);
      
      if (!policyResult.allowed) {
        if (this.config.throwOnViolation) {
          throw new Error(`Policy violation: ${policyResult.reason}`);
        }
        
        return {
          type: 'Finish',
          response: `Security policy blocked action: ${policyResult.reason}`,
          label: this.state.contextLabel,
        };
      }
      
      return action;
    }
    
    return {
      type: 'Finish',
      response: content,
      label: this.state.contextLabel,
    };
  }
  
  getState(): PlannerState {
    return { ...this.state };
  }
  
  getHistory(): LabeledMessage[] {
    return [...this.state.history];
  }
}

// FIDES planner
export interface QueryLlmConfig {
  model: string;
  provider: string;
  timeoutMs: number;
}

export interface FidesPlannerConfig {
  policyEngine: PolicyEngine;
  queryLlmConfig: QueryLlmConfig;
  throwOnViolation?: boolean;
  debug?: boolean;
}

export class FidesPlanner extends BasicPlanner {
  private config: FidesPlannerConfig;
  private debug: boolean;
  
  constructor(config: FidesPlannerConfig, initialState?: PlannerState) {
    super(config, initialState);
    this.config = config;
    this.debug = config.debug ?? false;
  }
  
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[FIDES]', ...args);
    }
  }
  
  override handleToolResult(
    toolName: string,
    toolCallId: string,
    result: { value: unknown; label: SecurityLabel },
  ): Action {
    const state = this.getState();
    const labeledResult: LabeledValue = {
      value: result.value,
      label: result.label,
    };
    
    this.log(`Tool result: ${toolName}, label: (${result.label.integrity}, {...})`);
    this.log(`Current context: (${state.contextLabel.integrity}, {...})`);
    
    let messageContent: string | LabeledValue[];
    
    if (typeof result.value === 'object' && result.value !== null) {
      const hiddenObj = hideObject(
        result.value as Record<string, unknown>,
        result.label,
        state.contextLabel,
        state.memory,
        toolName
      );
      messageContent = JSON.stringify(hiddenObj);
    } else {
      const hidden = hideValue(labeledResult, state.contextLabel, state.memory);
      
      if (hidden.type === 'variable') {
        messageContent = hidden.name;
        this.log(`Hid value in variable: ${hidden.name}`);
      } else {
        messageContent = String(result.value);
      }
    }
    
    const toolMessage: LabeledMessage = {
      role: 'tool',
      content: messageContent,
      label: state.contextLabel,
      toolCallId: toolCallId,
    };
    
    const newHistory = [...state.history, toolMessage];
    const newState: PlannerState = {
      history: newHistory,
      contextLabel: computeContextLabel(newHistory),
      memory: state.memory,
    };
    
    this['state'] = newState;
    
    return {
      type: 'Query',
      history: newHistory,
    };
  }
  
  createQueryLlmAction(
    prompt: string,
    variableNames: string[],
    outputType: 'bool' | 'enum' | 'string' = 'string',
  ): Action {
    const state = this.getState();
    
    const variables: Array<{ name: string; value: LabeledValue }> = [];
    for (const varName of variableNames) {
      const val = inspectVariable(varName, state.memory);
      if (!val) {
        throw new Error(`Variable not found: ${varName}`);
      }
      variables.push({ name: varName, value: val });
    }
    
    const queryLabel = variables.reduce(
      (acc, v) => joinLabels(acc, v.value.label),
      BOTTOM_LABEL
    );
    
    this.log(`Query LLM: ${prompt}`);
    this.log(`Variables: ${variableNames.join(', ')}`);
    this.log(`Query label: (${queryLabel.integrity}, {...})`);
    
    return {
      type: 'MakeCall',
      tool: 'query_llm',
      toolLabel: queryLabel,
      arguments: {
        prompt: { value: prompt, label: queryLabel },
        variables: { value: variableNames, label: queryLabel },
        output_type: { value: outputType, label: BOTTOM_LABEL },
      },
    };
  }
  
  expandToolArguments(
    args: Record<string, LabeledValue>,
  ): Record<string, LabeledValue> {
    const state = this.getState();
    return expandVariables(args, state.memory);
  }
  
  getVariableStoreDebugInfo(): string {
    const state = this.getState();
    const entries: string[] = [];
    for (const [name, value] of state.memory.entries()) {
      entries.push(`${name}: (${value.label.integrity}, {...}) = ${JSON.stringify(value.value).slice(0, 50)}`);
    }
    return entries.join('\n') || '(empty)';
  }
}