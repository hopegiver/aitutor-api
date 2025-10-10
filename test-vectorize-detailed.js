/**
 * VectorizeService 상세 테스트 스크립트
 * 각 메서드를 개별적으로 테스트합니다.
 */

import { VectorizeService } from './src/services/vectorize.js';
import { OpenAIService } from './src/services/openai.js';

// 테스트 설정
const config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'your-openai-api-key',
  CLOUDFLARE_ACCOUNT_ID: 'd2b8c5524b7259214fa302f1fecb4ad6'
};

// 테스트 콘텐츠 (실제 콘텐츠 ID f4d86c8ffbed032815287f11af8c4668의 데이터)
const testContent = {
  contentId: 'f4d86c8ffbed032815287f11af8c4668',
  originalText: `이제는 온라인과 때려야 뗄 수 없는 우리의 삶 더 교묘하게 진화하는 사이버 위협들 방하기 전에 데뷔하자 사이버 보안관 안녕하세요 사이버 보안관 황인성 사이버 보안관 이가은입니다.

네 가은씨 그거 아세요? 요즘은 사이버 공간에서 출퇴근한다는 거 어? 정말요? 저희처럼 이렇게 안 만나고요? 그러니까요 이런 걸 메타버스라고 하는데 가상공간 안에서 회의도 하고 또 일도 하고 그런 시대가 됐거든요.

재택근무를 하다 보니 기업의 정보 유출이라든지 신경을 써야 할 부분들이 참 많은데요. 재택근무에 익숙하지 않다 보니 개인기업을 가리지 않고 문제가 발생하고 있습니다.

비대면 시대 재택근무 위협 사례들을 살펴보면, 첫 번째로 원격 접속 서비스 취약점 노출로 인한 사고입니다. 공공기관에 종사하던 A 직원이 재택근무를 하던 중 메일을 하나 받았는데요.

화상회의 플랫폼의 보안 취약점도 많이 보이고 있습니다. 첫 번째, 종단간 암호화 문제점. 영상회의 시 전송되는 영상 및 음성 데이터가 암호화되지 않는다는 점입니다.

재택근무용 PC에 백신 설치는 필수입니다. 백신 외에도 운영체제 그리고 사용기기들의 주기적인 업데이트와 점검이 필요합니다.`,

  summary: `비대면 시대의 사이버 보안 위협 및 대책 요약:

1. 메타버스와 언택트 시대의 도래
- 가상공간에서의 업무와 회의가 일반화
- 온라인과 언택트의 결합으로 새로운 생활 방식 등장

2. 재택근무의 보안 위협
- 기업 정보 유출 위험 증가
- 원격 접속 서비스 취약점 악용
- 피싱 메일을 통한 계정 정보 탈취

3. 화상회의 보안 문제
- 종단간 암호화 미비
- 영상 및 음성 데이터 보안 취약
- 비인가자의 회의 접근 가능성

4. 보안 대책
- 재택근무용 PC 백신 설치 필수
- 운영체제 및 기기의 정기 업데이트
- 보안 교육 강화 필요`,

  segments: [
    { start: 0, end: 30, text: "이제는 온라인과 때려야 뗄 수 없는 우리의 삶 더 교묘하게 진화하는 사이버 위협들" },
    { start: 30, end: 60, text: "사이버 보안관 안녕하세요 사이버 보안관 황인성 사이버 보안관 이가은입니다" },
    { start: 60, end: 120, text: "요즘은 사이버 공간에서 출퇴근한다는 거 메타버스라고 하는데 가상공간 안에서 회의도 하고" },
    { start: 120, end: 180, text: "재택근무를 하다 보니 기업의 정보 유출이라든지 신경을 써야 할 부분들이 참 많은데요" },
    { start: 180, end: 240, text: "비대면 시대 재택근무 위협 사례들을 살펴보면 원격 접속 서비스 취약점 노출로 인한 사고" },
    { start: 240, end: 300, text: "화상회의 플랫폼의 보안 취약점도 많이 보이고 있습니다 종단간 암호화 문제점" },
    { start: 300, end: 360, text: "재택근무용 PC에 백신 설치는 필수입니다 운영체제 그리고 사용기기들의 주기적인 업데이트" }
  ],

  metadata: {
    language: 'ko',
    duration: 819.343,
    videoUrl: 'https://wintersday.v4.wecandeo.com/file/1055/30072/V77853.mp4',
    source: 'cloudflare-stream-ai'
  }
};

// 모의 Vectorize 인덱스 생성
class MockVectorizeIndex {
  constructor() {
    this.vectors = [];
    this.insertCalls = [];
    this.queryCalls = [];
  }

  async insert(vectors) {
    this.insertCalls.push({
      timestamp: new Date().toISOString(),
      vectorCount: vectors.length,
      vectors: vectors
    });

    // 벡터를 저장 (실제로는 Cloudflare에 저장됨)
    this.vectors.push(...vectors);

    console.log(`📦 MockVectorizeIndex.insert() 호출됨:`);
    console.log(`   - 벡터 수: ${vectors.length}`);
    vectors.forEach((vector, index) => {
      console.log(`   - Vector ${index + 1}:`);
      console.log(`     * ID: ${vector.id}`);
      console.log(`     * Dimensions: ${vector.values?.length || 0}`);
      console.log(`     * Metadata: ${Object.keys(vector.metadata || {}).join(', ')}`);
    });

    return { success: true, inserted: vectors.length };
  }

  async query(options) {
    this.queryCalls.push({
      timestamp: new Date().toISOString(),
      options: options
    });

    console.log(`🔍 MockVectorizeIndex.query() 호출됨:`);
    console.log(`   - topK: ${options.topK}`);
    console.log(`   - vector dimensions: ${options.vector?.length || 0}`);
    console.log(`   - includeMetadata: ${options.includeMetadata}`);
    console.log(`   - filter: ${JSON.stringify(options.filter || {})}`);

    // 저장된 벡터가 있으면 모의 검색 결과 반환
    if (this.vectors.length > 0) {
      const results = this.vectors.slice(0, options.topK || 5).map((vector, index) => ({
        id: vector.id,
        score: 0.9 - (index * 0.1), // 모의 유사도 점수
        metadata: vector.metadata
      }));

      console.log(`   - 반환 결과 수: ${results.length}`);
      return { matches: results };
    }

    console.log(`   - 저장된 벡터가 없어 빈 결과 반환`);
    return { matches: [] };
  }

  getStats() {
    return {
      totalVectors: this.vectors.length,
      insertCallCount: this.insertCalls.length,
      queryCallCount: this.queryCalls.length
    };
  }
}

async function runVectorizeTests() {
  console.log('🚀 VectorizeService 상세 테스트 시작\n');

  try {
    // 1. 서비스 초기화 테스트
    console.log('1️⃣ 서비스 초기화 테스트');
    console.log('=' .repeat(50));

    const openaiService = new OpenAIService(config.OPENAI_API_KEY, config.CLOUDFLARE_ACCOUNT_ID);
    const mockIndex = new MockVectorizeIndex();
    const vectorizeService = new VectorizeService(mockIndex, openaiService);

    console.log('✅ OpenAIService 초기화 완료');
    console.log('✅ MockVectorizeIndex 초기화 완료');
    console.log('✅ VectorizeService 초기화 완료\n');

    // 2. 임베딩 생성 테스트
    console.log('2️⃣ 임베딩 생성 테스트');
    console.log('=' .repeat(50));

    const testTexts = [
      '재택근무 보안 수칙',
      '화상회의 취약점',
      '사이버 공격 방법',
      '메타버스 기술'
    ];

    for (const text of testTexts) {
      console.log(`\n📝 테스트 텍스트: "${text}"`);

      try {
        const embedding = await vectorizeService.generateEmbedding(text);

        console.log(`✅ 임베딩 생성 성공:`);
        console.log(`   - 차원: ${embedding?.length || 0}`);
        console.log(`   - 타입: ${typeof embedding} ${Array.isArray(embedding) ? '(배열)' : ''}`);

        if (embedding && embedding.length > 0) {
          console.log(`   - 첫 3개 값: [${embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}]`);
          console.log(`   - 마지막 3개 값: [${embedding.slice(-3).map(v => v.toFixed(4)).join(', ')}]`);
        }
      } catch (error) {
        console.log(`❌ 임베딩 생성 실패: ${error.message}`);
      }
    }

    // 3. 콘텐츠 청킹 테스트
    console.log('\n3️⃣ 콘텐츠 청킹 테스트');
    console.log('=' .repeat(50));

    const chunkSizes = [300, 500, 800];

    for (const chunkSize of chunkSizes) {
      console.log(`\n📏 청크 크기: ${chunkSize}자`);

      const chunks = vectorizeService.createSmartChunks(testContent.originalText, chunkSize);

      console.log(`✅ 청킹 완료:`);
      console.log(`   - 원본 길이: ${testContent.originalText.length}자`);
      console.log(`   - 생성된 청크 수: ${chunks.length}개`);

      chunks.forEach((chunk, index) => {
        console.log(`   - 청크 ${index + 1}: ${chunk.length}자`);
        console.log(`     "${chunk.substring(0, 60)}${chunk.length > 60 ? '...' : ''}"`);
      });

      // 청크 크기 검증
      const oversizedChunks = chunks.filter(chunk => chunk.length > chunkSize + 50);
      if (oversizedChunks.length > 0) {
        console.log(`⚠️  크기 초과 청크: ${oversizedChunks.length}개`);
      }
    }

    // 4. 타임스탬프 추출 테스트
    console.log('\n4️⃣ 타임스탬프 추출 테스트');
    console.log('=' .repeat(50));

    const testChunks = vectorizeService.createSmartChunks(testContent.originalText, 500);

    testChunks.slice(0, 3).forEach((chunk, index) => {
      console.log(`\n📍 청크 ${index + 1}: "${chunk.substring(0, 50)}..."`);

      const timestamps = vectorizeService.extractTimestampsFromSegments(testContent.segments, chunk);

      console.log(`✅ 타임스탬프 추출:`);
      console.log(`   - 시작 시간: ${timestamps.startTime}초`);
      console.log(`   - 종료 시간: ${timestamps.endTime}초`);
      console.log(`   - 구간: ${Math.floor(timestamps.startTime / 60)}:${(timestamps.startTime % 60).toFixed(0).padStart(2, '0')} - ${Math.floor(timestamps.endTime / 60)}:${(timestamps.endTime % 60).toFixed(0).padStart(2, '0')}`);
    });

    // 5. 콘텐츠 인덱싱 테스트
    console.log('\n5️⃣ 콘텐츠 인덱싱 테스트');
    console.log('=' .repeat(50));

    console.log(`\n📚 콘텐츠 인덱싱 시작: ${testContent.contentId}`);

    const indexResult = await vectorizeService.indexContent(
      testContent.contentId,
      testContent.originalText,
      testContent.summary,
      testContent.segments,
      testContent.metadata
    );

    console.log(`✅ 인덱싱 완료:`);
    console.log(`   - 결과: ${JSON.stringify(indexResult, null, 2)}`);

    // Mock 인덱스 상태 확인
    const indexStats = mockIndex.getStats();
    console.log(`📊 Mock 인덱스 상태:`);
    console.log(`   - 총 벡터 수: ${indexStats.totalVectors}`);
    console.log(`   - Insert 호출 횟수: ${indexStats.insertCallCount}`);

    // 6. 콘텐츠 검색 테스트
    console.log('\n6️⃣ 콘텐츠 검색 테스트');
    console.log('=' .repeat(50));

    const searchQueries = [
      { query: '재택근무 보안', desc: '재택근무 관련 검색' },
      { query: '화상회의 위험', desc: '화상회의 보안 검색' },
      { query: '사이버 공격 방법', desc: '사이버 공격 관련 검색' },
      { query: '메타버스 기술', desc: '메타버스 기술 검색' },
      { query: 'PC 백신 설치', desc: 'PC 보안 관련 검색' }
    ];

    for (const { query, desc } of searchQueries) {
      console.log(`\n🔍 ${desc}: "${query}"`);

      try {
        const searchResult = await vectorizeService.searchContent(query, {
          topK: 3,
          includeMetadata: true
        });

        console.log(`✅ 검색 완료:`);
        console.log(`   - 총 결과 수: ${searchResult.total}`);
        console.log(`   - 검색어: ${searchResult.query}`);

        if (searchResult.results && searchResult.results.length > 0) {
          searchResult.results.forEach((result, index) => {
            console.log(`   ${index + 1}. [점수: ${result.score?.toFixed(3)}]`);
            console.log(`      - ID: ${result.id}`);
            console.log(`      - 타입: ${result.type}`);
            console.log(`      - 언어: ${result.language}`);
            console.log(`      - 텍스트: "${result.text?.substring(0, 80)}..."`);
            console.log(`      - 시간: ${result.startTime}초 - ${result.endTime}초`);
          });
        } else {
          console.log(`   - 검색 결과 없음`);
        }

        if (searchResult.error) {
          console.log(`   ❌ 검색 오류: ${searchResult.error}`);
        }

      } catch (error) {
        console.log(`❌ 검색 실패: ${error.message}`);
      }
    }

    // 7. 컨텍스트 추출 테스트
    console.log('\n7️⃣ 컨텍스트 추출 테스트');
    console.log('=' .repeat(50));

    const contextQueries = [
      '재택근무할 때 어떤 보안 수칙을 지켜야 하나요?',
      '화상회의를 안전하게 사용하는 방법은?',
      '사이버 공격으로부터 어떻게 보호할 수 있나요?',
      '메타버스 시대의 보안 위협은 무엇인가요?'
    ];

    for (const query of contextQueries) {
      console.log(`\n💬 질문: "${query}"`);

      try {
        const contextResult = await vectorizeService.getContentContext(query, 3);

        console.log(`✅ 컨텍스트 추출 완료:`);
        console.log(`   - 컨텍스트 사용 가능: ${contextResult.hasContext}`);
        console.log(`   - 관련 청크 수: ${contextResult.relevantChunks || 0}`);
        console.log(`   - 소스 수: ${contextResult.sources?.length || 0}`);

        if (contextResult.hasContext && contextResult.context) {
          console.log(`   - 컨텍스트 미리보기:`);
          console.log(`     "${contextResult.context.substring(0, 150)}..."`);
        }

        if (contextResult.sources && contextResult.sources.length > 0) {
          console.log(`   - 소스 정보:`);
          contextResult.sources.forEach((source, index) => {
            console.log(`     ${index + 1}. ${source.contentId} (${source.type}) - 점수: ${source.score?.toFixed(3)}`);
          });
        }

        if (contextResult.error) {
          console.log(`   ❌ 컨텍스트 오류: ${contextResult.error}`);
        }

      } catch (error) {
        console.log(`❌ 컨텍스트 추출 실패: ${error.message}`);
      }
    }

    // 8. 성능 및 통계 테스트
    console.log('\n8️⃣ 성능 및 통계 테스트');
    console.log('=' .repeat(50));

    const finalStats = mockIndex.getStats();
    console.log(`📊 최종 통계:`);
    console.log(`   - 총 벡터 수: ${finalStats.totalVectors}`);
    console.log(`   - Insert 호출 횟수: ${finalStats.insertCallCount}`);
    console.log(`   - Query 호출 횟수: ${finalStats.queryCallCount}`);

    // 시간 포맷팅 테스트
    console.log(`\n⏰ 시간 포맷팅 테스트:`);
    const testTimes = [0, 65, 125, 3661, 7325];
    testTimes.forEach(seconds => {
      const formatted = vectorizeService.formatTime(seconds);
      console.log(`   - ${seconds}초 → ${formatted}`);
    });

    console.log('\n✅ 모든 VectorizeService 테스트 완료!');
    console.log('🎉 테스트 성공적으로 종료');

  } catch (error) {
    console.error('\n❌ 테스트 중 치명적 오류 발생:');
    console.error(`   오류: ${error.message}`);
    console.error(`   스택: ${error.stack}`);
  }
}

// 테스트 실행
console.log('VectorizeService 상세 테스트를 시작합니다...\n');
runVectorizeTests();