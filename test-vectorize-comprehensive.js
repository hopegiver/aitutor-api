/**
 * 종합적인 Vectorize 테스트 스크립트
 * 벡터 저장, 검색, 필터링 등 모든 기능을 테스트합니다.
 */

import { VectorizeService } from './src/services/vectorize.js';
import { OpenAIService } from './src/services/openai.js';

// Mock Vectorize Index for testing
class MockVectorizeIndex {
  constructor() {
    this.vectors = new Map(); // Store vectors by ID
    this.insertCalls = [];
    this.queryCalls = [];
  }

  async insert(vectors) {
    console.log(`📥 MOCK: Inserting ${vectors.length} vectors`);
    this.insertCalls.push({ vectors, timestamp: new Date().toISOString() });

    // Store each vector
    vectors.forEach(vector => {
      this.vectors.set(vector.id, vector);
    });

    return { inserted: vectors.length };
  }

  async query(options) {
    console.log('🔍 MOCK: Querying vectors with options:', {
      topK: options.topK,
      hasVector: !!options.vector,
      vectorLength: options.vector?.length,
      filter: options.filter,
      includeMetadata: options.includeMetadata
    });

    this.queryCalls.push({ options, timestamp: new Date().toISOString() });

    // Simulate vector search by returning random similarity scores
    const allVectors = Array.from(this.vectors.values());
    let filteredVectors = allVectors;

    // Apply filters if provided
    if (options.filter) {
      filteredVectors = allVectors.filter(vector => {
        return Object.entries(options.filter).every(([key, value]) => {
          return vector.metadata && vector.metadata[key] === value;
        });
      });
    }

    // Generate mock similarity scores (higher for better matches)
    const matches = filteredVectors
      .map(vector => ({
        id: vector.id,
        score: Math.random() * 0.4 + 0.6, // 0.6 to 1.0 range
        metadata: options.includeMetadata ? vector.metadata : undefined,
        values: options.includeValues ? vector.values : undefined
      }))
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, options.topK || 10);

    return { matches };
  }

  async deleteByIds(ids) {
    console.log(`🗑️ MOCK: Deleting ${ids.length} vectors`);
    ids.forEach(id => this.vectors.delete(id));
    return { deleted: ids.length };
  }

  // Helper methods for testing
  getStoredVectorCount() {
    return this.vectors.size;
  }

  getStoredVectors() {
    return Array.from(this.vectors.values());
  }

  getInsertCalls() {
    return this.insertCalls;
  }

  getQueryCalls() {
    return this.queryCalls;
  }

  reset() {
    this.vectors.clear();
    this.insertCalls = [];
    this.queryCalls = [];
  }
}

// Mock OpenAI Service for testing
class MockOpenAIService {
  constructor() {
    this.embeddingCalls = [];
  }

  async createEmbedding(params) {
    console.log(`🔢 MOCK: Creating embedding for text: "${params.input.substring(0, 50)}..."`);

    this.embeddingCalls.push({
      model: params.model,
      input: params.input,
      timestamp: new Date().toISOString()
    });

    // Generate a mock embedding vector (1536 dimensions for text-embedding-3-small)
    const embedding = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);

    return {
      data: [{
        embedding: embedding,
        index: 0
      }]
    };
  }

  getEmbeddingCalls() {
    return this.embeddingCalls;
  }

  reset() {
    this.embeddingCalls = [];
  }
}

// Test utilities
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log(`\n🧪 Running ${this.tests.length} tests...\n`);

    for (const { name, testFn } of this.tests) {
      try {
        console.log(`▶️ ${name}`);
        await testFn();
        console.log(`✅ PASSED: ${name}\n`);
        this.passed++;
      } catch (error) {
        console.error(`❌ FAILED: ${name}`);
        console.error(`   Error: ${error.message}\n`);
        this.failed++;
      }
    }

    console.log(`\n📊 Test Results:`);
    console.log(`   ✅ Passed: ${this.passed}`);
    console.log(`   ❌ Failed: ${this.failed}`);
    console.log(`   📈 Success Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
  }
}

// Helper functions
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertArrayLength(array, expectedLength, message) {
  assert(Array.isArray(array), `Expected array, got ${typeof array}`);
  assert(array.length === expectedLength, `${message} - Expected length ${expectedLength}, got ${array.length}`);
}

function assertObjectHasProperty(obj, property, message) {
  assert(typeof obj === 'object' && obj !== null, `Expected object, got ${typeof obj}`);
  assert(obj.hasOwnProperty(property), `${message} - Object missing property: ${property}`);
}

// Main test execution
async function runVectorizeTests() {
  const runner = new TestRunner();

  // Create mock services
  const mockVectorizeIndex = new MockVectorizeIndex();
  const mockOpenAIService = new MockOpenAIService();
  const vectorizeService = new VectorizeService(mockVectorizeIndex, mockOpenAIService);

  // Test data
  const testContent = {
    contentId: 'test-content-001',
    originalText: `
      안녕하세요, 오늘은 자바스크립트의 기본 개념에 대해 알아보겠습니다.
      먼저 변수에 대해 설명하겠습니다. 변수는 값을 저장하는 공간입니다.
      const, let, var 세 가지 키워드로 변수를 선언할 수 있습니다.
      함수는 재사용 가능한 코드 블록입니다. function 키워드로 정의합니다.
      배열은 여러 값을 순서대로 저장하는 자료구조입니다.
      객체는 키-값 쌍으로 데이터를 저장합니다.
    `,
    summary: '자바스크립트 기본 개념: 변수, 함수, 배열, 객체에 대한 설명',
    segments: [
      { text: '안녕하세요, 오늘은 자바스크립트의 기본 개념에 대해', start: 0, end: 5 },
      { text: '먼저 변수에 대해 설명하겠습니다', start: 5, end: 10 },
      { text: '변수는 값을 저장하는 공간입니다', start: 10, end: 15 },
      { text: 'const, let, var 세 가지 키워드로', start: 15, end: 20 },
      { text: '함수는 재사용 가능한 코드 블록입니다', start: 20, end: 25 },
      { text: '배열은 여러 값을 순서대로 저장', start: 25, end: 30 },
      { text: '객체는 키-값 쌍으로 데이터를 저장', start: 30, end: 35 }
    ],
    metadata: {
      language: 'ko',
      duration: 35,
      title: '자바스크립트 기초 강의'
    }
  };

  // Test 1: Smart Chunking
  runner.test('Smart Chunking - Text splitting and filtering', async () => {
    const chunks = vectorizeService.createSmartChunks(testContent.originalText, 200);

    console.log(`   Generated ${chunks.length} chunks`);
    chunks.forEach((chunk, i) => {
      console.log(`   Chunk ${i + 1} (${chunk.length} chars): ${chunk.substring(0, 60)}...`);
    });

    assert(chunks.length > 0, 'Should generate at least one chunk');
    assert(chunks.every(chunk => chunk.length <= 250), 'All chunks should be within size limit (with some margin)');
    assert(chunks.every(chunk => chunk.trim().length > 20), 'All chunks should be longer than 20 characters');
  });

  // Test 2: Timestamp Extraction
  runner.test('Timestamp Extraction from Segments', async () => {
    const testChunk = '변수는 값을 저장하는 공간입니다';
    const timestamps = vectorizeService.extractTimestampsFromSegments(testContent.segments, testChunk);

    console.log(`   Extracted timestamps:`, timestamps);

    assertObjectHasProperty(timestamps, 'startTime', 'Timestamps should have startTime');
    assertObjectHasProperty(timestamps, 'endTime', 'Timestamps should have endTime');
    assert(timestamps.startTime >= 0, 'Start time should be non-negative');
    assert(timestamps.endTime >= timestamps.startTime, 'End time should be >= start time');
  });

  // Test 3: Embedding Generation
  runner.test('OpenAI Embedding Generation', async () => {
    const testText = '자바스크립트 변수에 대한 설명';
    const embedding = await vectorizeService.generateEmbedding(testText);

    console.log(`   Generated embedding with ${embedding.length} dimensions`);

    assert(Array.isArray(embedding), 'Embedding should be an array');
    assert(embedding.length === 1536, 'Embedding should have 1536 dimensions');
    assert(embedding.every(val => typeof val === 'number'), 'All embedding values should be numbers');

    // Check that OpenAI service was called
    const embeddingCalls = mockOpenAIService.getEmbeddingCalls();
    assert(embeddingCalls.length > 0, 'OpenAI embedding service should have been called');
  });

  // Test 4: Content Indexing
  runner.test('Content Indexing - Full workflow', async () => {
    // Reset mocks
    mockVectorizeIndex.reset();
    mockOpenAIService.reset();

    const result = await vectorizeService.indexContent(
      testContent.contentId,
      testContent.originalText,
      testContent.summary,
      testContent.segments,
      testContent.metadata
    );

    console.log(`   Indexing result:`, result);

    assertObjectHasProperty(result, 'success', 'Result should have success property');
    assert(result.success === true, 'Indexing should be successful');
    assertObjectHasProperty(result, 'chunksIndexed', 'Result should have chunksIndexed count');
    assertObjectHasProperty(result, 'summaryIndexed', 'Result should have summaryIndexed count');
    assertObjectHasProperty(result, 'totalVectors', 'Result should have totalVectors count');

    // Check that vectors were actually stored
    const storedVectors = mockVectorizeIndex.getStoredVectors();
    console.log(`   Stored ${storedVectors.length} vectors in index`);

    assert(storedVectors.length > 0, 'Should have stored vectors in index');
    assert(storedVectors.length === result.totalVectors, 'Stored vector count should match result');

    // Check vector structure
    const sampleVector = storedVectors[0];
    assertObjectHasProperty(sampleVector, 'id', 'Vector should have ID');
    assertObjectHasProperty(sampleVector, 'values', 'Vector should have values (embedding)');
    assertObjectHasProperty(sampleVector, 'metadata', 'Vector should have metadata');

    // Check metadata structure
    const metadata = sampleVector.metadata;
    assertObjectHasProperty(metadata, 'contentId', 'Metadata should have contentId');
    assertObjectHasProperty(metadata, 'type', 'Metadata should have type');
    assertObjectHasProperty(metadata, 'text', 'Metadata should have text');
    assert(metadata.contentId === testContent.contentId, 'ContentId should match');
  });

  // Test 5: Vector Search - Basic functionality
  runner.test('Vector Search - Basic search', async () => {
    const searchQuery = '자바스크립트 변수 설명';
    const searchResult = await vectorizeService.searchContent(searchQuery, {
      topK: 5,
      includeMetadata: true
    });

    console.log(`   Search query: "${searchQuery}"`);
    console.log(`   Found ${searchResult.results.length} results`);

    assertObjectHasProperty(searchResult, 'query', 'Search result should have query');
    assertObjectHasProperty(searchResult, 'results', 'Search result should have results');
    assertObjectHasProperty(searchResult, 'total', 'Search result should have total');

    assert(searchResult.query === searchQuery, 'Query should match input');
    assert(Array.isArray(searchResult.results), 'Results should be an array');
    assert(searchResult.total >= 0, 'Total should be non-negative');

    if (searchResult.results.length > 0) {
      const firstResult = searchResult.results[0];
      assertObjectHasProperty(firstResult, 'id', 'Result should have id');
      assertObjectHasProperty(firstResult, 'score', 'Result should have score');
      assertObjectHasProperty(firstResult, 'contentId', 'Result should have contentId');
      assertObjectHasProperty(firstResult, 'text', 'Result should have text');

      assert(typeof firstResult.score === 'number', 'Score should be a number');
      assert(firstResult.score >= 0 && firstResult.score <= 1, 'Score should be between 0 and 1');
    }
  });

  // Test 6: Vector Search - With filters
  runner.test('Vector Search - With content filter', async () => {
    const searchResult = await vectorizeService.searchContent('변수', {
      topK: 3,
      contentId: testContent.contentId,
      type: 'transcript',
      language: 'ko'
    });

    console.log(`   Filtered search found ${searchResult.results.length} results`);

    if (searchResult.results.length > 0) {
      searchResult.results.forEach((result, i) => {
        console.log(`   Result ${i + 1}: ${result.text?.substring(0, 50)}... (score: ${result.score?.toFixed(3)})`);
        assert(result.contentId === testContent.contentId, 'Result should match contentId filter');
        assert(result.type === 'transcript' || result.type === 'summary', 'Result should match type filter');
      });
    }

    // Check that vectorize query was called with correct filter
    const queryCalls = mockVectorizeIndex.getQueryCalls();
    const lastQuery = queryCalls[queryCalls.length - 1];
    assert(lastQuery.options.filter, 'Query should have filter options');
    assert(lastQuery.options.filter.contentId === testContent.contentId, 'Filter should include contentId');
  });

  // Test 7: Content Context for AI Chat
  runner.test('Content Context Generation for AI Chat', async () => {
    const contextQuery = '함수에 대해 설명해주세요';
    const context = await vectorizeService.getContentContext(contextQuery, 3);

    console.log(`   Context query: "${contextQuery}"`);
    console.log(`   Has context: ${context.hasContext}`);

    assertObjectHasProperty(context, 'hasContext', 'Context should have hasContext property');
    assertObjectHasProperty(context, 'context', 'Context should have context property');
    assertObjectHasProperty(context, 'sources', 'Context should have sources property');

    if (context.hasContext) {
      assert(typeof context.context === 'string', 'Context should be a string');
      assert(context.context.length > 0, 'Context should not be empty');
      assert(Array.isArray(context.sources), 'Sources should be an array');

      console.log(`   Generated context (${context.context.length} chars):`);
      console.log(`   ${context.context.substring(0, 200)}...`);

      if (context.sources.length > 0) {
        console.log(`   Sources: ${context.sources.length} items`);
        context.sources.forEach((source, i) => {
          console.log(`     Source ${i + 1}: ${source.contentId} (${source.type}, score: ${source.score?.toFixed(3)})`);
        });
      }
    }
  });

  // Test 8: Search Query Call Analysis
  runner.test('Search Query Call Analysis', async () => {
    const queryCalls = mockVectorizeIndex.getQueryCalls();
    console.log(`   Total vector queries made: ${queryCalls.length}`);

    assert(queryCalls.length > 0, 'Should have made query calls to vectorize');

    queryCalls.forEach((call, i) => {
      console.log(`   Query ${i + 1}:`);
      console.log(`     - Vector length: ${call.options.vector?.length || 'N/A'}`);
      console.log(`     - TopK: ${call.options.topK || 'N/A'}`);
      console.log(`     - Include metadata: ${call.options.includeMetadata}`);
      console.log(`     - Filter: ${JSON.stringify(call.options.filter || {})}`);

      assert(call.options.vector, 'Query should include vector');
      assert(Array.isArray(call.options.vector), 'Query vector should be an array');
      assert(call.options.vector.length === 1536, 'Query vector should have 1536 dimensions');
    });
  });

  // Test 9: Vector Storage Analysis
  runner.test('Vector Storage Analysis', async () => {
    const storedVectors = mockVectorizeIndex.getStoredVectors();
    console.log(`   Total vectors stored: ${storedVectors.length}`);

    if (storedVectors.length > 0) {
      // Analyze vector types
      const vectorsByType = {};
      storedVectors.forEach(vector => {
        const type = vector.metadata?.type || 'unknown';
        vectorsByType[type] = (vectorsByType[type] || 0) + 1;
      });

      console.log(`   Vector breakdown by type:`);
      Object.entries(vectorsByType).forEach(([type, count]) => {
        console.log(`     - ${type}: ${count} vectors`);
      });

      // Check embedding dimensions
      const firstVector = storedVectors[0];
      assert(Array.isArray(firstVector.values), 'Vector values should be an array');
      assert(firstVector.values.length === 1536, 'Vector should have 1536 dimensions');

      // Check for required metadata fields
      const requiredFields = ['contentId', 'type', 'text', 'chunkIndex', 'language', 'createdAt'];
      requiredFields.forEach(field => {
        assert(firstVector.metadata.hasOwnProperty(field), `Vector metadata should have ${field}`);
      });
    }
  });

  // Test 10: Error Handling
  runner.test('Error Handling - Invalid queries', async () => {
    // Test empty query
    const emptyResult = await vectorizeService.searchContent('', { topK: 5 });
    assert(emptyResult.results, 'Should handle empty query gracefully');

    // Test with non-existent content filter
    const noMatchResult = await vectorizeService.searchContent('test', {
      contentId: 'non-existent-content'
    });
    assert(Array.isArray(noMatchResult.results), 'Should return empty array for non-existent content');
  });

  // Run all tests
  await runner.run();

  // Final analysis
  console.log('\n🔍 Final Analysis:');
  console.log(`📊 Mock Statistics:`);
  console.log(`   - Total vectors stored: ${mockVectorizeIndex.getStoredVectorCount()}`);
  console.log(`   - Total insert calls: ${mockVectorizeIndex.getInsertCalls().length}`);
  console.log(`   - Total query calls: ${mockVectorizeIndex.getQueryCalls().length}`);
  console.log(`   - Total embedding calls: ${mockOpenAIService.getEmbeddingCalls().length}`);

  if (runner.failed === 0) {
    console.log('\n🎉 All tests passed! Vectorize service appears to be working correctly.');
    console.log('\n💡 Next steps for debugging real Vectorize issues:');
    console.log('   1. Check if vectors are actually being stored in Cloudflare Vectorize');
    console.log('   2. Verify embedding generation is working with real OpenAI API');
    console.log('   3. Test with actual Vectorize query API calls');
    console.log('   4. Check filter syntax compatibility with Cloudflare Vectorize');
  } else {
    console.log('\n⚠️ Some tests failed. Review the errors above to identify issues.');
  }
}

// Run the tests
console.log('🚀 Starting Comprehensive Vectorize Tests...');
runVectorizeTests().catch(console.error);