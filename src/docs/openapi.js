export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "AI Tutor API",
    version: "1.0.0",
    description: "AI-powered chat and quiz generation API with mandatory JWT authentication using Azure OpenAI and Cloudflare Workers",
    contact: {
      name: "API Support",
      url: "https://github.com/hopegiver/aitutor-api"
    }
  },
  servers: [
    {
      url: "https://aitutor.apiserver.kr",
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
        description: "Check API server status with detailed Cloudflare region information",
        responses: {
          200: {
            description: "Server is healthy with region details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    version: { type: "string", example: "v1" },
                    timestamp: { type: "string", format: "date-time" },
                    region: {
                      type: "object",
                      properties: {
                        country: { type: "string", example: "US" },
                        region: { type: "string", example: "California" },
                        city: { type: "string", example: "San Francisco" },
                        datacenter: { type: "string", example: "SJC" },
                        timezone: { type: "string", example: "America/Los_Angeles" },
                        latitude: { type: "string", example: "37.7749" },
                        longitude: { type: "string", example: "-122.4194" }
                      }
                    },
                    cfHeaders: { type: "object" },
                    environment: { type: "string", example: "production" },
                    allCfData: { type: "object" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/auth": {
      post: {
        tags: ["Authentication"],
        summary: "Authenticate and get JWT token",
        description: "Authenticate using domain and auth key to receive a JWT token for API access",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domain", "authKey"],
                properties: {
                  domain: {
                    type: "string",
                    example: "example.com",
                    description: "The domain to authenticate"
                  },
                  authKey: {
                    type: "string",
                    example: "a1b2c3d4e5f6...",
                    description: "SHA256 hash of domain + secret key"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Authentication successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Domain verified successfully" },
                    token: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
                    domain: { type: "string", example: "example.com" },
                    expiresIn: { type: "string", example: "24h" },
                    domainInfo: {
                      type: "object",
                      properties: {
                        tier: { type: "string", example: "standard" },
                        maxRequestsPerDay: { type: "integer", example: 1000 },
                        features: { type: "array", items: { type: "string" }, example: ["chat", "quiz"] }
                      }
                    },
                    timestamp: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          },
          400: {
            description: "Bad request - Invalid input",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          401: {
            description: "Authentication failed - Invalid domain or auth key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/auth/generate": {
      post: {
        tags: ["Authentication"],
        summary: "Generate auth key for domain",
        description: "Generate an authentication key for a domain using master password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domain", "password"],
                properties: {
                  domain: {
                    type: "string",
                    example: "example.com",
                    description: "The domain to generate auth key for"
                  },
                  password: {
                    type: "string",
                    example: "master_password",
                    description: "Master password for auth key generation"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Auth key generated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Auth key generated successfully" },
                    domain: { type: "string", example: "example.com" },
                    authKey: { type: "string", example: "a1b2c3d4e5f6..." },
                    timestamp: { type: "string", format: "date-time" },
                    usage: {
                      type: "object",
                      properties: {
                        description: { type: "string", example: "Use this authKey with the domain to authenticate via POST /v1/auth" },
                        example: {
                          type: "object",
                          properties: {
                            domain: { type: "string", example: "example.com" },
                            authKey: { type: "string", example: "a1b2c3d4e5f6..." }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          400: {
            description: "Bad request - Invalid input",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          401: {
            description: "Invalid password",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
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
        description: "Send messages to AI and receive streaming responses (requires authentication)",
        security: [{ BearerAuth: [] }],
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
          },
          401: {
            description: "Authentication required",
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
        description: "Send a simple message with optional system prompt (requires authentication)",
        security: [{ BearerAuth: [] }],
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
          },
          401: {
            description: "Authentication required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/quiz": {
      post: {
        tags: ["Quiz"],
        summary: "Generate basic quiz",
        description: "Create quiz questions about a specific topic with streaming response (requires authentication)",
        security: [{ BearerAuth: [] }],
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
                    maximum: 10,
                    default: 5,
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
          },
          401: {
            description: "Authentication required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/quiz/generate": {
      post: {
        tags: ["Quiz"],
        summary: "Generate advanced quiz",
        description: "Create structured quiz with difficulty levels and question types (requires authentication)",
        security: [{ BearerAuth: [] }],
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
                  difficulty: {
                    type: "string",
                    enum: ["beginner", "intermediate", "advanced"],
                    default: "intermediate",
                    example: "intermediate"
                  },
                  type: {
                    type: "string",
                    enum: ["multiple-choice", "true-false", "short-answer"],
                    default: "multiple-choice",
                    example: "multiple-choice"
                  },
                  questionCount: {
                    type: "integer",
                    minimum: 1,
                    maximum: 10,
                    default: 5,
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
            description: "Streaming structured quiz with JSON format",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string",
                  description: "Streaming JSON quiz format with title, difficulty, and questions array"
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
          },
          401: {
            description: "Authentication required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/transcribe/upload-url": {
      post: {
        tags: ["Transcribe"],
        summary: "Start video transcription",
        description: "Upload video URL for transcription processing (requires authentication)",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["videoUrl"],
                properties: {
                  videoUrl: {
                    type: "string",
                    format: "uri",
                    example: "https://example.com/video.mp4",
                    description: "URL of the video to transcribe"
                  },
                  language: {
                    type: "string",
                    default: "ko-KR",
                    example: "ko-KR",
                    description: "Language code for transcription (ISO 639-1)"
                  },
                  options: {
                    type: "object",
                    properties: {
                      format: {
                        type: "string",
                        enum: ["srt", "vtt", "json"],
                        default: "srt",
                        example: "srt",
                        description: "Output format for transcription"
                      },
                      timestamps: {
                        type: "boolean",
                        default: true,
                        example: true,
                        description: "Include timestamps in transcription"
                      },
                      wordTimestamps: {
                        type: "boolean",
                        default: false,
                        example: false,
                        description: "Include word-level timestamps"
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
            description: "Transcription job created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        jobId: { type: "string", format: "uuid", example: "123e4567-e89b-12d3-a456-426614174000" },
                        status: { type: "string", example: "queued" },
                        statusUrl: { type: "string", example: "/v1/transcribe/status/123e4567-e89b-12d3-a456-426614174000" },
                        resultUrl: { type: "string", example: "/v1/transcribe/result/123e4567-e89b-12d3-a456-426614174000" }
                      }
                    }
                  }
                }
              }
            }
          },
          400: {
            description: "Bad request - Invalid video URL or parameters",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          401: {
            description: "Authentication required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/transcribe/status/{jobId}": {
      get: {
        tags: ["Transcribe"],
        summary: "Get transcription job status",
        description: "Check the current status of a transcription job (requires authentication)",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: {
              type: "string",
              format: "uuid"
            },
            description: "Unique job identifier"
          }
        ],
        responses: {
          200: {
            description: "Job status retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        jobId: { type: "string", format: "uuid" },
                        status: {
                          type: "string",
                          enum: ["queued", "processing", "completed", "failed"],
                          example: "processing"
                        },
                        progress: {
                          type: "object",
                          properties: {
                            stage: { type: "string", example: "transcribing" },
                            percentage: { type: "integer", minimum: 0, maximum: 100, example: 75 },
                            message: { type: "string", example: "Transcribing audio with Whisper" }
                          }
                        },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                        error: {
                          type: "object",
                          properties: {
                            message: { type: "string" },
                            timestamp: { type: "string", format: "date-time" }
                          },
                          description: "Present only when status is 'failed'"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          404: {
            description: "Job not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          401: {
            description: "Authentication required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/v1/transcribe/result/{jobId}": {
      get: {
        tags: ["Transcribe"],
        summary: "Get transcription result",
        description: "Retrieve the completed transcription result (requires authentication)",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: {
              type: "string",
              format: "uuid"
            },
            description: "Unique job identifier"
          }
        ],
        responses: {
          200: {
            description: "Transcription result retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        jobId: { type: "string", format: "uuid" },
                        status: { type: "string", example: "completed" },
                        result: {
                          type: "object",
                          properties: {
                            text: { type: "string", description: "Full transcribed text" },
                            language: { type: "string", example: "ko" },
                            duration: { type: "number", example: 120.5 },
                            segments: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  start: { type: "number", example: 0.0 },
                                  end: { type: "number", example: 5.2 },
                                  text: { type: "string", example: "Hello world" }
                                }
                              }
                            },
                            srt: { type: "string", description: "SRT format subtitle (if requested)" },
                            vtt: { type: "string", description: "VTT format subtitle (if requested)" }
                          }
                        },
                        metadata: {
                          type: "object",
                          properties: {
                            language: { type: "string", example: "ko-KR" },
                            options: { type: "object" },
                            duration: { type: "number", example: 120.5 },
                            wordCount: { type: "integer", example: 250 },
                            completedAt: { type: "string", format: "date-time" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          400: {
            description: "Job not completed yet",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          404: {
            description: "Job or result not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          401: {
            description: "Authentication required",
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
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token obtained from /v1/auth endpoint"
      }
    },
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
      name: "Authentication",
      description: "Domain-based authentication and JWT token management"
    },
    {
      name: "Chat",
      description: "AI chat functionality (requires authentication)"
    },
    {
      name: "Quiz",
      description: "Quiz generation and management endpoints (requires authentication)"
    },
    {
      name: "Transcribe",
      description: "Video transcription and subtitle generation endpoints (requires authentication)"
    }
  ]
};