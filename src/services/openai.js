import OpenAI from 'openai';

export class OpenAIService {
  constructor(apiKey, accountId = null, azureConfig = {}) {
    // AI Gateway 설정 (하드코딩된 gateway ID 'aitutor' 사용)
    if (accountId && apiKey && !apiKey.startsWith('B1d3')) {
      // Cloudflare AI Gateway를 통한 OpenAI 접근 (실제 OpenAI API 키가 있을 때)
      this.apiKey = apiKey;
      this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/aitutor/openai`;
      this.isAzure = false;

      // OpenAI 클라이언트 초기화
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
      });
    } else {
      // Azure OpenAI 엔드포인트 (fallback)
      this.apiKey = azureConfig.apiKey || apiKey;
      this.baseUrl = azureConfig.endpoint || 'https://malgn-openai.openai.azure.com/';
      this.apiVersion = azureConfig.apiVersion || '2025-01-01-preview';
      this.isAzure = true;
    }
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

    // API 키 확인 로깅 (보안을 위해 앞 4글자만)
    console.log('API Key check:', this.apiKey ? `${this.apiKey.substring(0, 4)}...` : 'MISSING');
    console.log('Using AI Gateway:', !this.isAzure);

    // AI Tutor 모드로 메시지에 튜터 안내 추가 (원본 배열 수정 방지를 위해 복사)
    const messagesWithGuidance = this.addTutorGuidance([...messages], maxTokens);

    if (!this.isAzure && this.client) {
      // Cloudflare AI Gateway를 통한 OpenAI 호출
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
        console.error('OpenAI AI Gateway Error:', error);
        throw new Error(`OpenAI AI Gateway error: ${error.message}`);
      }
    } else {
      // Azure OpenAI 기존 방식 (fallback)
      const response = await fetch(`${this.baseUrl}openai/deployments/${options.model || 'gpt-4o-mini'}/chat/completions?api-version=${this.apiVersion}`, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messagesWithGuidance,
          stream: true,
          temperature: options.temperature || 0.7,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Azure OpenAI API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          headers: Object.fromEntries(response.headers.entries())
        });
        throw new Error(`Azure OpenAI API error: ${response.status} - ${errorBody}`);
      }

      return response.body;
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
}