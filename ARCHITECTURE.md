# 아키텍처 가이드

## 📁 프로젝트 구조 (단순화된 실용적 구조)

```
src/
├── routes/                 # 라우트와 로직을 함께 관리
│   ├── chat.js            # 채팅 관련 모든 엔드포인트
│   └── tutor.js           # 튜터 관련 모든 엔드포인트
├── services/               # 외부 서비스 통합
│   └── openai.js          # OpenAI API 서비스
├── utils/                  # 공통 유틸리티
│   ├── responses.js       # 응답 헬퍼 함수들
│   └── validation.js      # 입력 검증 로직
└── index.js               # 앱 진입점 (메인 서버)
```

## 🏗️ 아키텍처 원칙

### 1. 단순성 우선 (Simplicity First)
- **라우트 파일**: 라우팅 + 비즈니스 로직을 한 곳에서 관리
- **최소한의 추상화**: 필요할 때만 분리
- **빠른 개발**: 한 파일에서 전체 플로우 파악 가능

### 2. 에러 격리 (Error Isolation)
```javascript
// 각 라우트 핸들러는 독립적인 try-catch 처리
chat.post('/', async (c) => {
  try {
    // 로직 처리
    return createSSEResponse(parsedStream);
  } catch (error) {
    console.error('Chat error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});
```

### 3. Hono 프레임워크 활용
- **빠른 라우팅**: 경량화된 라우터 시스템
- **미들웨어**: CORS 등 필수 기능만 사용
- **Context 기반**: `c.req`, `c.json()` 등 직관적 API

## 🛡️ 에러 처리 전략

### 단순한 에러 응답
```javascript
// src/utils/responses.js
export function createErrorResponse(message, status = 400, code = 'ERROR') {
  return {
    error: message,
    code,
    timestamp: new Date().toISOString()
  };
}
```

### 에러 격리 메커니즘
1. **개별 Try-Catch**: 각 라우트 핸들러에서 독립적 에러 처리
2. **에러 전파 방지**: 한 엔드포인트의 에러가 다른 엔드포인트에 영향 없음
3. **일관된 에러 형식**: `createErrorResponse` 함수로 통일

## 📊 새로운 엔드포인트 추가 가이드

### 1. 새 라우트 파일 생성
```javascript
// src/routes/newFeature.js
import { Hono } from 'hono';
import { OpenAIService } from '../services/openai.js';
import { createErrorResponse, parseSSEStream, createSSEResponse } from '../utils/responses.js';

const newFeature = new Hono();

newFeature.post('/', async (c) => {
  try {
    const { input } = await c.req.json();

    // 입력 검증
    if (!input) {
      return c.json(createErrorResponse('Input is required'), 400);
    }

    // API 키 확인
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('API key not configured'), 500);
    }

    // OpenAI 처리
    const openai = new OpenAIService(c.env.OPENAI_API_KEY);
    // ... 비즈니스 로직

    return c.json({ result: 'success' });
  } catch (error) {
    console.error('NewFeature error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

export default newFeature;
```

### 2. 메인 앱에 라우트 등록
```javascript
// src/index.js
import newFeature from './routes/newFeature.js';

// Routes
app.route('/v1/new-feature', newFeature);
```

## 🚀 확장성 고려사항

### 1. 버전 관리
- `/v1`, `/v2` 등으로 API 버전 분리
- 라우트 파일만 추가하면 새 버전 구현 가능

### 2. 점진적 복잡화
- 단순한 구조로 시작
- 필요할 때 서비스 레이어나 미들웨어 추가
- 리팩토링이 쉬운 구조

### 3. 모니터링
- 각 라우트에서 `console.error`로 에러 로깅
- Cloudflare Workers 대시보드에서 로그 확인
- 필요시 외부 로깅 서비스 통합

## 🔒 보안 고려사항

### 환경 변수 관리
```bash
# Cloudflare Workers에서 시크릿 설정
wrangler secret put OPENAI_API_KEY
```

### 기본 보안 조치
1. **입력 검증**: `sanitizeInput` 함수로 XSS 방지
2. **API 키 검증**: 각 핸들러에서 `c.env.OPENAI_API_KEY` 확인
3. **CORS 설정**: Hono의 cors 미들웨어 사용
4. **에러 정보 제한**: 민감한 정보 노출 방지

## 🛠️ 개발 워크플로우

### 로컬 개발
```bash
npm run dev          # 로컬 개발 서버 실행
```

### 배포
```bash
npm run deploy       # Cloudflare Workers에 배포
```

### 새 기능 추가 프로세스
1. `src/routes/` 에 새 파일 생성
2. `src/index.js` 에 라우트 등록
3. 테스트 후 git 커밋
4. 배포

## 📋 현재 API 엔드포인트

- `GET /health` - 서버 상태 확인
- `POST /v1/chat/` - 기본 채팅
- `POST /v1/chat/simple` - 간단한 메시지 처리
- `POST /v1/tutor/` - 기본 튜터링
- `POST /v1/tutor/explain` - 주제 설명
- `POST /v1/tutor/quiz` - 퀴즈 생성

이 단순화된 아키텍처는 빠른 개발과 쉬운 유지보수를 가능하게 하며, 필요에 따라 점진적으로 복잡한 구조로 발전시킬 수 있습니다.