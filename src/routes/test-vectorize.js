import { Hono } from 'hono';
import { OpenAIService } from '../services/openai.js';
import { VectorizeService } from '../services/vectorize.js';
import { createErrorResponse, createSuccessResponse } from '../utils/responses.js';

const testVectorize = new Hono();

// Test OpenAI embedding generation
testVectorize.post('/test-embedding', async (c) => {
  try {
    const { text } = await c.req.json();

    if (!text) {
      return c.json(createErrorResponse('Text is required', 400), 400);
    }

    const openaiService = new OpenAIService(c.env);

    console.log('Testing embedding generation for text:', text.substring(0, 100));

    const embeddingResponse = await openaiService.createEmbedding({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });

    console.log('Embedding response received:', {
      model: embeddingResponse.model,
      usage: embeddingResponse.usage,
      dataLength: embeddingResponse.data?.length,
      firstEmbeddingLength: embeddingResponse.data?.[0]?.embedding?.length
    });

    const embedding = embeddingResponse.data[0].embedding;

    return c.json(createSuccessResponse({
      text: text.substring(0, 100) + '...',
      embeddingDimensions: embedding.length,
      embeddingPreview: embedding.slice(0, 5),
      model: embeddingResponse.model,
      usage: embeddingResponse.usage
    }));

  } catch (error) {
    console.error('Embedding test error:', error);
    return c.json(createErrorResponse(`Embedding test failed: ${error.message}`, 500), 500);
  }
});

// Test Vectorize insert operation
testVectorize.post('/test-insert', async (c) => {
  try {
    const { text, testId } = await c.req.json();

    if (!text || !testId) {
      return c.json(createErrorResponse('Text and testId are required', 400), 400);
    }

    const openaiService = new OpenAIService(c.env);

    const vectorizeService = new VectorizeService(
      c.env.CONTENT_VECTORIZE,
      openaiService
    );

    console.log('Testing Vectorize insert for:', { testId, textLength: text.length });

    // Generate embedding
    const embedding = await vectorizeService.generateEmbedding(text);
    console.log('Generated embedding dimensions:', embedding.length);

    // Create test vector
    const testVector = {
      id: `test-${testId}`,
      values: embedding,
      metadata: {
        contentId: testId,
        type: 'test',
        text: text.substring(0, 200),
        testTimestamp: new Date().toISOString()
      }
    };

    console.log('Inserting test vector:', {
      id: testVector.id,
      dimensions: testVector.values.length,
      metadataKeys: Object.keys(testVector.metadata)
    });

    // Insert into Vectorize
    await c.env.CONTENT_VECTORIZE.insert([testVector]);
    console.log('✅ Successfully inserted test vector');

    return c.json(createSuccessResponse({
      testId,
      vectorId: testVector.id,
      dimensions: embedding.length,
      textPreview: text.substring(0, 100),
      status: 'inserted'
    }));

  } catch (error) {
    console.error('Vectorize insert test error:', error);
    return c.json(createErrorResponse(`Insert test failed: ${error.message}`, 500), 500);
  }
});

// Test Vectorize query operation
testVectorize.post('/test-query', async (c) => {
  try {
    const { query, topK = 3 } = await c.req.json();

    if (!query) {
      return c.json(createErrorResponse('Query is required', 400), 400);
    }

    const openaiService = new OpenAIService(c.env);

    console.log('Testing Vectorize query for:', query);

    const vectorizeService = new VectorizeService(
      c.env.CONTENT_VECTORIZE,
      openaiService
    );

    // Generate query embedding using VectorizeService
    console.log('Generating query embedding using VectorizeService...');
    let queryEmbedding;
    try {
      queryEmbedding = await vectorizeService.generateEmbedding(query);
      console.log('Query embedding generated successfully, dimensions:', queryEmbedding?.length);
    } catch (embeddingError) {
      console.error('VectorizeService embedding generation failed:', embeddingError);
      // Fallback to direct OpenAI call
      console.log('Falling back to direct OpenAI embedding generation...');
      const embeddingResponse = await openaiService.createEmbedding({
        model: 'text-embedding-3-small',
        input: query,
        encoding_format: 'float'
      });
      queryEmbedding = embeddingResponse.data[0].embedding;
      console.log('Fallback embedding dimensions:', queryEmbedding.length);
    }

    // Query Vectorize
    const results = await c.env.CONTENT_VECTORIZE.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      includeValues: false
    });

    console.log('Query results:', {
      matchCount: results.matches?.length || 0,
      matches: results.matches?.map(m => ({ id: m.id, score: m.score }))
    });

    return c.json(createSuccessResponse({
      query,
      queryDimensions: queryEmbedding.length,
      matchCount: results.matches?.length || 0,
      results: results.matches?.map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata
      })) || []
    }));

  } catch (error) {
    console.error('Vectorize query test error:', error);
    return c.json(createErrorResponse(`Query test failed: ${error.message}`, 500), 500);
  }
});

// Test complete workflow
testVectorize.post('/test-workflow', async (c) => {
  try {
    const { text } = await c.req.json();

    if (!text) {
      return c.json(createErrorResponse('Text is required', 400), 400);
    }

    const testId = `workflow-${Date.now()}`;

    console.log('Testing complete Vectorize workflow...');

    // Step 1: Insert test data
    const insertResponse = await fetch(`${c.req.url.replace('/test-workflow', '/test-insert')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': c.req.header('Authorization')
      },
      body: JSON.stringify({ text, testId })
    });

    const insertResult = await insertResponse.json();
    if (!insertResult.success) {
      throw new Error(`Insert failed: ${insertResult.message}`);
    }

    // Step 2: Wait a moment for indexing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Query for the inserted data
    const queryResponse = await fetch(`${c.req.url.replace('/test-workflow', '/test-query')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': c.req.header('Authorization')
      },
      body: JSON.stringify({ query: text.substring(0, 50), topK: 5 })
    });

    const queryResult = await queryResponse.json();

    return c.json(createSuccessResponse({
      testId,
      insertResult: insertResult.data,
      queryResult: queryResult.data,
      workflow: 'completed'
    }));

  } catch (error) {
    console.error('Workflow test error:', error);
    return c.json(createErrorResponse(`Workflow test failed: ${error.message}`, 500), 500);
  }
});

export default testVectorize;