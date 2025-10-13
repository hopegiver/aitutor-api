import { Hono } from 'hono';
import { OpenAIService } from '../services/openai.js';
import { VectorizeService } from '../services/vectorize.js';
import { parseSSEStream, createSSEResponse, createErrorResponse } from '../utils/responses.js';
import { validateChatMessages, validateOptions, sanitizeInput } from '../utils/validation.js';

const chat = new Hono();

chat.post('/', async (c) => {
  try {
    const { messages, options = {} } = await c.req.json();

    // Basic validation
    if (!messages || !Array.isArray(messages)) {
      return c.json(createErrorResponse('Messages array is required'), 400);
    }

    validateChatMessages(messages);
    validateOptions(options);

    // Sanitize messages
    const sanitizedMessages = messages.map(msg => ({
      ...msg,
      content: sanitizeInput(msg.content)
    }));

    // Check API key
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Initialize services
    const openai = new OpenAIService(c.env);
    const vectorize = new VectorizeService(c.env.CONTENT_VECTORIZE, openai);

    // Get the last user message for content search
    const lastUserMessage = [...sanitizedMessages].reverse().find(msg => msg.role === 'user');
    let enhancedMessages = [...sanitizedMessages];

    if (lastUserMessage && c.env.CONTENT_VECTORIZE) {
      try {
        // Search for relevant content
        const searchOptions = options.contentId ? { contentId: options.contentId } : {};
        const contextResult = await vectorize.getContentContext(lastUserMessage.content, 3, searchOptions);

        if (contextResult.hasContext) {
          // Add context to system message or create new one
          const contextPrompt = `관련 강의 자료:
${contextResult.context}

위 강의 자료를 참고하여 학습자의 질문에 답변해주세요. 강의 내용과 관련이 있는 경우 자세히 설명해주세요.

IMPORTANT: 답변 시작 부분에 반드시 "📚 강의 내용을 기반으로 답변드립니다.\n\n"를 포함하여 사용자에게 이것이 강의 기반 답변임을 알려주세요.`;

          const hasSystemMessage = enhancedMessages.some(msg => msg.role === 'system');

          if (hasSystemMessage) {
            // Enhance existing system message
            const systemIndex = enhancedMessages.findIndex(msg => msg.role === 'system');
            enhancedMessages[systemIndex] = {
              ...enhancedMessages[systemIndex],
              content: enhancedMessages[systemIndex].content + '\n\n' + contextPrompt
            };
          } else {
            // Add new system message with context
            enhancedMessages.unshift({
              role: 'system',
              content: contextPrompt
            });
          }

          console.log(`✅ Found ${contextResult.relevantChunks} relevant content chunks for query`);
        } else {
          // No relevant content found - return rejection message directly without AI processing
          console.log('ℹ️ No relevant content found - returning rejection message directly');

          const rejectionMessage = '죄송합니다. 현재 등록된 강의 자료에서는 해당 내용을 찾을 수 없습니다. 강의 내용과 관련된 다른 질문을 해주시면 도움을 드릴 수 있습니다.';

          // Create a simple SSE stream with the rejection message
          const rejectionStream = new ReadableStream({
            start(controller) {
              const sseData = `data: ${JSON.stringify({
                choices: [{
                  delta: { content: rejectionMessage }
                }]
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(sseData));
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              controller.close();
            }
          });

          const parsedRejectionStream = parseSSEStream(rejectionStream);
          return createSSEResponse(parsedRejectionStream);
        }
      } catch (vectorError) {
        console.error('Vector search error (continuing without context):', vectorError);
        // Continue without context if vector search fails
      }
    }

    // Process with OpenAI
    const stream = await openai.streamChat(enhancedMessages, options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Chat error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

chat.post('/simple', async (c) => {
  try {
    const { message, systemPrompt, options = {} } = await c.req.json();

    if (!message || typeof message !== 'string') {
      return c.json(createErrorResponse('Message is required'), 400);
    }

    validateOptions(options);

    // Check API key
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Initialize services
    const openai = new OpenAIService(c.env);
    const vectorize = new VectorizeService(c.env.CONTENT_VECTORIZE, openai);

    // Search for relevant content
    let enhancedSystemPrompt = systemPrompt || '';

    if (c.env.CONTENT_VECTORIZE) {
      try {
        const searchOptions = options.contentId ? { contentId: options.contentId } : {};
        const contextResult = await vectorize.getContentContext(sanitizeInput(message), 3, searchOptions);

        if (contextResult.hasContext) {
          const contextPrompt = `관련 강의 자료:
${contextResult.context}

위 강의 자료를 참고하여 학습자의 질문에 답변해주세요. 강의 내용과 관련이 있는 경우 자세히 설명해주세요.

IMPORTANT: 답변 시작 부분에 반드시 "📚 강의 내용을 기반으로 답변드립니다.\n\n"를 포함하여 사용자에게 이것이 강의 기반 답변임을 알려주세요.`;

          enhancedSystemPrompt = enhancedSystemPrompt
            ? enhancedSystemPrompt + '\n\n' + contextPrompt
            : contextPrompt;

          console.log(`✅ Found ${contextResult.relevantChunks} relevant content chunks for simple chat`);
        } else {
          // No relevant content found - return rejection message directly without AI processing
          console.log('ℹ️ No relevant content found in simple chat - returning rejection message directly');

          const rejectionMessage = '죄송합니다. 현재 등록된 강의 자료에서는 해당 내용을 찾을 수 없습니다. 강의 내용과 관련된 다른 질문을 해주시면 도움을 드릴 수 있습니다.';

          // Create a simple SSE stream with the rejection message
          const rejectionStream = new ReadableStream({
            start(controller) {
              const sseData = `data: ${JSON.stringify({
                choices: [{
                  delta: { content: rejectionMessage }
                }]
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(sseData));
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              controller.close();
            }
          });

          const parsedRejectionStream = parseSSEStream(rejectionStream);
          return createSSEResponse(parsedRejectionStream);
        }
      } catch (vectorError) {
        console.error('Vector search error in simple chat (continuing without context):', vectorError);
        // Continue without context if vector search fails
      }
    }

    // Build messages array with enhanced system prompt
    const messages = [];
    if (enhancedSystemPrompt) {
      messages.push({ role: 'system', content: enhancedSystemPrompt });
    }
    messages.push({ role: 'user', content: sanitizeInput(message) });

    // Process with OpenAI
    const stream = await openai.streamChat(messages, options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Simple chat error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

export default chat;