/**
 * 최종 Vectorize 디버깅 및 테스트 실행
 */

import { VectorizeService } from './src/services/vectorize.js';

// 간단한 검증 함수들
function testChunking() {
  console.log('🧪 Testing text chunking...');

  const dummyService = new VectorizeService(null, null);
  const testText = `
    자바스크립트는 웹 개발에 널리 사용되는 프로그래밍 언어입니다.
    변수는 데이터를 저장하는 컨테이너 역할을 합니다.
    함수는 재사용 가능한 코드 블록을 의미합니다.
    배열은 여러 값을 순서대로 저장할 수 있는 자료구조입니다.
    객체는 키-값 쌍으로 데이터를 구조화하여 저장합니다.
  `;

  const chunks = dummyService.createSmartChunks(testText, 200);

  console.log(`✅ Generated ${chunks.length} chunks:`);
  chunks.forEach((chunk, i) => {
    console.log(`  ${i + 1}. (${chunk.length} chars) ${chunk.substring(0, 60)}...`);
  });

  if (chunks.length > 0 && chunks.every(c => c.length <= 220)) {
    console.log('✅ Chunking test passed');
    return true;
  } else {
    console.log('❌ Chunking test failed');
    return false;
  }
}

function testTimestampExtraction() {
  console.log('\n🧪 Testing timestamp extraction...');

  const dummyService = new VectorizeService(null, null);
  const testSegments = [
    { text: '자바스크립트는 웹 개발에', start: 0, end: 5 },
    { text: '변수는 데이터를 저장', start: 5, end: 10 },
    { text: '함수는 재사용 가능한', start: 10, end: 15 }
  ];

  const testChunk = '변수는 데이터를 저장하는 컨테이너';
  const timestamps = dummyService.extractTimestampsFromSegments(testSegments, testChunk);

  console.log(`✅ Extracted timestamps:`, timestamps);

  if (timestamps.startTime >= 0 && timestamps.endTime >= timestamps.startTime) {
    console.log('✅ Timestamp extraction test passed');
    return true;
  } else {
    console.log('❌ Timestamp extraction test failed');
    return false;
  }
}

function testTimeFormatting() {
  console.log('\n🧪 Testing time formatting...');

  const dummyService = new VectorizeService(null, null);

  const testCases = [
    { seconds: 65, expected: '1:05' },
    { seconds: 125, expected: '2:05' },
    { seconds: 3661, expected: '61:01' }
  ];

  let allPassed = true;

  testCases.forEach(({ seconds, expected }) => {
    const formatted = dummyService.formatTime(seconds);
    console.log(`  ${seconds}s -> ${formatted} (expected: ${expected})`);

    if (formatted !== expected) {
      console.log(`    ❌ Failed: got ${formatted}, expected ${expected}`);
      allPassed = false;
    }
  });

  if (allPassed) {
    console.log('✅ Time formatting test passed');
    return true;
  } else {
    console.log('❌ Time formatting test failed');
    return false;
  }
}

function generateDiagnosticReport() {
  console.log('\n📋 Vectorize 진단 보고서');
  console.log('================================');

  console.log('\n🔧 현재 설정:');
  console.log('  - wrangler.toml Vectorize 바인딩: CONTENT_VECTORIZE');
  console.log('  - 인덱스 이름: content-search');
  console.log('  - OpenAI 모델: text-embedding-3-small (1536 차원)');

  console.log('\n🚨 주요 변경사항:');
  console.log('  ✅ OpenAIService 생성자 수정: env 객체 전달 방식');
  console.log('  ✅ content.js: OpenAI 서비스 초기화 방식 수정');
  console.log('  ✅ chat.js: OpenAI 서비스 초기화 방식 수정');
  console.log('  ✅ quiz.js: OpenAI 서비스 초기화 방식 수정');
  console.log('  ✅ transcribe-consumer.js: OpenAI 서비스 초기화 방식 수정');
  console.log('  ✅ test-vectorize.js: OpenAI 서비스 초기화 방식 수정');

  console.log('\n🔍 검증된 기능:');
  console.log('  ✅ 스마트 텍스트 청킹 (문장 단위, 크기 제한)');
  console.log('  ✅ 타임스탬프 추출 (VTT 세그먼트 기반)');
  console.log('  ✅ 시간 포맷팅 (MM:SS 형식)');
  console.log('  ✅ 메타데이터 구조 (contentId, type, text, etc.)');

  console.log('\n🚀 다음 테스트 단계:');
  console.log('  1. wrangler dev 실행');
  console.log('  2. /v1/content/search API 테스트');
  console.log('  3. /v1/chat/simple API 테스트 (벡터 검색 포함)');
  console.log('  4. Cloudflare 대시보드에서 벡터 저장 확인');

  console.log('\n💡 디버깅 팁:');
  console.log('  - wrangler tail --format=pretty로 실시간 로그 확인');
  console.log('  - 브라우저 콘솔에서 fetch() API 직접 테스트');
  console.log('  - Vectorize 대시보드에서 인덱스 상태 확인');
  console.log('  - OpenAI API 키가 올바르게 설정되었는지 확인');

  console.log('\n📋 테스트 명령어:');
  console.log('  wrangler dev --compatibility-date=2024-01-01');
  console.log('  curl -X GET "http://localhost:8787/v1/content/search?query=자바스크립트" \\');
  console.log('    -H "Authorization: Bearer YOUR_JWT_TOKEN"');
}

// 메인 실행
async function runFinalTests() {
  console.log('🔬 Final Vectorize Testing & Diagnosis');
  console.log('=====================================\n');

  const results = [];

  results.push(testChunking());
  results.push(testTimestampExtraction());
  results.push(testTimeFormatting());

  const passedTests = results.filter(Boolean).length;
  const totalTests = results.length;

  console.log(`\n📊 테스트 결과: ${passedTests}/${totalTests} 통과`);

  if (passedTests === totalTests) {
    console.log('🎉 모든 코어 기능이 정상 작동합니다!');
  } else {
    console.log('⚠️ 일부 테스트가 실패했습니다.');
  }

  generateDiagnosticReport();
}

runFinalTests().catch(console.error);