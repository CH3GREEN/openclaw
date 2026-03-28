/**
 * IFC (Information Flow Control) Configuration Types
 */

/**
 * IFC security mode
 */
export type IFCMode = 'enforce' | 'audit' | 'disabled';

/**
 * IFC configuration options
 */
export interface IFCConfig {
  /**
   * Enable IFC system
   * @default false
   */
  enabled?: boolean;
  
  /**
   * Operation mode
   * - enforce: Block policy violations
   * - audit: Log violations but allow
   * - disabled: Turn off IFC
   * @default "audit"
   */
  mode?: IFCMode;
  
  /**
   * Throw error on policy violation
   * @default true
   */
  throwOnViolation?: boolean;
  
  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
  
  /**
   * Query LLM configuration
   */
  queryLlm?: {
    /** Model to use for constrained queries */
    model?: string;
    /** Provider (openai, anthropic, etc.) */
    provider?: string;
    /** Timeout in milliseconds */
    timeoutMs?: number;
  };
  
  /**
   * Tool-specific overrides
   */
  tools?: Record<string, {
    /** Override tool integrity label */
    integrity?: 'T' | 'U';
    /** Override allowed readers */
    readers?: string[];
    /** Mark as consequential (requires trusted input) */
    isConsequential?: boolean;
    /** Mark as egress (checks data flow) */
    isEgress?: boolean;
  }>;
}

/**
 * Security configuration including IFC
 */
export interface SecurityConfig {
  /**
   * Information Flow Control settings
   */
  ifc?: IFCConfig;
  
  /**
   * Audit logging settings
   */
  audit?: {
    enabled?: boolean;
    path?: string;
    level?: 'none' | 'errors' | 'tools' | 'all';
  };
}

/**
 * Extended OpenClaw config with IFC support
 */
export interface OpenClawConfigWithIFC {
  /**
   * Security settings
   */
  security?: SecurityConfig;
  
  // ... rest of OpenClaw config
  [key: string]: unknown;
}

/**
 * Default IFC configuration
 */
export const DEFAULT_IFC_CONFIG: Required<Omit<IFCConfig, 'queryLlm' | 'tools'>> = {
  enabled: false,
  mode: 'audit',
  throwOnViolation: true,
  debug: false,
};

/**
 * Resolve IFC configuration with defaults
 */
export function resolveIFCConfig(config?: IFCConfig): Required<Omit<IFCConfig, 'queryLlm' | 'tools'>> & 
  Pick<IFCConfig, 'queryLlm' | 'tools'> {
  return {
    ...DEFAULT_IFC_CONFIG,
    ...config,
  };
}

/**
 * Check if IFC is enabled and in enforce mode
 */
export function isIFCEnforced(config?: IFCConfig): boolean {
  if (!config?.enabled) {
    return false;
  }
  return config.mode === 'enforce' || config.mode === undefined;
}

/**
 * Check if IFC audit logging is enabled
 */
export function isIFCAuditEnabled(config?: IFCConfig): boolean {
  if (!config?.enabled) {
    return false;
  }
  return config.mode === 'audit' || config.mode === 'enforce';
}
