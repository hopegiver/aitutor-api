export class OpenAIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async streamChat(messages, options = {}) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4o-mini',
        messages: messages,
        stream: true,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    return response.body;
  }

  async createTutorResponse(question, context = '', options = {}) {
    const systemMessage = {
      role: 'system',
      content: `You are an AI tutor. Provide helpful, educational responses.
                Be encouraging and explain concepts clearly.
                ${context ? `Context: ${context}` : ''}`
    };

    const userMessage = {
      role: 'user',
      content: question
    };

    return this.streamChat([systemMessage, userMessage], options);
  }
}