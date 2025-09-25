export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "AI Tutor API",
    version: "1.0.0",
    description: "AI-powered tutoring API using OpenAI and Cloudflare Workers",
    contact: {
      name: "API Support",
      url: "https://github.com/hopegiver/aitutor-api"
    }
  },
  servers: [
    {
      url: "https://aitutor-api.your-domain.workers.dev",
      description: "Production server"
    },
    {
      url: "http://localhost:8787",
      description: "Development server"
    }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        description: "Check if the API server is running",
        responses: {
          200: {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    version: { type: "string", example: "v1" },
                    timestamp: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/chat": {
      post: {
        tags: ["Chat"],
        summary: "Chat with AI",
        description: "Send messages to AI and receive streaming responses",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["messages"],
                properties: {
                  messages: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        role: {
                          type: "string",
                          enum: ["system", "user", "assistant"],
                          example: "user"
                        },
                        content: {
                          type: "string",
                          example: "Hello, how are you?"
                        }
                      },
                      required: ["role", "content"]
                    }
                  },
                  options: {
                    type: "object",
                    properties: {
                      model: {
                        type: "string",
                        example: "gpt-4o-mini"
                      },
                      temperature: {
                        type: "number",
                        minimum: 0,
                        maximum: 2,
                        example: 0.7
                      },
                      maxTokens: {
                        type: "integer",
                        minimum: 1,
                        maximum: 4000,
                        example: 500
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Streaming AI response",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string",
                  description: "Server-sent events stream with AI response"
                }
              }
            }
          },
          400: {
            description: "Bad request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/chat/simple": {
      post: {
        tags: ["Chat"],
        summary: "Simple chat message",
        description: "Send a simple message with optional system prompt",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: {
                    type: "string",
                    example: "Explain quantum physics"
                  },
                  systemPrompt: {
                    type: "string",
                    example: "You are a helpful physics teacher"
                  },
                  options: { $ref: "#/components/schemas/AIOptions" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Streaming AI response",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string"
                }
              }
            }
          },
          400: {
            description: "Bad request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/tutor": {
      post: {
        tags: ["Tutoring"],
        summary: "AI tutoring session",
        description: "Get educational tutoring with context-aware responses",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["question"],
                properties: {
                  question: {
                    type: "string",
                    example: "What is photosynthesis?"
                  },
                  context: {
                    type: "string",
                    example: "I'm a high school student learning biology"
                  },
                  options: { $ref: "#/components/schemas/AIOptions" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Streaming tutoring response",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string"
                }
              }
            }
          },
          400: {
            description: "Bad request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/tutor/explain": {
      post: {
        tags: ["Tutoring"],
        summary: "Explain a topic",
        description: "Get detailed explanations of specific topics at different levels",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["topic"],
                properties: {
                  topic: {
                    type: "string",
                    example: "Machine Learning"
                  },
                  level: {
                    type: "string",
                    enum: ["beginner", "intermediate", "advanced"],
                    example: "intermediate"
                  },
                  options: { $ref: "#/components/schemas/AIOptions" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Streaming explanation",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string"
                }
              }
            }
          },
          400: {
            description: "Bad request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/tutor/quiz": {
      post: {
        tags: ["Tutoring"],
        summary: "Generate quiz questions",
        description: "Create quiz questions about specific topics",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["topic"],
                properties: {
                  topic: {
                    type: "string",
                    example: "World History"
                  },
                  questionCount: {
                    type: "integer",
                    minimum: 1,
                    maximum: 20,
                    example: 5
                  },
                  options: { $ref: "#/components/schemas/AIOptions" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Streaming quiz questions",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string"
                }
              }
            }
          },
          400: {
            description: "Bad request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      AIOptions: {
        type: "object",
        properties: {
          model: {
            type: "string",
            example: "gpt-4o-mini"
          },
          temperature: {
            type: "number",
            minimum: 0,
            maximum: 2,
            example: 0.7
          },
          maxTokens: {
            type: "integer",
            minimum: 1,
            maximum: 4000,
            example: 500
          }
        }
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "string",
            example: "Invalid input provided"
          },
          code: {
            type: "string",
            example: "VALIDATION_ERROR"
          },
          timestamp: {
            type: "string",
            format: "date-time"
          }
        }
      }
    }
  },
  tags: [
    {
      name: "System",
      description: "System health and status endpoints"
    },
    {
      name: "Chat",
      description: "General chat functionality"
    },
    {
      name: "Tutoring",
      description: "Educational tutoring endpoints"
    }
  ]
};