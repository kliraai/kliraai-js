/**
 * Real Providers Demo: Working examples with actual AI providers
 * This demonstrates the Klira AI SDK working with real AI services
 */

import { OpenAI } from 'openai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

import { createKliraOpenAI } from '../src/adapters/openai/index.js';
import { KliraLangChainCallbacks } from '../src/adapters/langchain/index.js';
import { 
  createKliraAgent, 
  FunctionLLMProvider,
  HttpLLMProvider 
} from '../src/adapters/custom/index.js';
import { createConfig, setGlobalConfig } from '../src/config/index.js';

// Configuration validation
function validateEnvironment() {
  const required = ['OPENAI_API_KEY'];
  const optional = ['KLIRA_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please set these in your .env file or environment');
    process.exit(1);
  }

  const available = optional.filter(key => process.env[key]);
  console.log(`✅ Available API keys: ${required.concat(available).join(', ')}`);
  
  if (!process.env.KLIRA_API_KEY) {
    console.warn('⚠️ KLIRA_API_KEY not set - observability features will be limited');
  }

  return {
    hasKlira: !!process.env.KLIRA_API_KEY,
    hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
    hasGoogle: !!process.env.GOOGLE_API_KEY,
  };
}

// Real provider implementations
class AnthropicProvider {
  constructor(private apiKey: string) {}

  async complete(request: any) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model || 'claude-3-haiku-20240307',
        messages: request.messages,
        max_tokens: request.maxTokens || 256,
        temperature: request.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    return {
      content: data.content[0]?.text || '',
      model: data.model,
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      metadata: {
        provider: 'anthropic',
        stopReason: data.stop_reason,
      },
    };
  }
}

class GoogleProvider {
  constructor(private apiKey: string) {}

  async complete(request: any) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${request.model || 'gemini-1.5-flash'}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: request.messages.map((msg: any) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })),
        generationConfig: {
          temperature: request.temperature || 0.7,
          maxOutputTokens: request.maxTokens || 256,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      model: request.model || 'gemini-1.5-flash',
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
      metadata: {
        provider: 'google',
        finishReason: data.candidates?.[0]?.finishReason,
      },
    };
  }
}

async function main() {
  console.log('🚀 Real Providers Demo - Klira AI SDK');
  console.log('=====================================');

  // Validate environment
  const env = validateEnvironment();

  // Initialize Klira configuration
  const config = createConfig({
    appName: 'real-providers-demo',
    apiKey: process.env.KLIRA_API_KEY,
    verbose: true,
    tracingEnabled: env.hasKlira,
  });
  setGlobalConfig(config);

  // Test prompt for consistency across providers
  const testPrompt = 'Explain the concept of machine learning in exactly 2 sentences.';
  
  console.log(`\n📝 Test Prompt: "${testPrompt}"\n`);

  // Example 1: OpenAI with Klira SDK
  console.log('🔵 Example 1: OpenAI with Klira Integration');
  console.log('============================================');
  
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const kliraOpenAI = createKliraOpenAI(openai, {
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
      onInputViolation: 'log',
      onOutputViolation: 'filter',
      observability: {
        enabled: env.hasKlira,
        traceMetadata: true,
        trackTokenUsage: true,
      },
    });

    console.log('📤 Sending request to OpenAI...');
    const openaiResponse = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant. Be concise and accurate.',
        },
        {
          role: 'user',
          content: testPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    console.log('✅ OpenAI Response:');
    console.log(openaiResponse.choices[0].message.content);
    console.log('📊 Usage:', openaiResponse.usage);
    console.log('🔧 Model:', openaiResponse.model);
  } catch (error) {
    console.error('❌ OpenAI Error:', error);
  }

  // Example 2: LangChain.js with OpenAI and Klira Callbacks
  console.log('\n🦜 Example 2: LangChain.js with Klira Callbacks');
  console.log('===============================================');

  try {
    const langchainLLM = new ChatOpenAI({
      model: 'gpt-3.5-turbo',
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.7,
    });

    const kliraCallbacks = new KliraLangChainCallbacks({
      checkInput: true,
      checkOutput: true,
      augmentPrompt: true,
      observability: {
        enabled: env.hasKlira,
        traceMetadata: true,
        trackTokenUsage: true,
      },
    });

    const prompt = ChatPromptTemplate.fromTemplate(
      'You are an expert educator. {instruction}'
    );

    const chain = RunnableSequence.from([
      prompt,
      langchainLLM,
      new StringOutputParser(),
    ]);

    console.log('📤 Sending request through LangChain...');
    const langchainResponse = await chain.invoke(
      { instruction: testPrompt },
      { callbacks: [kliraCallbacks] }
    );

    console.log('✅ LangChain Response:');
    console.log(langchainResponse);
  } catch (error) {
    console.error('❌ LangChain Error:', error);
  }

  // Example 3: Anthropic with Custom Agent
  if (env.hasAnthropic) {
    console.log('\n🟣 Example 3: Anthropic Claude with Custom Agent');
    console.log('==============================================');

    try {
      const anthropicProvider = new FunctionLLMProvider(
        'anthropic-claude',
        async (request) => {
          const claude = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
          return await claude.complete(request);
        }
      );

      const anthropicAgent = createKliraAgent({
        provider: anthropicProvider,
        checkInput: true,
        checkOutput: true,
        augmentPrompt: true,
        observability: {
          enabled: env.hasKlira,
          traceMetadata: true,
          trackTokenUsage: true,
        },
      });

      console.log('📤 Sending request to Claude...');
      const claudeResponse = await anthropicAgent.complete({
        messages: [
          {
            role: 'system',
            content: 'You are Claude, an AI assistant. Be helpful and concise.',
          },
          {
            role: 'user',
            content: testPrompt,
          },
        ],
        model: 'claude-3-haiku-20240307',
        temperature: 0.7,
        maxTokens: 100,
      });

      console.log('✅ Claude Response:');
      console.log(claudeResponse.content);
      console.log('📊 Usage:', claudeResponse.usage);
      console.log('🏷️ Metadata:', claudeResponse.metadata);
    } catch (error) {
      console.error('❌ Anthropic Error:', error);
    }
  } else {
    console.log('\n⏭️ Skipping Anthropic example (API key not provided)');
  }

  // Example 4: Google Gemini with Custom Agent
  if (env.hasGoogle) {
    console.log('\n🟢 Example 4: Google Gemini with Custom Agent');
    console.log('===========================================');

    try {
      const googleProvider = new FunctionLLMProvider(
        'google-gemini',
        async (request) => {
          const gemini = new GoogleProvider(process.env.GOOGLE_API_KEY!);
          return await gemini.complete(request);
        }
      );

      const geminiAgent = createKliraAgent({
        provider: googleProvider,
        checkInput: true,
        checkOutput: true,
        augmentPrompt: true,
        observability: {
          enabled: env.hasKlira,
          traceMetadata: true,
          trackTokenUsage: true,
        },
      });

      console.log('📤 Sending request to Gemini...');
      const geminiResponse = await geminiAgent.complete({
        messages: [
          {
            role: 'system',
            content: 'You are Gemini, a helpful AI assistant. Be clear and concise.',
          },
          {
            role: 'user',
            content: testPrompt,
          },
        ],
        model: 'gemini-1.5-flash',
        temperature: 0.7,
        maxTokens: 100,
      });

      console.log('✅ Gemini Response:');
      console.log(geminiResponse.content);
      console.log('📊 Usage:', geminiResponse.usage);
      console.log('🏷️ Metadata:', geminiResponse.metadata);
    } catch (error) {
      console.error('❌ Google Error:', error);
    }
  } else {
    console.log('\n⏭️ Skipping Google example (API key not provided)');
  }

  // Example 5: Streaming Demo with OpenAI
  console.log('\n🌊 Example 5: Streaming Demo with OpenAI');
  console.log('=====================================');

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const kliraOpenAI = createKliraOpenAI(openai, {
      checkInput: true,
      checkOutput: true,
      streaming: {
        enableGuardrails: true,
        checkInterval: 5,
        onViolation: 'continue',
      },
      observability: {
        enabled: env.hasKlira,
      },
    });

    console.log('📤 Starting streaming request...');
    console.log('📝 Response: ');

    const stream = kliraOpenAI.chat.completions.createStream({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Tell me a short story about a robot learning to paint. Keep it under 150 words.',
        },
      ],
      temperature: 0.8,
      max_tokens: 200,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        process.stdout.write(content);
        fullResponse += content;
      }
      
      if (chunk.usage) {
        console.log('\n📊 Final Usage:', chunk.usage);
      }
    }

    console.log('\n✅ Streaming completed!');
  } catch (error) {
    console.error('❌ Streaming Error:', error);
  }

  // Example 6: Multi-Provider Comparison
  console.log('\n🔄 Example 6: Multi-Provider Response Comparison');
  console.log('==============================================');

  const comparisonPrompt = 'What is the most important benefit of renewable energy? Answer in one sentence.';
  const responses: { provider: string; response: string; tokens?: number }[] = [];

  // OpenAI
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const kliraOpenAI = createKliraOpenAI(openai, {
      observability: { enabled: false },
    });

    const result = await kliraOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: comparisonPrompt }],
      temperature: 0.5,
      max_tokens: 50,
    });

    responses.push({
      provider: 'OpenAI GPT-3.5',
      response: result.choices[0].message.content || '',
      tokens: result.usage?.total_tokens,
    });
  } catch (error) {
    console.error('OpenAI comparison failed:', error);
  }

  // Anthropic (if available)
  if (env.hasAnthropic) {
    try {
      const claude = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
      const result = await claude.complete({
        messages: [{ role: 'user', content: comparisonPrompt }],
        maxTokens: 50,
        temperature: 0.5,
      });

      responses.push({
        provider: 'Anthropic Claude',
        response: result.content,
        tokens: result.usage?.totalTokens,
      });
    } catch (error) {
      console.error('Anthropic comparison failed:', error);
    }
  }

  // Google (if available)
  if (env.hasGoogle) {
    try {
      const gemini = new GoogleProvider(process.env.GOOGLE_API_KEY!);
      const result = await gemini.complete({
        messages: [{ role: 'user', content: comparisonPrompt }],
        maxTokens: 50,
        temperature: 0.5,
      });

      responses.push({
        provider: 'Google Gemini',
        response: result.content,
        tokens: result.usage?.totalTokens,
      });
    } catch (error) {
      console.error('Google comparison failed:', error);
    }
  }

  console.log(`📋 Comparison Question: "${comparisonPrompt}"\n`);
  
  responses.forEach((result, index) => {
    console.log(`${index + 1}. **${result.provider}** (${result.tokens || 'Unknown'} tokens):`);
    console.log(`   ${result.response}\n`);
  });

  // Example 7: Error Handling and Resilience
  console.log('⚠️ Example 7: Error Handling and Resilience Testing');
  console.log('===============================================');

  try {
    // Test with invalid API key
    const invalidOpenAI = new OpenAI({
      apiKey: 'invalid-key-test',
    });

    const kliraInvalid = createKliraOpenAI(invalidOpenAI, {
      observability: { enabled: false },
    });

    console.log('🧪 Testing error handling with invalid API key...');
    
    try {
      await kliraInvalid.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test' }],
      });
    } catch (error) {
      console.log('✅ Error properly caught and handled:', error.message);
    }

    // Test rate limiting simulation
    console.log('🧪 Testing rate limiting resilience...');
    const rateLimitProvider = new FunctionLLMProvider(
      'rate-limit-test',
      async () => {
        // Simulate rate limit error
        throw new Error('Rate limit exceeded - please try again later');
      }
    );

    const rateLimitAgent = createKliraAgent({
      provider: rateLimitProvider,
      observability: { enabled: false },
    });

    try {
      await rateLimitAgent.complete({
        messages: [{ role: 'user', content: 'Test rate limit' }],
      });
    } catch (error) {
      console.log('✅ Rate limit error properly handled:', error.message);
    }

  } catch (error) {
    console.error('❌ Error handling test failed:', error);
  }

  console.log('\n🎉 Real Providers Demo Completed!');
  console.log('================================');
  
  if (env.hasKlira) {
    console.log('📊 Check your Klira AI dashboard for detailed observability data');
  } else {
    console.log('💡 Set KLIRA_API_KEY to enable full observability features');
  }
  
  console.log('🔧 All examples demonstrate Klira SDK integration with real providers');
  console.log('🛡️ Guardrails, observability, and error handling are working across all adapters');
}

// Enhanced error handling for the main function
main().catch((error) => {
  console.error('💥 Demo failed:', error);
  console.error('Stack trace:', error.stack);
  
  // Provide helpful troubleshooting
  console.log('\n🔧 Troubleshooting:');
  console.log('1. Ensure all required API keys are set in your environment');
  console.log('2. Check your internet connection');
  console.log('3. Verify API key permissions and quotas');
  console.log('4. Review the error message above for specific issues');
  
  process.exit(1);
});

export { main };