import { Hono } from 'hono';
import { OpenAIService } from '../services/openai.js';
import { KVService } from '../services/kv.js';
import { createErrorResponse, createSuccessResponse } from '../utils/responses.js';

const quiz = new Hono();

// Get quiz questions based on content ID (콘텐츠 ID 필수)
quiz.get('/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    // Initialize KV service
    const kvService = new KVService(c.env.AITUTOR_KV);

    // First try to get pre-generated quiz
    const quizData = await kvService.get(KVService.contentKey('quiz', contentId));

    if (quizData) {
      return c.json(createSuccessResponse({
        contentId,
        quiz: quizData.quiz,
        totalQuestions: quizData.totalQuestions,
        language: quizData.language,
        videoUrl: quizData.videoUrl,
        createdAt: quizData.createdAt,
        type: 'pre-generated'
      }));
    }

    // If no pre-generated quiz, generate dynamically from content
    const summaryData = await kvService.get(KVService.contentKey('summary', contentId));

    if (!summaryData) {
      return c.json(createErrorResponse('Content not found for quiz generation', 404), 404);
    }

    // Initialize OpenAI service for dynamic quiz generation
    const openaiService = new OpenAIService(c.env.OPENAI_API_KEY, c.env.CLOUDFLARE_ACCOUNT_ID);

    // Generate quiz from full content
    const generatedQuiz = await generateQuizFromContent(
      summaryData.originalText,
      summaryData.language,
      openaiService
    );

    const responseData = {
      contentId,
      quiz: generatedQuiz,
      totalQuestions: generatedQuiz.length,
      language: summaryData.language,
      videoUrl: summaryData.videoUrl,
      createdAt: new Date().toISOString(),
      type: 'dynamically-generated'
    };

    // Cache the generated quiz for future requests
    await kvService.set(KVService.contentKey('quiz', contentId), responseData);

    return c.json(createSuccessResponse(responseData));

  } catch (error) {
    console.error('Error getting quiz questions:', error);
    return c.json(createErrorResponse('Failed to get quiz questions', 500), 500);
  }
});

// Helper function to generate quiz from content
async function generateQuizFromContent(text, language, openaiService) {
  const maxChunkLength = 2500; // Optimal size for meaningful quiz questions
  const targetQuestionsPerChunk = 6;
  const maxTotalQuestions = 20;

  try {
    if (text.length <= maxChunkLength) {
      // Generate questions from single chunk
      return await generateQuizChunk(text, language, Math.min(maxTotalQuestions, targetQuestionsPerChunk), openaiService);
    } else {
      // Split into chunks and generate questions
      const chunks = splitTextIntoChunks(text, maxChunkLength);
      const questionsPerChunk = Math.min(targetQuestionsPerChunk, Math.ceil(maxTotalQuestions / chunks.length));

      const allQuestions = [];

      for (let i = 0; i < chunks.length && allQuestions.length < maxTotalQuestions; i++) {
        const chunk = chunks[i];
        const questionsNeeded = Math.min(questionsPerChunk, maxTotalQuestions - allQuestions.length);

        const chunkQuestions = await generateQuizChunk(chunk, language, questionsNeeded, openaiService);
        allQuestions.push(...chunkQuestions);

        // Small delay to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return allQuestions.slice(0, maxTotalQuestions);
    }
  } catch (error) {
    console.error('Error generating quiz from content:', error);
    return [];
  }
}

// Helper function to generate quiz questions from a single chunk
async function generateQuizChunk(text, language, questionCount, openaiService) {
  const messages = [
    {
      role: 'system',
      content: `You are a quiz generator. Create ${questionCount} high-quality multiple choice questions from the given content.

Response Format (MUST follow exactly):
[
  {"question": "question 1", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "explanation"},
  {"question": "question 2", "options": ["A", "B", "C", "D"], "answer": 1, "explanation": "explanation"}
]

Guidelines:
- Generate exactly ${questionCount} questions
- Each question should test understanding of key concepts from the content
- Provide 4 answer options (A, B, C, D) for each question
- Include the correct answer index (0-3) and a brief explanation
- Questions should be practical and educational
- Avoid overly simple or overly complex questions
- Focus on the most important concepts in the content
- Respond in ${language === 'ko' ? 'Korean' : 'English'} language`
    },
    {
      role: 'user',
      content: `Generate ${questionCount} quiz questions from this content:\n\n${text}`
    }
  ];

  try {
    const response = await openaiService.createChatCompletion({
      messages,
      model: 'gpt-4o-mini',
      max_tokens: 800,
      temperature: 0.3
    });

    const responseText = response.choices[0].message.content.trim();

    // Remove markdown code blocks if present
    const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    try {
      return JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Error parsing quiz response:', parseError);
      return [];
    }
  } catch (error) {
    console.error('Error generating quiz chunk:', error);
    return [];
  }
}

// Helper function to split text into chunks
function splitTextIntoChunks(text, maxLength) {
  const chunks = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + trimmedSentence;

    if (potentialChunk.length <= maxLength) {
      currentChunk = potentialChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk + '.');
      }
      currentChunk = trimmedSentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk + (currentChunk.endsWith('.') ? '' : '.'));
  }

  return chunks;
}

export default quiz;