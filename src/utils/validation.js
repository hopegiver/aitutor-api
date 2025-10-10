export function validateChatMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error('Messages must be an array');
  }

  if (messages.length === 0) {
    throw new Error('Messages array cannot be empty');
  }

  for (const [index, message] of messages.entries()) {
    if (!message.role || !message.content) {
      throw new Error(`Message at index ${index} must have role and content`);
    }

    if (!['system', 'user', 'assistant'].includes(message.role)) {
      throw new Error(`Invalid role "${message.role}" at index ${index}`);
    }

    if (typeof message.content !== 'string') {
      throw new Error(`Message content at index ${index} must be a string`);
    }

    if (message.content.length > 4000) {
      throw new Error(`Message content at index ${index} exceeds 4000 characters`);
    }
  }
}

export function validateTutorRequest(question, context) {
  if (typeof question !== 'string') {
    throw new Error('Question must be a string');
  }

  if (question.trim().length === 0) {
    throw new Error('Question cannot be empty');
  }

  if (question.length > 2000) {
    throw new Error('Question exceeds 2000 characters');
  }

  if (context !== undefined && typeof context !== 'string') {
    throw new Error('Context must be a string');
  }

  if (context && context.length > 3000) {
    throw new Error('Context exceeds 3000 characters');
  }
}

export function validateOptions(options) {
  if (typeof options !== 'object' || options === null) {
    throw new Error('Options must be an object');
  }

  if (options.model && typeof options.model !== 'string') {
    throw new Error('Model must be a string');
  }

  if (options.temperature !== undefined) {
    if (typeof options.temperature !== 'number' || options.temperature < 0 || options.temperature > 2) {
      throw new Error('Temperature must be a number between 0 and 2');
    }
  }

  if (options.maxTokens !== undefined) {
    if (typeof options.maxTokens !== 'number' || options.maxTokens < 1 || options.maxTokens > 4000) {
      throw new Error('Max tokens must be a number between 1 and 4000');
    }
  }
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .trim();
}

export function validateInput(schema, data) {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      errors: error.errors || [{ message: error.message }]
    };
  }
}