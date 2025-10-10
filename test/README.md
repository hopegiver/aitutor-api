# AI Tutor API - Unit Tests

이 디렉토리는 AI Tutor API의 단위 테스트를 포함합니다.

## 🚀 테스트 실행

### 모든 서비스 통합 테스트
```bash
npm run test:all
```

### 기본 유틸리티 테스트
```bash
npm run test:services
```

### 커스텀 테스트 러너
```bash
npm test
```

## 📋 테스트 파일 구조

### Vitest 형식 단위 테스트 (전체 기능)
- `openai.test.js` - OpenAI 서비스 단위 테스트
- `auth.test.js` - 인증 서비스 단위 테스트
- `validation.test.js` - 입력 검증 유틸리티 테스트
- `responses.test.js` - 응답 유틸리티 테스트
- `routes.auth.test.js` - API 엔드포인트 테스트
- `services.kv.test.js` - KV 서비스 단위 테스트
- `services.queue.test.js` - Queue 서비스 단위 테스트
- `services.stream.test.js` - Stream 서비스 단위 테스트
- `services.whisper.test.js` - Whisper 서비스 단위 테스트
- `services.transcribe-consumer.test.js` - 자막 추출 컨슈머 테스트

### Node.js 네이티브 테스트 (실행 가능)
- `test-services.js` - 기본 서비스 기능 테스트
- `test-all-services.js` - 모든 서비스 통합 테스트
- `runner.js` - 커스텀 테스트 프레임워크

### 설정 파일
- `setup.js` - Vitest 환경 설정 (Mock 객체)
- `vitest.config.js` - Vitest 설정 파일