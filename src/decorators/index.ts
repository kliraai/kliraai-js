/**
 * Klira AI SDK Decorators
 *
 * Provides decorators for tracing workflows, tasks, agents, and tools in your LLM application.
 */

import { createDecorator, type DecoratorOptions } from './base.js';

/**
 * Workflow decorator - marks a function as a high-level workflow
 *
 * A workflow is typically a high-level process that orchestrates multiple tasks.
 *
 * @example
 * ```typescript
 * import { workflow } from '@kliraai/sdk';
 *
 * class ChatService {
 *   @workflow({ name: 'chat_workflow', userId: 'user_123' })
 *   async handleChat(message: string) {
 *     // ... workflow implementation
 *   }
 * }
 * ```
 *
 * @param options - Decorator options
 * @param options.name - Name of the workflow (defaults to method name)
 * @param options.version - Version of the workflow
 * @param options.userId - User ID for tracking (REQUIRED)
 * @param options.organizationId - Organization ID for context (optional)
 * @param options.projectId - Project ID for context (optional)
 * @param options.conversationId - Conversation ID for context (optional)
 */
export const workflow = createDecorator('workflow');

/**
 * Task decorator - marks a function as a distinct task within a workflow
 *
 * A task is typically a distinct operation within a workflow.
 *
 * @example
 * ```typescript
 * import { task } from '@kliraai/sdk';
 *
 * class DataProcessor {
 *   @task({ name: 'process_data', userId: 'user_123', taskId: 'task_1' })
 *   async processData(data: any[]) {
 *     // ... task implementation
 *   }
 * }
 * ```
 *
 * @param options - Decorator options
 * @param options.name - Name of the task (defaults to method name)
 * @param options.version - Version of the task
 * @param options.userId - User ID for tracking (REQUIRED)
 * @param options.organizationId - Organization ID for context (optional)
 * @param options.projectId - Project ID for context (optional)
 * @param options.taskId - Specific ID for the task (optional)
 */
export const task = createDecorator('task');

/**
 * Agent decorator - marks a function as an agent operation
 *
 * An agent is often an autonomous component that uses tools to accomplish goals.
 *
 * @example
 * ```typescript
 * import { agent } from '@kliraai/sdk';
 *
 * class SupportAgent {
 *   @agent({ name: 'support_agent', userId: 'user_123', agentId: 'agent_1' })
 *   async handleRequest(request: string) {
 *     // ... agent implementation
 *   }
 * }
 * ```
 *
 * @param options - Decorator options
 * @param options.name - Name of the agent (defaults to method name)
 * @param options.version - Version of the agent
 * @param options.userId - User ID for tracking (REQUIRED)
 * @param options.organizationId - Organization ID for context (optional)
 * @param options.projectId - Project ID for context (optional)
 * @param options.agentId - Specific ID for the agent (optional)
 */
export const agent = createDecorator('agent');

/**
 * Tool decorator - marks a function as a tool that can be used by agents
 *
 * A tool is typically a utility function used by agents to perform specific operations.
 *
 * @example
 * ```typescript
 * import { tool } from '@kliraai/sdk';
 *
 * class DatabaseTools {
 *   @tool({ name: 'database_query', userId: 'user_123', toolId: 'tool_1' })
 *   async queryDatabase(query: string) {
 *     // ... tool implementation
 *   }
 * }
 * ```
 *
 * @param options - Decorator options
 * @param options.name - Name of the tool (defaults to method name)
 * @param options.version - Version of the tool
 * @param options.userId - User ID for tracking (REQUIRED)
 * @param options.organizationId - Organization ID for context (optional)
 * @param options.projectId - Project ID for context (optional)
 * @param options.agentId - ID of the agent using the tool (optional)
 * @param options.toolId - Specific ID for the tool (optional)
 */
export const tool = createDecorator('tool');

// Re-export guardrails decorator
export { guardrails } from './guardrails.js';

// Re-export types
export type { DecoratorOptions };
