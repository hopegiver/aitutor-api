/**
 * 간단한 Vectorize 디버깅 스크립트
 * wrangler dev 콘솔에서 직접 실행할 수 있는 코드 스니펫
 */

// 이 스크립트는 wrangler dev 환경의 콘솔에서 실행하기 위한 것입니다
// 다음 코드를 콘솔에 복사해서 실행하세요:

console.log(`
=== Vectorize 디버깅 스크립트 ===

다음 코드를 wrangler dev 콘솔에서 실행하세요:

1. 벡터라이즈 인덱스 확인:
console.log('VECTORIZE_INDEX:', typeof env.VECTORIZE_INDEX);

2. OpenAI 서비스 테스트:
const openaiService = new OpenAIService(env);
const testEmbedding = await openaiService.createEmbedding({
  model: 'text-embedding-3-small',
  input: '테스트 텍스트'
});
console.log('Embedding result:', testEmbedding.data[0].embedding.length);

3. 벡터라이즈 서비스 초기화:
const vectorizeService = new VectorizeService(env.VECTORIZE_INDEX, openaiService);

4. 간단한 벡터 삽입 테스트:
const testVector = {
  id: 'test-vector-' + Date.now(),
  values: new Array(1536).fill(0).map(() => Math.random()),
  metadata: { test: true, text: '테스트 벡터' }
};
await env.VECTORIZE_INDEX.insert([testVector]);
console.log('Vector inserted:', testVector.id);

5. 벡터 검색 테스트:
const searchResult = await env.VECTORIZE_INDEX.query({
  vector: new Array(1536).fill(0).map(() => Math.random()),
  topK: 5,
  includeMetadata: true
});
console.log('Search results:', searchResult);

6. 전체 Vectorize 서비스 테스트:
const fullTest = await vectorizeService.indexContent(
  'debug-test-' + Date.now(),
  '자바스크립트는 웹 개발에 사용되는 프로그래밍 언어입니다. 변수, 함수, 객체 등의 개념이 있습니다.',
  '자바스크립트 기본 개념 설명',
  [],
  { language: 'ko', test: true }
);
console.log('Index result:', fullTest);

7. 검색 테스트:
const searchTest = await vectorizeService.searchContent('자바스크립트 변수', {
  topK: 3,
  includeMetadata: true
});
console.log('Search test:', searchTest);

=== 문제 진단 체크리스트 ===

1. 환경 변수 확인:
   - OPENAI_API_KEY 설정되어 있는지
   - CLOUDFLARE_ACCOUNT_ID 설정되어 있는지

2. wrangler.toml 설정 확인:
   - [[ env.production.vectorize ]] 또는 [[ env.dev.vectorize ]] 섹션
   - binding = "VECTORIZE_INDEX"
   - index_name = "your-index-name"

3. Vectorize 인덱스 상태:
   - Cloudflare 대시보드에서 인덱스가 생성되어 있는지
   - 인덱스 이름이 wrangler.toml과 일치하는지

4. API 호출 로그:
   - OpenAI API 호출이 성공하는지
   - Vectorize insert/query 호출이 실제로 실행되는지

=== 일반적인 문제들 ===

1. 벡터 검색이 안 되는 경우:
   - 인덱스에 벡터가 실제로 저장되었는지 확인
   - 검색 쿼리의 embedding이 제대로 생성되었는지 확인
   - 필터 조건이 올바른지 확인

2. OpenAI API 에러:
   - API 키가 유효한지 확인
   - AI Gateway 설정이 올바른지 확인
   - 네트워크 연결 문제 확인

3. Vectorize 바인딩 에러:
   - wrangler.toml의 바인딩 설정 확인
   - 인덱스 이름 오타 확인
   - Cloudflare 계정 권한 확인

=== 로그 확인 명령어 ===

터미널에서 다음 명령어로 실시간 로그 확인:
wrangler tail --format=pretty

=== 수동 벡터라이즈 테스트 ===

다음 curl 명령어로 직접 API 테스트:

1. 콘텐츠 업로드:
curl -X POST "https://your-worker.your-subdomain.workers.dev/v1/content/upload-url" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"videoUrl": "https://example.com/video.mp4", "language": "ko-KR"}'

2. 콘텐츠 검색:
curl "https://your-worker.your-subdomain.workers.dev/v1/content/search?query=자바스크립트&topK=5" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

3. 채팅 테스트 (벡터 검색 포함):
curl -X POST "https://your-worker.your-subdomain.workers.dev/v1/chat/simple" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "자바스크립트 변수에 대해 설명해주세요", "systemPrompt": "당신은 프로그래밍 강사입니다."}'

=== 벡터라이즈 인덱스 직접 확인 ===

Cloudflare 대시보드에서:
1. Workers & Pages > Vectorize
2. 인덱스 이름 클릭
3. Metrics 탭에서 저장된 벡터 수 확인
4. Query 탭에서 직접 검색 테스트

끝.
`);

// Node.js 환경에서 실행할 수 있는 추가 디버깅 함수들
export function debugVectorizeCode() {
  console.log('\n🔍 Vectorize 코드 분석:');

  // VectorizeService의 주요 메서드 분석
  console.log('\n📋 VectorizeService 메서드 체크:');
  console.log('✅ createSmartChunks() - 텍스트 청킹');
  console.log('✅ extractTimestampsFromSegments() - 타임스탬프 추출');
  console.log('✅ generateEmbedding() - OpenAI 임베딩 생성');
  console.log('✅ indexContent() - 벡터 인덱싱');
  console.log('✅ searchContent() - 벡터 검색');
  console.log('✅ getContentContext() - AI 채팅 컨텍스트');

  console.log('\n🔧 잠재적 문제점:');
  console.log('1. OpenAI API 키 누락 또는 잘못됨');
  console.log('2. Vectorize 인덱스 바인딩 문제');
  console.log('3. 인덱스 이름 불일치');
  console.log('4. 필터 문법 오류');
  console.log('5. 비동기 처리 타이밍 문제');

  console.log('\n🚀 다음 단계:');
  console.log('1. wrangler dev로 개발 서버 시작');
  console.log('2. 브라우저 콘솔에서 위의 테스트 코드 실행');
  console.log('3. API 엔드포인트로 실제 요청 전송');
  console.log('4. Cloudflare 대시보드에서 벡터 저장 상태 확인');
}

export function generateTestCommands() {
  return {
    wranglerDev: 'wrangler dev --compatibility-date=2023-10-30',
    tailLogs: 'wrangler tail --format=pretty',
    listSecrets: 'wrangler secret list',
    deployTest: 'wrangler deploy --dry-run'
  };
}

// 실행
debugVectorizeCode();

console.log('\n📋 테스트 명령어:');
const commands = generateTestCommands();
Object.entries(commands).forEach(([name, cmd]) => {
  console.log(`${name}: ${cmd}`);
});

console.log('\n✨ 이 스크립트를 실행했습니다. 이제 wrangler dev 환경에서 위의 코드 스니펫을 테스트하세요!');