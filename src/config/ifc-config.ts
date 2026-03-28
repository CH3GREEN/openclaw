/**
 * IFC Configuration
 * 
 * Configuration options for the FIDES Information Flow Control system.
 */

export interface IFCConfig {
  /**
   * Enable IFC security checks
   * @default false
   */
  enabled: boolean;
  
  /**
   * Throw exception on policy violation (vs. just logging)
   * @default true
   */
  throwOnViolation: boolean;
  
  /**
   * Enable debug logging for IFC operations
   * @default false
   */
  debug: boolean;
  
  /**
   * Policy enforcement mode
   * - strict: Block all violations
   * - permissive: Allow but log violations
   * - audit: Log all operations for review
   * @default 'strict'
   */
  policyMode: 'strict' | 'permissive' | 'audit';
  
  /**
   * LLM model for query operations
   * @default 'gpt-4o-mini'
   */
  queryLlmModel: string;
  
  /**
   * LLM provider for query operations
   * @default 'openai'
   */
  queryLlmProvider: string;
}

/**
 * Default IFC configuration
 */
export const DEFAULT_IFC_CONFIG: IFCConfig = {
  enabled: false,
  throwOnViolation: true,
  debug: false,
  policyMode: 'strict',
  queryLlmModel: 'gpt-4o-mini',
  queryLlmProvider: 'openai',
};
