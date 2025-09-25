export function createErrorResponse(message, status = 400, code = 'ERROR') {
  return {
    error: message,
    code,
    timestamp: new Date().toISOString()
  };
}

export function parseSSEStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    start(controller) {
      function pump() {
        return reader.read().then(({ done, value }) => {
          if (done) {
            controller.close();
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(new TextEncoder().encode(content));
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
          return pump();
        });
      }
      return pump();
    }
  });
}

export function createSSEResponse(stream) {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}