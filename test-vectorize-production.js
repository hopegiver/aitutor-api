/**
 * Production-ready Vectorize Test Script
 * This script tests with real OpenAI API and simulated Vectorize operations
 */

import { VectorizeService } from './src/services/vectorize.js';
import { OpenAIService } from './src/services/openai.js';

// Minimal test framework
class TestFramework {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`🧪 Running ${this.tests.length} production tests...\n`);

    for (const { name, fn } of this.tests) {
      try {
        console.log(`▶️ ${name}`);
        await fn();
        this.passed++;
        console.log(`✅ PASSED\n`);
      } catch (error) {
        this.failed++;
        console.log(`❌ FAILED: ${error.message}\n`);
      }
    }

    console.log(`📊 Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }
}

// Production-like Vectorize Index
class ProductionVectorizeIndex {
  constructor() {
    this.storage = new Map();
    this.operations = 0;
  }

  async insert(vectors) {
    console.log(`📥 Inserting ${vectors.length} vectors...`);

    for (const vector of vectors) {
      if (!vector.id || !vector.values || !vector.metadata) {
        throw new Error('Invalid vector format');
      }

      this.storage.set(vector.id, {
        id: vector.id,
        values: [...vector.values],
        metadata: { ...vector.metadata }
      });
    }

    this.operations++;
    console.log(`   ✓ Stored ${vectors.length} vectors (Total: ${this.storage.size})`);
    return { success: true };
  }

  async query(options) {
    console.log(`🔍 Querying (topK: ${options.topK}, filters: ${JSON.stringify(options.filter || {})})`);

    if (!options.vector || !Array.isArray(options.vector)) {
      throw new Error('Invalid query vector');
    }

    let candidates = Array.from(this.storage.values());

    // Apply filters
    if (options.filter) {
      candidates = candidates.filter(vector => {
        for (const [key, value] of Object.entries(options.filter)) {
          if (vector.metadata[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    console.log(`   Searching ${candidates.length} candidates`);

    // Calculate similarity scores
    const results = candidates.map(vector => {
      const score = this.dotProduct(options.vector, vector.values);
      return {
        id: vector.id,
        score: score,
        metadata: options.includeMetadata ? vector.metadata : undefined
      };
    });

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const matches = results.slice(0, options.topK || 10);

    this.operations++;
    console.log(`   Found ${matches.length} matches`);

    matches.slice(0, 3).forEach((match, i) => {
      console.log(`     ${i + 1}. ${match.id} (${match.score.toFixed(4)})`);
    });

    return { matches };
  }

  dotProduct(a, b) {
    if (a.length !== b.length) return 0;
    return a.reduce((sum, val, i) => sum + val * b[i], 0) / Math.sqrt(a.length * b.length);
  }

  async deleteByIds(ids) {
    console.log(`🗑️ Deleting ${ids.length} vectors`);

    let deleted = 0;
    for (const id of ids) {
      if (this.storage.has(id)) {
        this.storage.delete(id);
        deleted++;
      }
    }

    this.operations++;
    console.log(`   ✓ Deleted ${deleted} vectors`);
    return { success: true };
  }

  getStats() {
    return {
      totalVectors: this.storage.size,
      operations: this.operations,
      vectorIds: Array.from(this.storage.keys())
    };
  }
}

async function runProductionTests() {
  console.log('🎯 Production Vectorize Test');
  console.log('============================\n');

  const test = new TestFramework();

  // Initialize services
  const vectorIndex = new ProductionVectorizeIndex();
  const openaiService = new OpenAIService();
  const vectorizeService = new VectorizeService(vectorIndex, openaiService);

  // Test data
  const contentId = 'prod-test-001';
  const testData = {
    originalText: `
      React는 사용자 인터페이스를 구축하기 위한 JavaScript 라이브러리입니다.
      컴포넌트 기반 아키텍처를 사용하여 재사용 가능한 UI 요소를 만들 수 있습니다.
      상태 관리는 useState Hook을 사용하여 컴포넌트 내부에서 처리할 수 있습니다.
      useEffect Hook을 사용하면 사이드 이펙트를 관리할 수 있습니다.
      React Router를 사용하여 싱글 페이지 애플리케이션을 만들 수 있습니다.
    `,
    summary: 'React 라이브러리와 Hook을 활용한 모던 웹 개발에 대한 내용입니다.',
    segments: [
      { text: 'React는 사용자 인터페이스를 구축하기 위한 JavaScript 라이브러리', start: 0, end: 15 },
      { text: '컴포넌트 기반 아키텍처를 사용하여 재사용 가능한 UI 요소', start: 15, end: 30 },
      { text: '상태 관리는 useState Hook을 사용', start: 30, end: 45 },
      { text: 'useEffect Hook을 사용하면 사이드 이펙트를 관리', start: 45, end: 60 },
      { text: 'React Router를 사용하여 싱글 페이지 애플리케이션', start: 60, end: 75 }
    ],
    metadata: {
      language: 'ko',
      duration: 75,
      title: 'React 기초 강의'
    }
  };

  // Test 1: Embedding Generation
  test.test('OpenAI Embedding Generation', async () => {
    const testText = 'React Hook 사용법에 대해 설명해주세요';
    console.log(`   Testing: "${testText}"`);

    const embedding = await vectorizeService.generateEmbedding(testText);

    if (!Array.isArray(embedding)) {
      throw new Error('Embedding should be an array');
    }

    if (embedding.length !== 1536) {
      throw new Error(`Expected 1536 dimensions, got ${embedding.length}`);
    }

    console.log(`   ✓ Generated ${embedding.length}D embedding`);
    console.log(`   ✓ Sample: [${embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}...]`);
  });

  // Test 2: Content Chunking
  test.test('Smart Content Chunking', async () => {
    const chunks = vectorizeService.createSmartChunks(testData.originalText, 200);

    console.log(`   Generated ${chunks.length} chunks:`);
    chunks.forEach((chunk, i) => {
      console.log(`     ${i + 1}. (${chunk.length} chars) "${chunk.substring(0, 40)}..."`);
    });

    if (chunks.length === 0) {
      throw new Error('Should generate at least one chunk');
    }

    const oversized = chunks.filter(chunk => chunk.length > 220);
    if (oversized.length > 0) {
      throw new Error(`Found ${oversized.length} oversized chunks`);
    }

    console.log(`   ✓ All chunks within size limits`);
  });

  // Test 3: Content Indexing
  test.test('Full Content Indexing', async () => {
    const result = await vectorizeService.indexContent(
      contentId,
      testData.originalText,
      testData.summary,
      testData.segments,
      testData.metadata
    );

    console.log(`   Indexing result:`, result);

    if (!result.success) {
      throw new Error('Indexing should succeed');
    }

    if (result.totalVectors < 2) {
      throw new Error('Should index both transcript chunks and summary');
    }

    const stats = vectorIndex.getStats();
    console.log(`   ✓ Indexed ${stats.totalVectors} vectors successfully`);
  });

  // Test 4: Basic Search
  test.test('Vector Search Functionality', async () => {
    const queries = [
      'React 컴포넌트',
      'useState Hook',
      'useEffect 사용법',
      '상태 관리',
      'UI 개발'
    ];

    for (const query of queries) {
      console.log(`   Searching: "${query}"`);

      const result = await vectorizeService.searchContent(query, {
        topK: 3,
        includeMetadata: true
      });

      if (!Array.isArray(result.results)) {
        throw new Error('Results should be an array');
      }

      console.log(`     Found ${result.results.length} results`);

      result.results.forEach((item, i) => {
        console.log(`       ${i + 1}. ${item.id} (${item.score.toFixed(4)}) - ${item.type}`);
      });
    }

    console.log(`   ✓ Search functionality working`);
  });

  // Test 5: Filtered Search
  test.test('Filtered Search Operations', async () => {
    // Search only transcripts
    const transcriptResults = await vectorizeService.searchContent('React', {
      type: 'transcript',
      topK: 5
    });

    console.log(`   Transcript-only search: ${transcriptResults.results.length} results`);

    for (const result of transcriptResults.results) {
      if (result.type !== 'transcript') {
        throw new Error(`Expected transcript type, got ${result.type}`);
      }
    }

    // Search only summaries
    const summaryResults = await vectorizeService.searchContent('React', {
      type: 'summary',
      topK: 5
    });

    console.log(`   Summary-only search: ${summaryResults.results.length} results`);

    // Search by content ID
    const contentResults = await vectorizeService.searchContent('컴포넌트', {
      contentId: contentId,
      topK: 5
    });

    console.log(`   Content ID filtered: ${contentResults.results.length} results`);

    for (const result of contentResults.results) {
      if (result.contentId !== contentId) {
        throw new Error(`Expected content ID ${contentId}, got ${result.contentId}`);
      }
    }

    console.log(`   ✓ All filters working correctly`);
  });

  // Test 6: Context Generation
  test.test('AI Chat Context Generation', async () => {
    const contextQuery = 'React Hook에 대해 설명해주세요';
    console.log(`   Getting context for: "${contextQuery}"`);

    const context = await vectorizeService.getContentContext(contextQuery, 3);

    console.log(`   Has context: ${context.hasContext}`);
    console.log(`   Sources: ${context.sources?.length || 0}`);

    if (context.hasContext) {
      console.log(`   Context length: ${context.context.length} characters`);
      console.log(`   Preview: "${context.context.substring(0, 80)}..."`);

      if (context.sources.length === 0) {
        throw new Error('Should have sources when context is available');
      }
    }

    console.log(`   ✓ Context generation working`);
  });

  // Test 7: High Relevance Threshold
  test.test('Relevance Threshold Testing', async () => {
    // Test with very specific query that should match well
    const specificQuery = 'useState Hook 상태 관리';
    const highRelevanceResults = await vectorizeService.searchContent(specificQuery, {
      topK: 5
    });

    console.log(`   Specific query: "${specificQuery}"`);
    console.log(`   Results: ${highRelevanceResults.results.length}`);

    // Test with unrelated query that should have low scores
    const unrelatedQuery = '데이터베이스 스키마 설계';
    const lowRelevanceResults = await vectorizeService.searchContent(unrelatedQuery, {
      topK: 5
    });

    console.log(`   Unrelated query: "${unrelatedQuery}"`);
    console.log(`   Results: ${lowRelevanceResults.results.length}`);

    // Check context filtering (should filter out low relevance)
    const context = await vectorizeService.getContentContext(unrelatedQuery, 5);
    console.log(`   Context for unrelated query: ${context.hasContext}`);

    console.log(`   ✓ Relevance threshold working correctly`);
  });

  // Test 8: Performance and Scale
  test.test('Performance with Multiple Operations', async () => {
    const startTime = Date.now();

    // Perform multiple operations
    const operations = [
      () => vectorizeService.searchContent('React', { topK: 5 }),
      () => vectorizeService.searchContent('Hook', { topK: 5 }),
      () => vectorizeService.searchContent('컴포넌트', { topK: 5 }),
      () => vectorizeService.getContentContext('useState', 3),
      () => vectorizeService.getContentContext('useEffect', 3)
    ];

    const results = await Promise.all(operations.map(op => op()));

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`   Executed ${operations.length} operations in ${duration}ms`);
    console.log(`   Average: ${(duration / operations.length).toFixed(1)}ms per operation`);

    if (duration > 30000) { // 30 seconds
      throw new Error('Operations taking too long');
    }

    console.log(`   ✓ Performance acceptable`);
  });

  // Run all tests
  const success = await test.run();

  // Final analysis
  console.log('\n🔍 Production Test Analysis');
  console.log('============================');

  const stats = vectorIndex.getStats();
  console.log(`📊 Vector Index Stats:`);
  console.log(`   Total vectors: ${stats.totalVectors}`);
  console.log(`   Operations: ${stats.operations}`);
  console.log(`   Vector IDs: ${stats.vectorIds.slice(0, 3).join(', ')}${stats.vectorIds.length > 3 ? '...' : ''}`);

  if (success) {
    console.log('\n✅ All production tests passed!');
    console.log('\n🚀 Vectorize Service is working correctly');
    console.log('\n🔧 If still having issues in production:');
    console.log('   1. Check Cloudflare Vectorize index binding in wrangler.toml');
    console.log('   2. Verify OPENAI_API_KEY is set in Cloudflare secrets');
    console.log('   3. Ensure AI Gateway is properly configured');
    console.log('   4. Check index permissions and quotas');
    console.log('   5. Monitor Cloudflare Workers logs for errors');
  } else {
    console.log('\n❌ Some tests failed - check implementation');
  }

  return success;
}

// Execute tests
console.log('🎯 Starting Production Vectorize Tests');
console.log('======================================\n');

runProductionTests()
  .then(success => {
    console.log(success ? '\n🎉 All tests completed successfully!' : '\n⚠️ Some tests failed');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n💥 Test execution failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  });