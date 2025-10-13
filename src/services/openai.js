import OpenAI from 'openai';

export class OpenAIService {
  constructor(env) {
    // env 객체 또는 기존 방식 모두 지원
    if (typeof env === 'object' && env !== null) {
      this.apiKey = env.OPENAI_API_KEY;
      this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
    } else {
      // 기존 방식 (테스트용)
      this.apiKey = arguments[0];
      this.accountId = arguments[1];
    }

    if (!this.apiKey || !this.accountId) {
      throw new Error('OpenAI API key and Cloudflare account ID are required');
    }

    // Cloudflare AI Gateway를 통한 OpenAI 접근 (하드코딩된 gateway ID 'aitutor' 사용)
    this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${this.accountId}/aitutor/openai`;

    // OpenAI 클라이언트 초기화
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  // AI Tutor용 시스템 메시지 추가
  addTutorGuidance(messages, maxTokens = 500) {
    const hasSystemMessage = messages.some(msg => msg.role === 'system');

    if (!hasSystemMessage) {
      messages.unshift({
        role: 'system',
        content: `You are an AI tutor. Provide helpful, educational responses.
                  Be encouraging, patient, and explain concepts clearly.
                  Use examples when helpful and break down complex topics.
                  IMPORTANT: Keep your response complete and concise within 450 tokens.`
      });
    } else {
      // 기존 시스템 메시지에 튜터 모드 안내 추가
      const systemIndex = messages.findIndex(msg => msg.role === 'system');
      messages[systemIndex].content += `\n\nAs an AI tutor, be encouraging and educational. Keep your response complete within 450 tokens.`;
    }

    return messages;
  }

  async streamChat(messages, options = {}) {
    const maxTokens = options.maxTokens || 500;

    // AI Tutor 모드로 메시지에 튜터 안내 추가 (원본 배열 수정 방지를 위해 복사)
    const messagesWithGuidance = this.addTutorGuidance([...messages], maxTokens);

    try {
      const stream = await this.client.chat.completions.create({
        model: options.model || 'gpt-4o-mini',
        messages: messagesWithGuidance,
        stream: true,
        temperature: options.temperature || 0.7,
        max_tokens: maxTokens,
      });

      // ReadableStream으로 변환
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const delta = chunk.choices[0]?.delta;
              if (delta?.content) {
                const sseData = `data: ${JSON.stringify({
                  choices: [{
                    delta: { content: delta.content }
                  }]
                })}\n\n`;
                controller.enqueue(new TextEncoder().encode(sseData));
              }
            }
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          }
        }
      });

      return readableStream;
    } catch (error) {
      console.error('OpenAI API error:', error.message);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async createQuiz(topic, questionCount = 5, options = {}) {
    const systemMessage = {
      role: 'system',
      content: `You are a quiz generator. Create educational quiz questions about the given topic.
                Format your response as JSON with the following structure:
                {
                  "title": "Quiz: [Topic Name]",
                  "questions": [
                    {
                      "question": "Question text",
                      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
                      "correct": "A",
                      "explanation": "Why this answer is correct"
                    }
                  ]
                }
                IMPORTANT: Keep the complete quiz within 450 tokens. Generate exactly ${questionCount} questions.`
    };

    const userMessage = {
      role: 'user',
      content: `Create ${questionCount} multiple choice quiz questions about: ${topic}`
    };

    return this.streamChat([systemMessage, userMessage], options);
  }

  async createChatCompletion(options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || 'gpt-4o-mini',
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 500,
        stream: false
      });

      return response;
    } catch (error) {
      console.error('OpenAI Chat Completion error:', error.message);
      throw new Error(`OpenAI Chat Completion error: ${error.message}`);
    }
  }

  async createEmbedding(input, options = {}) {
    try {
      const response = await this.client.embeddings.create({
        model: options.model || 'text-embedding-3-small',
        input: input,
        encoding_format: options.encoding_format || 'float'
      });

      // Return just the embedding vector for convenience
      return response.data[0].embedding;
    } catch (error) {
      console.error('OpenAI Embedding error:', error.message);
      throw new Error(`OpenAI Embedding error: ${error.message}`);
    }
  }
}

// Export a factory function for creating OpenAI service instances
export function getOpenAIService(env) {
  return new OpenAIService(env);
}