/**
 * VectorizeService 테스트 스크립트
 * 특정 콘텐츠 ID로 벡터 인덱싱 및 검색을 테스트합니다.
 */

import { VectorizeService } from './src/services/vectorize.js';
import { OpenAIService } from './src/services/openai.js';

// 테스트용 환경 설정
const testEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'your-openai-api-key',
  CLOUDFLARE_ACCOUNT_ID: 'd2b8c5524b7259214fa302f1fecb4ad6'
};

// 테스트 데이터 (실제 콘텐츠에서 추출)
const testContent = {
  contentId: 'f4d86c8ffbed032815287f11af8c4668',
  originalText: `이제는 온라인과 때려야 뗄 수 없는 우리의 삶 더 교묘하게 진화하는 사이버 위협들 방하기 전에 데뷔하자 사이버 보안관 안녕하세요 사이버 보안관 황인성 사이버 보안관 이가은입니다 네 가은씨 그거 아세요? 요즘은 사이버 공간에서 출퇴근한다는 거 어? 정말요? 저희처럼 이렇게 안 만나고요? 그러니까요 이런 걸 메타버스라고 하는데 가상공간 안에서 회의도 하고 또 일도 하고 그런 시대가 됐거든요 출퇴근 안 해도 되고 너무 좋은데 저희도 앞으로 이렇게 비대면으로 만나는 거 어때요? 그럼 한번 PD님께 건의를 해보는 건 아니고 이렇게 생활 방식들이 변해가면 좀 어떨까요? 이제 온라인으로 여러 활동들이 전환이 되다 보니까 보안에도 문제가 생길 것 같아요 그렇죠 그래서 저희가 이번에는 비대면 특집 사이버 보안 관련 문제들을 말씀드리려고 합니다 그러면 한번 함께 살펴보시죠`,
  summary: `### 비대면 시대의 사이버 보안 위협 및 대책 요약

#### 1. 비대면 시대의 변화
- **메타버스와 언택트**: 사람 간의 직접적인 만남 없이 가상공간에서 업무와 교육이 이루어짐.
- **온택트**: 온라인과 언택트의 결합으로 새로운 생활 방식이 등장.

#### 2. 사이버 위협의 증가
- **코로나19와 사이버 공격**: 지원금이나 정부 정책을 미끼로 한 피싱 공격이 증가.
- **랜섬웨어**: 파일 사용 불가 및 금품 요구의 피해 사례 발생.`,
  segments: [
    { start: 0, end: 30, text: "이제는 온라인과 때려야 뗄 수 없는 우리의 삶 더 교묘하게 진화하는 사이버 위협들" },
    { start: 30, end: 60, text: "사이버 보안관 안녕하세요 사이버 보안관 황인성 사이버 보안관 이가은입니다" },
    { start: 60, end: 90, text: "요즘은 사이버 공간에서 출퇴근한다는 거 메타버스라고 하는데 가상공간 안에서 회의도 하고" }
  ],
  metadata: {
    language: 'ko',
    duration: 819.343,
    videoUrl: 'https://wintersday.v4.wecandeo.com/file/1055/30072/V77853.mp4',
    source: 'cloudflare-stream-ai'
  }
};

async function testVectorizeService() {
  console.log('🚀 VectorizeService 테스트 시작...');

  try {
    // 서비스 초기화
    const openaiService = new OpenAIService(testEnv.OPENAI_API_KEY, testEnv.CLOUDFLARE_ACCOUNT_ID);

    // 모의 Vectorize 인덱스 (실제 테스트에서는 실제 인덱스 필요)
    const mockVectorizeIndex = {
      async insert(vectors) {
        console.log(`✅ Vectorize Index: ${vectors.length}개 벡터 삽입 시뮬레이션`);
        vectors.forEach((vector, index) => {
          console.log(`  - Vector ${index + 1}: ID=${vector.id}, Dimensions=${vector.values?.length || 0}`);
        });
        return { success: true };
      },

      async query(options) {
        console.log(`🔍 Vectorize Query: topK=${options.topK}, vector dimensions=${options.vector?.length || 0}`);
        return {
          matches: [
            {
              id: 'f4d86c8ffbed032815287f11af8c4668-transcript-0',
              score: 0.85,
              metadata: {
                contentId: 'f4d86c8ffbed032815287f11af8c4668',
                type: 'transcript',
                text: '재택근무를 하면서 사이버 보안에 주의해야 합니다',
                chunkIndex: 0,
                startTime: 60,
                endTime: 90,
                language: 'ko'
              }
            }
          ]
        };
      }
    };

    const vectorizeService = new VectorizeService(mockVectorizeIndex, openaiService);

    console.log('\n1️⃣ 임베딩 생성 테스트...');
    const testText = "재택근무 보안 수칙";
    const embedding = await vectorizeService.generateEmbedding(testText);
    console.log(`  - 텍스트: "${testText}"`);
    console.log(`  - 임베딩 차원: ${embedding?.length || 0}`);
    console.log(`  - 임베딩 타입: ${typeof embedding} ${Array.isArray(embedding) ? '(배열)' : ''}`);

    if (embedding && embedding.length > 0) {
      console.log(`  - 첫 5개 값: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    }

    console.log('\n2️⃣ 콘텐츠 청킹 테스트...');
    const chunks = vectorizeService.createSmartChunks(testContent.originalText, 500);
    console.log(`  - 원본 텍스트 길이: ${testContent.originalText.length}자`);
    console.log(`  - 생성된 청크 수: ${chunks.length}개`);
    chunks.forEach((chunk, index) => {
      console.log(`  - 청크 ${index + 1}: ${chunk.length}자 - "${chunk.substring(0, 50)}..."`);
    });

    console.log('\n3️⃣ 콘텐츠 인덱싱 테스트...');
    const indexResult = await vectorizeService.indexContent(
      testContent.contentId,
      testContent.originalText,
      testContent.summary,
      testContent.segments,
      testContent.metadata
    );
    console.log('  - 인덱싱 결과:', indexResult);

    console.log('\n4️⃣ 콘텐츠 검색 테스트...');
    const searchQueries = [
      '재택근무 보안',
      '사이버 공격',
      '화상회의 위험',
      '메타버스란 무엇인가'
    ];

    for (const query of searchQueries) {
      console.log(`\n  🔍 검색어: "${query}"`);
      const searchResult = await vectorizeService.searchContent(query, { topK: 3 });
      console.log(`  - 검색 결과 수: ${searchResult.total}`);

      if (searchResult.results && searchResult.results.length > 0) {
        searchResult.results.forEach((result, index) => {
          console.log(`    ${index + 1}. [${result.score?.toFixed(3)}] ${result.type}: "${result.text?.substring(0, 60)}..."`);
        });
      }

      if (searchResult.error) {
        console.log(`  ❌ 검색 오류: ${searchResult.error}`);
      }
    }

    console.log('\n5️⃣ 컨텍스트 추출 테스트...');
    const contextResult = await vectorizeService.getContentContext('재택근무할 때 보안은 어떻게 해야 하나요?', 3);
    console.log('  - 컨텍스트 사용 가능:', contextResult.hasContext);
    console.log('  - 관련 청크 수:', contextResult.relevantChunks || 0);

    if (contextResult.hasContext) {
      console.log('  - 컨텍스트 미리보기:');
      console.log(`    "${contextResult.context.substring(0, 200)}..."`);
    }

    if (contextResult.error) {
      console.log(`  ❌ 컨텍스트 오류: ${contextResult.error}`);
    }

    console.log('\n✅ VectorizeService 테스트 완료!');

  } catch (error) {
    console.error('\n❌ 테스트 중 오류 발생:', error);
    console.error('오류 세부사항:', error.message);
    console.error('스택 트레이스:', error.stack);
  }
}

// 테스트 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  testVectorizeService();
}

export { testVectorizeService };