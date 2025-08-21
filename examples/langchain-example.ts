/**
 * Example: Using Klira AI SDK with LangChain.js
 * Demonstrates comprehensive callback integration with chains, agents, and tools
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { pull } from 'langchain/hub';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import { KliraLangChainCallbacks } from '../src/adapters/langchain/index.js';
import { createConfig, setGlobalConfig } from '../src/config/index.js';

async function main() {
  // Initialize Klira configuration
  const config = createConfig({
    appName: 'langchain-example',
    apiKey: process.env.KLIRA_API_KEY,
    verbose: true,
    tracingEnabled: true,
  });
  setGlobalConfig(config);

  // Create Klira callbacks handler
  const kliraCallbacks = new KliraLangChainCallbacks({
    checkInput: true,
    checkOutput: true,
    augmentPrompt: true,
    onInputViolation: 'log',
    onOutputViolation: 'filter',
    observability: {
      enabled: true,
      traceMetadata: true,
      trackTokenUsage: true,
    },
  });

  console.log('🦜 LangChain.js with Klira AI SDK Example');
  console.log('==========================================');

  // Initialize LLM
  const llm = new ChatOpenAI({
    model: 'gpt-3.5-turbo',
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0.7,
  });

  // Example 1: Simple Chain with Callbacks
  console.log('\n📝 Example 1: Simple Chain with Callbacks');
  try {
    const prompt = ChatPromptTemplate.fromTemplate(
      'You are a helpful assistant. Answer the question: {question}'
    );
    
    const chain = RunnableSequence.from([
      prompt,
      llm,
      new StringOutputParser()
    ]);

    const response = await chain.invoke(
      { question: 'What is artificial intelligence?' },
      { callbacks: [kliraCallbacks] }
    );

    console.log('✅ Chain Response:', response);
  } catch (error) {
    console.error('❌ Chain error:', error);
  }

  // Example 2: RAG Chain with Retriever
  console.log('\n🔍 Example 2: RAG Chain with Vector Store');
  try {
    // Create sample documents
    const documents = [
      'Klira AI provides guardrails and observability for LLM applications.',
      'The SDK supports multiple frameworks including LangChain, OpenAI, and custom implementations.',
      'Policy enforcement happens at both input and output stages of LLM interactions.',
      'Real-time streaming responses can be monitored and filtered using Klira guardrails.',
    ];

    // Create embeddings and vector store
    const embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 200,
      chunkOverlap: 20,
    });

    const splits = await textSplitter.createDocuments(documents);
    const vectorStore = await MemoryVectorStore.fromDocuments(splits, embeddings);
    const retriever = vectorStore.asRetriever();

    // Create RAG chain
    const ragPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are an assistant for question-answering tasks.
        Use the below context to answer the question. If you don't know the answer, say you don't know.
        Keep the answer concise.
        
        Context: {context}`
      ],
      ['human', '{question}']
    ]);

    const ragChain = RunnableSequence.from([
      {
        context: (input, config) => retriever.invoke(input.question, config),
        question: (input) => input.question,
      },
      ragPrompt,
      llm,
      new StringOutputParser(),
    ]);

    const ragResponse = await ragChain.invoke(
      { question: 'How does Klira AI help with LLM applications?' },
      { callbacks: [kliraCallbacks] }
    );

    console.log('✅ RAG Response:', ragResponse);
  } catch (error) {
    console.error('❌ RAG error:', error);
  }

  // Example 3: Tool-Calling Agent
  console.log('\n🛠️ Example 3: Tool-Calling Agent');
  try {
    // Setup tools
    const tools = [
      new TavilySearchResults({
        maxResults: 3,
        apiKey: process.env.TAVILY_API_KEY,
      }),
    ];

    // Create agent prompt
    const agentPrompt = ChatPromptTemplate.fromMessages([
      ['system', 'You are a helpful assistant. Use tools when necessary to answer questions accurately.'],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);

    // Create tool-calling agent
    const agent = await createToolCallingAgent({
      llm,
      tools,
      prompt: agentPrompt,
    });

    // Create agent executor
    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true,
      maxIterations: 3,
    });

    const agentResponse = await agentExecutor.invoke(
      { input: 'What are the latest developments in AI safety research?' },
      { callbacks: [kliraCallbacks] }
    );

    console.log('✅ Agent Response:', agentResponse.output);
  } catch (error) {
    console.error('❌ Agent error:', error);
  }

  // Example 4: Streaming Chain with Callbacks
  console.log('\n🌊 Example 4: Streaming Chain');
  try {
    const streamingPrompt = ChatPromptTemplate.fromTemplate(
      'Write a creative short story about {topic}. Keep it under 200 words.'
    );

    const streamingChain = streamingPrompt.pipe(llm);

    console.log('✅ Streaming story about robots:');
    
    const stream = await streamingChain.stream(
      { topic: 'a friendly robot learning to paint' },
      { callbacks: [kliraCallbacks] }
    );

    let fullStory = '';
    for await (const chunk of stream) {
      const content = chunk.content || '';
      if (content) {
        process.stdout.write(content);
        fullStory += content;
      }
    }
    
    console.log('\n✅ Story complete!');
  } catch (error) {
    console.error('❌ Streaming error:', error);
  }

  // Example 5: Multi-step Agent Chain
  console.log('\n🔄 Example 5: Multi-step Research Agent');
  try {
    // Create a research chain that does multiple steps
    const researchPrompt = ChatPromptTemplate.fromTemplate(`
      Based on the topic "{topic}", generate 3 specific research questions that would help understand this topic better.
      Format your response as a numbered list.
    `);

    const summarizePrompt = ChatPromptTemplate.fromTemplate(`
      Here are some research questions about {topic}:
      {questions}
      
      Provide a brief summary of what someone would learn by investigating these questions.
    `);

    const researchChain = RunnableSequence.from([
      researchPrompt,
      llm,
      new StringOutputParser(),
    ]);

    const summarizeChain = RunnableSequence.from([
      {
        topic: (input) => input.topic,
        questions: (input) => input.questions,
      },
      summarizePrompt,
      llm,
      new StringOutputParser(),
    ]);

    // Execute research chain
    const questions = await researchChain.invoke(
      { topic: 'quantum computing applications in cryptography' },
      { callbacks: [kliraCallbacks] }
    );

    console.log('📋 Research Questions:', questions);

    // Execute summary chain
    const summary = await summarizeChain.invoke(
      { 
        topic: 'quantum computing applications in cryptography',
        questions 
      },
      { callbacks: [kliraCallbacks] }
    );

    console.log('📝 Research Summary:', summary);
  } catch (error) {
    console.error('❌ Research chain error:', error);
  }

  // Example 6: Custom Callback Handling
  console.log('\n🎯 Example 6: Custom Callback Events');
  try {
    const customHandler = {
      handleLLMStart: async (llm: any, prompts: string[], runId: string) => {
        console.log(`🚀 LLM Starting [${runId}]: ${prompts[0]?.substring(0, 50)}...`);
      },
      handleLLMEnd: async (output: any, runId: string) => {
        console.log(`✅ LLM Completed [${runId}]: ${output.generations?.[0]?.text?.substring(0, 50) || 'No text'}...`);
      },
      handleChainStart: async (chain: any, inputs: any, runId: string) => {
        console.log(`⛓️ Chain Starting [${runId}]: ${chain.name || 'Unknown Chain'}`);
      },
      handleChainEnd: async (outputs: any, runId: string) => {
        console.log(`🔗 Chain Completed [${runId}]: ${typeof outputs === 'string' ? outputs.substring(0, 50) : 'Complex output'}...`);
      },
      handleToolStart: async (tool: any, input: string, runId: string) => {
        console.log(`🔧 Tool Starting [${runId}]: ${tool.name} with "${input}"`);
      },
      handleToolEnd: async (output: string, runId: string) => {
        console.log(`🛠️ Tool Completed [${runId}]: ${output.substring(0, 50)}...`);
      },
    };

    const simpleChain = ChatPromptTemplate.fromTemplate('Explain {concept} in one sentence.')
      .pipe(llm)
      .pipe(new StringOutputParser());

    const response = await simpleChain.invoke(
      { concept: 'machine learning' },
      { callbacks: [kliraCallbacks, customHandler] }
    );

    console.log('📖 Final Response:', response);
  } catch (error) {
    console.error('❌ Custom callback error:', error);
  }

  // Example 7: Error Handling with Callbacks
  console.log('\n⚠️ Example 7: Error Handling');
  try {
    const errorHandler = {
      handleLLMError: async (error: Error, runId: string) => {
        console.log(`💥 LLM Error [${runId}]:`, error.message);
      },
      handleChainError: async (error: Error, runId: string) => {
        console.log(`⛓️💥 Chain Error [${runId}]:`, error.message);
      },
    };

    // Create a chain that might have issues
    const problematicPrompt = ChatPromptTemplate.fromTemplate(
      'Process this request safely: {request}'
    );

    const problematicChain = problematicPrompt.pipe(llm).pipe(new StringOutputParser());

    const safeResponse = await problematicChain.invoke(
      { request: 'Tell me about the benefits of renewable energy' },
      { callbacks: [kliraCallbacks, errorHandler] }
    );

    console.log('✅ Safe Response:', safeResponse);
  } catch (error) {
    console.log('🛡️ Error caught by Klira guardrails:', error);
  }

  console.log('\n🎉 LangChain.js with Klira AI example completed!');
  console.log('Check your Klira AI dashboard for comprehensive observability data.');
}

// Error handling for the main function
main().catch((error) => {
  console.error('💥 Example failed:', error);
  process.exit(1);
});

export { main };