/**
 * Trace validation tests
 *
 * These tests verify that the JS SDK generates traces that match
 * the Python SDK format exactly, ensuring platform compatibility.
 *
 * CRITICAL: The platform and API depend on exact trace format matching.
 *
 * Expected trace format (matching Python SDK):
 * 1. Tracer name: "klira" (single tracer for all spans)
 * 2. Span names: "klira.{type}.{name}" format
 * 3. Attributes: klira.entity_type, klira.entity_name, klira.user_id, etc.
 * 4. Root span: "klira.user.message" for unified traces
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trace } from '@opentelemetry/api';
import { KliraAI } from '../index.js';
import { workflow, agent, task, tool } from '../decorators/index.js';
import { startUserMessageTrace } from '../observability/user-message-context.js';
import { GuardrailsEngine } from '../guardrails/engine.js';

/**
 * Captured trace calls for validation
 */
interface CapturedTrace {
  tracerName: string;
  spanName: string;
  attributes: Record<string, any>;
}

let capturedTraces: CapturedTrace[] = [];

/**
 * Setup trace mocking to capture calls
 */
function setupTraceMocking() {
  capturedTraces = [];

  // Mock trace.getTracer to capture tracer names and span creations
  vi.spyOn(trace, 'getTracer').mockImplementation((tracerName: string) => {
    return {
      startSpan: vi.fn((spanName: string, options?: any) => {
        // Create attributes object for this span, starting with any passed in options
        const attributes: Record<string, any> = { ...(options?.attributes || {}) };

        // Create mock span
        const mockSpan = {
          setAttribute: vi.fn((key: string, value: any) => {
            attributes[key] = value;
            return mockSpan;
          }),
          setAttributes: vi.fn((attrs: Record<string, any>) => {
            Object.assign(attributes, attrs);
            return mockSpan;
          }),
          setStatus: vi.fn(),
          recordException: vi.fn(),
          end: vi.fn(),
          spanContext: vi.fn(() => ({
            traceId: 'mock-trace-id',
            spanId: 'mock-span-id',
            traceFlags: 1,
          })),
        };

        // Capture this trace with its attributes
        capturedTraces.push({
          tracerName,
          spanName,
          attributes,
        });

        return mockSpan;
      }),
    } as any;
  });
}

function resetTraceMocking() {
  vi.mocked(trace.getTracer).mockRestore();
  capturedTraces = [];
}

describe('Trace Format Validation', () => {
  beforeEach(async () => {
    setupTraceMocking();

    // Reset SDK state
    GuardrailsEngine.resetInstance();
    (KliraAI as any).initialized = false;
    (KliraAI as any).config = null;
    (KliraAI as any).guardrails = null;
    (KliraAI as any).tracing = null;
    (KliraAI as any).metrics = null;
    (KliraAI as any).logger = null;

    // Initialize SDK for testing (with tracing disabled to avoid conflicts)
    await KliraAI.init({
      appName: 'test-trace-validation',
      tracingEnabled: false,
    });
  });

  afterEach(async () => {
    resetTraceMocking();

    // Clean up SDK state
    GuardrailsEngine.resetInstance();
    (KliraAI as any).initialized = false;
    (KliraAI as any).config = null;
    (KliraAI as any).guardrails = null;
    (KliraAI as any).tracing = null;
    (KliraAI as any).metrics = null;
    (KliraAI as any).logger = null;
  });

  describe('Decorator Span Format', () => {
    it('should use tracer name "klira" for all decorators', async () => {
      class TestClass {
        @workflow({ name: 'test_workflow', userId: 'user_123' })
        async testWorkflow() {
          return 'workflow result';
        }

        @agent({ name: 'test_agent', userId: 'user_123' })
        async testAgent() {
          return 'agent result';
        }

        @task({ name: 'test_task', userId: 'user_123' })
        async testTask() {
          return 'task result';
        }

        @tool({ name: 'test_tool', userId: 'user_123' })
        async testTool() {
          return 'tool result';
        }
      }

      const instance = new TestClass();

      await instance.testWorkflow();
      await instance.testAgent();
      await instance.testTask();
      await instance.testTool();

      // All spans should use tracer name "klira" (matching Python SDK)
      expect(capturedTraces.length).toBe(4);
      for (const trace of capturedTraces) {
        expect(trace.tracerName).toBe('klira');
      }
    });

    it('should use span name format "klira.{type}.{name}"', async () => {
      class TestClass {
        @workflow({ name: 'my_workflow', userId: 'user_123' })
        async testWorkflow() {
          return 'result';
        }

        @agent({ name: 'my_agent', userId: 'user_123' })
        async testAgent() {
          return 'result';
        }

        @task({ name: 'my_task', userId: 'user_123' })
        async testTask() {
          return 'result';
        }

        @tool({ name: 'my_tool', userId: 'user_123' })
        async testTool() {
          return 'result';
        }
      }

      const instance = new TestClass();

      await instance.testWorkflow();
      await instance.testAgent();
      await instance.testTask();
      await instance.testTool();

      // Verify span names match Python SDK format
      const expectedNames = [
        'klira.workflow.my_workflow',
        'klira.agent.my_agent',
        'klira.task.my_task',
        'klira.tool.my_tool',
      ];

      const actualNames = capturedTraces.map((t) => t.spanName);
      expect(actualNames).toEqual(expectedNames);
    });

    it('should set klira.entity_type attribute', async () => {
      class TestClass {
        @workflow({ name: 'test_workflow', userId: 'user_123' })
        async testWorkflow() {
          return 'result';
        }

        @agent({ name: 'test_agent', userId: 'user_123' })
        async testAgent() {
          return 'result';
        }
      }

      const instance = new TestClass();

      await instance.testWorkflow();
      await instance.testAgent();

      const workflowTrace = capturedTraces.find(
        (t) => t.spanName === 'klira.workflow.test_workflow'
      );
      const agentTrace = capturedTraces.find((t) => t.spanName === 'klira.agent.test_agent');

      expect(workflowTrace?.attributes['klira.entity_type']).toBe('workflow');
      expect(agentTrace?.attributes['klira.entity_type']).toBe('agent');
    });

    it('should set klira.entity_name attribute', async () => {
      class TestClass {
        @workflow({ name: 'my_workflow', userId: 'user_123' })
        async testWorkflow() {
          return 'result';
        }

        @agent({ name: 'my_agent', userId: 'user_123' })
        async testAgent() {
          return 'result';
        }
      }

      const instance = new TestClass();

      await instance.testWorkflow();
      await instance.testAgent();

      const workflowTrace = capturedTraces.find(
        (t) => t.spanName === 'klira.workflow.my_workflow'
      );
      const agentTrace = capturedTraces.find((t) => t.spanName === 'klira.agent.my_agent');

      expect(workflowTrace?.attributes['klira.entity_name']).toBe('my_workflow');
      expect(agentTrace?.attributes['klira.entity_name']).toBe('my_agent');
    });

    it('should include user_id in span attributes', async () => {
      class TestClass {
        @workflow({ name: 'test_workflow', userId: 'user_456' })
        async testWorkflow() {
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testWorkflow();

      const workflowTrace = capturedTraces.find(
        (t) => t.spanName === 'klira.workflow.test_workflow'
      );

      expect(workflowTrace?.attributes['klira.user_id']).toBe('user_456');
    });

    it('should include conversation_id when provided', async () => {
      class TestClass {
        @workflow({
          name: 'test_workflow',
          userId: 'user_123',
          conversationId: 'conv_789',
        })
        async testWorkflow() {
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testWorkflow();

      const workflowTrace = capturedTraces.find(
        (t) => t.spanName === 'klira.workflow.test_workflow'
      );

      expect(workflowTrace?.attributes['klira.conversation_id']).toBe('conv_789');
    });

    it('should use klira.{type}.version format for version attribute', async () => {
      class TestClass {
        @workflow({ name: 'test_workflow', userId: 'user_123', version: '1.2.3' })
        async testWorkflow() {
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testWorkflow();

      const workflowTrace = capturedTraces.find(
        (t) => t.spanName === 'klira.workflow.test_workflow'
      );

      expect(workflowTrace?.attributes['klira.workflow.version']).toBe('1.2.3');
    });
  });

  describe('Unified Trace Context', () => {
    it('should create root span with name "klira.user.message"', async () => {
      const traceCtx = startUserMessageTrace({
        userId: 'user_123',
        conversationId: 'conv_456',
      });

      await traceCtx.run(async () => {
        return 'test result';
      });

      const rootTrace = capturedTraces.find((t) => t.spanName === 'klira.user.message');
      expect(rootTrace).toBeDefined();
    });

    it('should set required attributes on root span', async () => {
      const traceCtx = startUserMessageTrace({
        userId: 'user_123',
        conversationId: 'conv_456',
        messageId: 'msg_789',
      });

      await traceCtx.run(async () => {
        return 'test result';
      });

      const rootTrace = capturedTraces.find((t) => t.spanName === 'klira.user.message');

      expect(rootTrace?.attributes['klira.user_id']).toBe('user_123');
      expect(rootTrace?.attributes['klira.conversation_id']).toBe('conv_456');
      expect(rootTrace?.attributes['klira.message_id']).toBe('msg_789');
      expect(rootTrace?.attributes['klira.entity_type']).toBe('user_message');
    });

    it('should use tracer name "klira" for root span', async () => {
      const traceCtx = startUserMessageTrace({
        userId: 'user_123',
        conversationId: 'conv_456',
      });

      await traceCtx.run(async () => {
        return 'test result';
      });

      const rootTrace = capturedTraces.find((t) => t.spanName === 'klira.user.message');

      expect(rootTrace?.tracerName).toBe('klira');
    });

    it('should generate message_id if not provided', async () => {
      const traceCtx = startUserMessageTrace({
        userId: 'user_123',
        conversationId: 'conv_456',
      });

      await traceCtx.run(async () => {
        return 'test result';
      });

      const rootTrace = capturedTraces.find((t) => t.spanName === 'klira.user.message');

      const messageId = rootTrace?.attributes['klira.message_id'];
      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe('string');
      expect((messageId as string).startsWith('msg_')).toBe(true);
    });

    it('should include evals_run attribute when in eval mode', async () => {
      // Re-initialize SDK with evals_run
      await KliraAI.shutdown();
      await KliraAI.init({
        appName: 'test-trace-validation',
        tracingEnabled: false,
        evalsRun: 'eval_run_123',
      });

      const traceCtx = startUserMessageTrace({
        userId: 'user_123',
        conversationId: 'conv_456',
      });

      await traceCtx.run(async () => {
        return 'test result';
      });

      const rootTrace = capturedTraces.find((t) => t.spanName === 'klira.user.message');

      expect(rootTrace?.attributes['klira.evals_run']).toBe('eval_run_123');
    });

    it('should expose trace ID and span ID', async () => {
      const traceCtx = startUserMessageTrace({
        userId: 'user_123',
        conversationId: 'conv_456',
      });

      let traceId: string | null = null;
      let spanId: string | null = null;

      await traceCtx.run(async () => {
        traceId = traceCtx.getTraceId();
        spanId = traceCtx.getSpanId();
        return 'test result';
      });

      expect(traceId).toBeDefined();
      expect(spanId).toBeDefined();
      expect(typeof traceId).toBe('string');
      expect(typeof spanId).toBe('string');
    });
  });

  describe('Platform Compatibility', () => {
    it('should match Python SDK trace structure for complete workflow', async () => {
      /**
       * This test simulates a complete user message flow:
       * 1. User message (root)
       * 2. Workflow
       * 3. Agent
       * 4. Task
       * 5. Tool
       *
       * Expected trace structure (matching Python SDK):
       * klira.user.message (root)
       * └─ klira.workflow.customer_support
       *    └─ klira.agent.support_agent
       *       └─ klira.task.analyze_query
       *          └─ klira.tool.database_lookup
       */

      class CustomerSupport {
        @workflow({ name: 'customer_support', userId: 'user_123' })
        async handleQuery(query: string) {
          return this.supportAgent(query);
        }

        @agent({ name: 'support_agent', userId: 'user_123' })
        async supportAgent(query: string) {
          return this.analyzeQuery(query);
        }

        @task({ name: 'analyze_query', userId: 'user_123' })
        async analyzeQuery(query: string) {
          return this.databaseLookup(query);
        }

        @tool({ name: 'database_lookup', userId: 'user_123' })
        async databaseLookup(query: string) {
          return `Result for: ${query}`;
        }
      }

      const support = new CustomerSupport();
      const traceCtx = startUserMessageTrace({
        userId: 'user_123',
        conversationId: 'conv_456',
      });

      await traceCtx.run(async () => {
        return support.handleQuery('How do I reset my password?');
      });

      // Verify all expected spans exist
      const rootTrace = capturedTraces.find((t) => t.spanName === 'klira.user.message');
      const workflowTrace = capturedTraces.find(
        (t) => t.spanName === 'klira.workflow.customer_support'
      );
      const agentTrace = capturedTraces.find((t) => t.spanName === 'klira.agent.support_agent');
      const taskTrace = capturedTraces.find((t) => t.spanName === 'klira.task.analyze_query');
      const toolTrace = capturedTraces.find((t) => t.spanName === 'klira.tool.database_lookup');

      expect(rootTrace).toBeDefined();
      expect(workflowTrace).toBeDefined();
      expect(agentTrace).toBeDefined();
      expect(taskTrace).toBeDefined();
      expect(toolTrace).toBeDefined();

      // Verify all use same tracer name
      expect(rootTrace?.tracerName).toBe('klira');
      expect(workflowTrace?.tracerName).toBe('klira');
      expect(agentTrace?.tracerName).toBe('klira');
      expect(taskTrace?.tracerName).toBe('klira');
      expect(toolTrace?.tracerName).toBe('klira');

      // Verify entity attributes
      expect(rootTrace?.attributes['klira.entity_type']).toBe('user_message');
      expect(workflowTrace?.attributes['klira.entity_type']).toBe('workflow');
      expect(agentTrace?.attributes['klira.entity_type']).toBe('agent');
      expect(taskTrace?.attributes['klira.entity_type']).toBe('task');
      expect(toolTrace?.attributes['klira.entity_type']).toBe('tool');

      expect(workflowTrace?.attributes['klira.entity_name']).toBe('customer_support');
      expect(agentTrace?.attributes['klira.entity_name']).toBe('support_agent');
      expect(taskTrace?.attributes['klira.entity_name']).toBe('analyze_query');
      expect(toolTrace?.attributes['klira.entity_name']).toBe('database_lookup');
    });
  });
});
