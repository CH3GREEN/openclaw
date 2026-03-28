/**
 * Tests for IFC Tool Wrapper
 */

import { describe, it, expect, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  wrapOpenClawToolWithIFC,
  createOpenClawPolicyEngine,
  getOpenClawToolMetadata,
  checkIFCToolCall,
  OPENCLAW_TOOL_IFC_RULES,
} from './tool-wrapper.js';
import type { AgentTool } from '@mariozechner/pi-agent-core';

describe('IFC Tool Wrapper', () => {
  describe('getOpenClawToolMetadata', () => {
    it('should return correct metadata for exec tool', () => {
      const metadata = getOpenClawToolMetadata('exec');
      
      expect(metadata.name).toBe('exec');
      expect(metadata.toolLabel.integrity).toBe('T');
      expect(metadata.isConsequential).toBe(true);
      expect(metadata.isEgress).toBe(false);
    });
    
    it('should return correct metadata for web_search tool', () => {
      const metadata = getOpenClawToolMetadata('web_search');
      
      expect(metadata.name).toBe('web_search');
      expect(metadata.toolLabel.integrity).toBe('U');
      expect(metadata.isConsequential).toBe(false);
      expect(metadata.isEgress).toBe(false);
    });
    
    it('should return default metadata for unknown tools', () => {
      const metadata = getOpenClawToolMetadata('unknown_tool');
      
      expect(metadata.name).toBe('unknown_tool');
      expect(metadata.toolLabel.integrity).toBe('U');
      expect(metadata.toolLabel.confidentiality.has('public')).toBe(true);
    });
  });
  
  describe('createOpenClawPolicyEngine', () => {
    it('should create policy engine with registered tools', () => {
      const engine = createOpenClawPolicyEngine();
      
      // Check that some known tools are registered
      const execMeta = engine.getToolMetadata('exec');
      expect(execMeta).toBeDefined();
      expect(execMeta?.isConsequential).toBe(true);
      
      const messageMeta = engine.getToolMetadata('message');
      expect(messageMeta).toBeDefined();
      expect(messageMeta?.isEgress).toBe(true);
    });
  });
  
  describe('wrapOpenClawToolWithIFC', () => {
    it('should wrap tool and add IFC metadata', async () => {
      const mockTool: AgentTool<{ command: string }, string> = {
        name: 'exec',
        description: 'Execute command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
          },
          required: ['command'],
        },
        execute: async (args) => {
          return `Executed: ${args.command}`;
        },
      };
      
      const wrappedTool = wrapOpenClawToolWithIFC(mockTool);
      
      expect(wrappedTool.ifcMetadata).toBeDefined();
      expect(wrappedTool.ifcMetadata.name).toBe('exec');
      expect(wrappedTool.ifcMetadata.isConsequential).toBe(true);
    });
    
    it('should execute wrapped tool successfully', async () => {
      const mockTool: AgentTool<{ command: string }, string> = {
        name: 'exec',
        description: 'Execute command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
          },
          required: ['command'],
        },
        execute: async (args) => {
          return `Executed: ${args.command}`;
        },
      };
      
      const wrappedTool = wrapOpenClawToolWithIFC(mockTool);
      
      const result = await wrappedTool.executeLabeled({
        command: {
          value: 'ls -la',
          label: { integrity: 'T', confidentiality: new Set(['user']) },
        },
      });
      
      expect(result.value).toBe('Executed: ls -la');
      expect(result.label.integrity).toBe('T');
    });
    
    it('should join labels correctly', async () => {
      const mockTool: AgentTool<{ data: string }, string> = {
        name: 'write',
        description: 'Write file',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string' },
          },
          required: ['data'],
        },
        execute: async (args) => {
          return `Written: ${args.data}`;
        },
      };
      
      const wrappedTool = wrapOpenClawToolWithIFC(mockTool);
      
      // Execute with untrusted input
      const result = await wrappedTool.executeLabeled({
        data: {
          value: 'sensitive data',
          label: { integrity: 'U', confidentiality: new Set(['user', 'secret']) },
        },
      });
      
      // Result should have joined label (tool label + arg label)
      expect(result.label.integrity).toBe('U'); // U joined with T = U
    });
    
    it('should throw on policy violation with policy engine', async () => {
      const mockTool: AgentTool<{ data: string }, string> = {
        name: 'send_email',
        description: 'Send email',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string' },
          },
          required: ['data'],
        },
        execute: async (args) => {
          return `Sent: ${args.data}`;
        },
      };
      
      const policyEngine = createOpenClawPolicyEngine();
      const wrappedTool = wrapOpenClawToolWithIFC(mockTool, policyEngine);
      
      // Execute with untrusted input to consequential tool
      await assert.rejects(
        async () => {
          await wrappedTool.executeLabeled({
            data: {
              value: 'email content',
              label: { integrity: 'U', confidentiality: new Set(['user']) },
            },
          });
        },
        (error: Error) => {
          expect(error.name).toBe('PolicyViolationError');
          expect(error.message).toContain('Policy violation');
          return true;
        }
      );
    });
  });
  
  describe('checkIFCToolCall', () => {
    it('should allow trusted tool call', () => {
      const result = checkIFCToolCall(
        'exec',
        { command: 'ls -la' },
        { integrity: 'T', confidentiality: new Set(['user']) }
      );
      
      expect(result.allowed).toBe(true);
    });
    
    it('should block untrusted input to consequential tool', () => {
      const result = checkIFCToolCall(
        'send_email',
        { to: 'test@example.com', body: 'test' },
        { integrity: 'U', confidentiality: new Set(['user']) }
      );
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });
    
    it('should allow untrusted input to non-consequential tool', () => {
      const result = checkIFCToolCall(
        'web_search',
        { query: 'weather' },
        { integrity: 'U', confidentiality: new Set(['public']) }
      );
      
      expect(result.allowed).toBe(true);
    });
  });
  
  describe('OPENCLAW_TOOL_IFC_RULES', () => {
    it('should have rules for all core tools', () => {
      const coreTools = [
        'read',
        'write',
        'edit',
        'exec',
        'message',
        'browser',
        'canvas',
        'cron',
        'gateway',
        'nodes',
        'tts',
        'web_search',
        'web_fetch',
        'image',
        'memory_search',
        'memory_get',
      ];
      
      for (const tool of coreTools) {
        expect(OPENCLAW_TOOL_IFC_RULES[tool]).toBeDefined();
      }
    });
    
    it('should have default rule', () => {
      expect(OPENCLAW_TOOL_IFC_RULES['default']).toBeDefined();
    });
  });
});

describe('IFC Integration', () => {
  it('should integrate with OpenClaw config', () => {
    // This test verifies the integration points exist
    const { resolveIFCConfig, isIFCEnforced } = require('../config/types.ifc.js');
    
    const config = resolveIFCConfig({ enabled: true, mode: 'enforce' });
    expect(config.enabled).toBe(true);
    expect(config.mode).toBe('enforce');
    
    expect(isIFCEnforced({ enabled: true, mode: 'enforce' })).toBe(true);
    expect(isIFCEnforced({ enabled: true, mode: 'audit' })).toBe(false);
    expect(isIFCEnforced({ enabled: false })).toBe(false);
  });
});
