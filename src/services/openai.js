export class OpenAIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
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

    // AI Tutor 모드로 메시지에 튜터 안내 추가 (원본 배열 수정 방지를 위해 복사)
    const messagesWithGuidance = this.addTutorGuidance([...messages], maxTokens);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4o-mini',
        messages: messagesWithGuidance,
        stream: true,
        temperature: options.temperature || 0.7,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('OpenAI API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        headers: Object.fromEntries(response.headers.entries())
      });
      throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`);
    }

    return response.body;
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