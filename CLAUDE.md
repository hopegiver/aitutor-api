# AI Tutor API - 프로젝트 현황 메모리

## 📊 프로젝트 개요
- **이름**: AI Tutor API
- **기술 스택**: Hono + Cloudflare Workers + AI Gateway (OpenAI/Azure) + Cloudflare Stream + Queues
- **목적**: 스트리밍 방식 AI 채팅, 퀴즈 생성, 동영상 자막 추출 API

## 🔗 실제 구현된 API 엔드포인트

### 기본 라우트
- `GET /` → `/docs`로 리다이렉트
- `GET /health` - 서버 상태 + Cloudflare 지역 정보 (country, region, city, datacenter, timezone 등)

### 인증 API (`/v1/auth`)
- `POST /v1/auth` - 도메인 + 인증키로 JWT 토큰 발급
  - 요청: `{ domain: "...", authKey: "..." }`
  - 응답: JWT 토큰 + 도메인 정보
- `POST /v1/auth/generate` - 마스터 비밀번호로 도메인별 인증키 생성
  - 요청: `{ domain: "...", password: "..." }`
  - 응답: 생성된 인증키

### 채팅 API (`/v1/chat`) - **JWT 인증 필수**
- `POST /v1/chat/` - 메시지 배열 기반 스트리밍 채팅
  - 요청: `{ messages: [...], options: {...} }`
  - 응답: SSE 스트림
- `POST /v1/chat/simple` - 단순 메시지 + 시스템 프롬프트
  - 요청: `{ message: "...", systemPrompt: "...", options: {...} }`
  - 응답: SSE 스트림

### 퀴즈 API (`/v1/quiz`) - **JWT 인증 필수**
- `POST /v1/quiz/` - 기본 퀴즈 생성
  - 요청: `{ topic: "...", questionCount: 5, options: {...} }`
  - 응답: SSE 스트림
- `POST /v1/quiz/generate` - 고급 퀴즈 생성
  - 요청: `{ topic: "...", difficulty: "intermediate", type: "multiple-choice", questionCount: 5, options: {...} }`
  - 응답: JSON 형식 퀴즈 (제목, 난이도, 문제들)

### 콘텐츠 API (`/v1/content`) - **JWT 인증 필수**
- `POST /v1/content/upload-url` - MP4 URL에서 자막 추출 및 AI 요약
  - 요청: `{ videoUrl: "...", language: "ko-KR" }`
  - 응답: 작업 ID + 상태 확인 URL
- `GET /v1/content/status/:jobId` - 자막 추출 진행 상황
- `GET /v1/content/result/:jobId` - 자막 추출 결과
- `GET /v1/content/summary/:contentId` - AI 요약된 콘텐츠 조회
- `GET /v1/content/subtitle/:contentId` - 원본 자막 내용 조회
- `GET /v1/content/contents` - 모든 콘텐츠 목록 조회

### 문서
- `/docs` - API 문서 (Swagger 스타일)

## 📁 실제 프로젝트 구조
```
src/
├── routes/
│   ├── auth.js      # 인증 엔드포인트 (도메인 검증, 키 생성)
│   ├── chat.js      # 채팅 엔드포인트
│   ├── quiz.js      # 퀴즈 엔드포인트
│   └── docs.js      # API 문서
├── services/
│   └── openai.js    # Azure OpenAI 서비스
├── utils/
│   ├── auth.js      # JWT 인증 서비스 클래스
│   ├── responses.js # SSE 응답 헬퍼
│   └── validation.js # 입력 검증
└── index.js         # 메인 앱 진입점 (중앙 인증 미들웨어)
```

## ⚙️ 설정 현황

### OpenAI 설정 (채팅용) - AI Gateway 통합
- **Cloudflare AI Gateway** 우선 사용
- Gateway 엔드포인트: `https://gateway.ai.cloudflare.com/v1/{account_id}/aitutor/openai`
- OpenAI API 키 인증 방식
- 기본 모델: `gpt-4o-mini`
- **Fallback**: Azure OpenAI (`https://malgn-openai.openai.azure.com/`)
  - API 버전: `2025-01-01-preview`
  - 인증: `api-key` 헤더 방식

### Whisper 설정 (자막 추출용) - AI Gateway 통합
- **Cloudflare AI Gateway** 우선 사용
- Gateway 엔드포인트: `https://gateway.ai.cloudflare.com/v1/{account_id}/aitutor/openai`
- OpenAI Whisper 모델: `whisper-1`
- **Fallback**: Azure Cognitive Services
  - 엔드포인트: `https://info-mg6frpzu-eastus2.cognitiveservices.azure.com/`
  - API 버전: `2024-06-01`
  - 인증: `api-key` 헤더 방식
  - 모델: `whisper`

### Cloudflare Workers 설정
- 프로덕션 이름: `aitutor-api`
- 개발 이름: `aitutor-api-dev`
- Smart placement 활성화
- 로깅 활성화
- CORS: 모든 오리진 허용 (Swagger UI 호환)

### 환경 변수 (Cloudflare Secrets)
- `AUTH_SECRET_KEY`: 도메인 해시 검증용 (7k9mN2pQ5rT8uW1xZ4aB6cE9fH2jK5nP8qS1vY4zA7bD0eG3hJ6kM9pR2tU5wX8z)
- `JWT_SECRET`: JWT 토큰 서명용 (F9mK2pS5vY8zA1dG4hJ7kN0qT3wX6bE9fH2jM5pR8uV1yB4cE7gJ0kN3qS6vY9z)
- `OPENAI_API_KEY`: OpenAI API 키 (AI Gateway 우선 사용)
- `AZURE_OPENAI_API_KEY`: Azure OpenAI API 키 (fallback)
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI 엔드포인트 (fallback)
- `AZURE_OPENAI_API_VERSION`: Azure OpenAI API 버전 (fallback)
- `WHISPER_API_KEY`: Azure Cognitive Services Whisper API 키 (fallback)
- `WHISPER_ENDPOINT`: Whisper 엔드포인트 URL (fallback)
- `WHISPER_API_VERSION`: Whisper API 버전 (fallback)
- `AI_GATEWAY_ID`: Cloudflare AI Gateway ID (하드코딩: 'aitutor')
- `STREAM_API_TOKEN`: Cloudflare Stream API 토큰
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID

## 🔐 인증 시스템

### 도메인 기반 인증 프로세스
1. **클라이언트**: `SHA256(domain + AUTH_SECRET_KEY)` 계산하여 `authKey` 생성
2. **서버**: 동일한 방식으로 해시 계산하여 클라이언트 키와 비교
3. **인증 성공**: JWT 토큰 발급 (24시간 유효)
4. **API 호출**: `Authorization: Bearer <token>` 헤더로 보호된 엔드포인트 접근

### 인증키 발행 시스템
- **마스터 비밀번호**: SHA256 해시 `fb682c5d455938b2d9974a7c0159e43664e94265b953f21f9e3d35f9d99047a6`
- **도메인별 키 생성**: `/v1/auth/generate` 엔드포인트
- **보안**: 디버깅 코드 모두 제거 완료

### 등록된 도메인
- **localhost**: 개발용 (a42b99ea2316b06e20baa93f4700a884b032f70ae878eca2260ca632342b5a37)
- **hopegiver.malgn.co.kr**: 프로덕션용 (8b3f9d2a7c1e5b8f4a6d9c2e7b1a4f8c3d6b9e2a5c8f1b4e7a9d2c5f8b1e4a7c3d6)

## 🎬 자막 추출 시스템 (구현 예정)

### 아키텍처
- **Cloudflare Stream**: MP4 URL 업로드 및 오디오 추출
- **Cloudflare Queues**: 비동기 자막 추출 작업 처리
- **Azure Speech Services**: 음성 인식 (OpenAI Whisper 대안)
- **KV Storage**: 작업 상태 및 결과 저장

### 처리 플로우
1. 클라이언트 → MP4 URL 제공
2. Workers → Stream에 동영상 업로드
3. Queue → 비동기 자막 추출 작업 추가
4. Consumer → Stream에서 오디오 추출 + Speech API 호출
5. 결과 → KV에 저장, 클라이언트는 polling으로 확인

## 📝 최근 변경사항

### 인증 시스템 구현 (완료)
- ✅ 도메인 기반 JWT 인증 시스템 구축
- ✅ 중앙 집중식 인증 미들웨어 (index.js)
- ✅ 인증키 발행 엔드포인트 추가
- ✅ 보안 강화 (디버깅 코드 제거)

### API 구조 개선 (완료)
- ✅ `/v1/auth/verify` → `/v1/auth`로 단순화
- ✅ `/v1/auth/validate` 엔드포인트 제거
- ✅ AuthService 클래스 최적화 (createAuthMiddleware 제거)
- ✅ 중앙 CORS 설정 강화 (Swagger UI 호환)

### 서버 URL 업데이트 (완료)
- ✅ OpenAPI 서버 URL: `https://aitutor.apiserver.kr`
- ✅ 실제 배포 URL과 일치

### Cloudflare AI Gateway 통합 (완료)
- ✅ OpenAI JavaScript 라이브러리 설치 및 통합
- ✅ OpenAI/Whisper 서비스에 AI Gateway 지원 추가
- ✅ Azure OpenAI fallback 시스템 구현
- ✅ 환경 변수 분리 (OpenAI vs Azure OpenAI)
- ✅ 모든 라우트 (chat, quiz, transcribe) AI Gateway 설정 적용
- ✅ 실시간 테스트 완료 - AI Gateway 정상 작동 확인
- ✅ 단위 테스트 코드 추가 및 transcribe 라우트 버그 수정
- ✅ AI Gateway ID 'aitutor' 하드코딩으로 설정 간소화
- ✅ 환경 변수에서 AI_GATEWAY_ID 제거 및 보안 강화

## 🛠️ 개발 명령어
```bash
npm run dev     # 로컬 개발 (wrangler dev)
npm run deploy  # 프로덕션 배포 (wrangler deploy)
npm run build   # 빌드 테스트 (wrangler deploy --dry-run)

# 시크릿 관리
wrangler secret put AUTH_SECRET_KEY
wrangler secret put JWT_SECRET
wrangler secret put OPENAI_API_KEY
wrangler secret put WHISPER_API_KEY
wrangler secret put WHISPER_ENDPOINT
wrangler secret put WHISPER_API_VERSION
wrangler secret put STREAM_API_TOKEN
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret list
wrangler tail   # 실시간 로그 확인

# 테스트 명령어
npm test                # 기본 테스트 러너
npm run test:services   # 기본 유틸리티 테스트
npm run test:all        # 모든 서비스 통합 테스트
```

## 📊 Git 상태
- 현재 브랜치: master
- 작업 디렉토리: 깨끗함
- 최신 커밋: f1e8aef - AI Gateway ID 하드코딩 및 설정 간소화
- 모든 AI Gateway 통합 변경사항 커밋 완료

## 🎯 아키텍처 특징
- **중앙 집중식 인증**: index.js에서 모든 보호된 라우트 인증 처리
- **도메인 기반 보안**: SHA256 해시를 통한 도메인별 인증키 시스템
- **AI Gateway 통합**: Cloudflare AI Gateway 우선 사용, Azure fallback 지원
- **하드코딩된 Gateway ID**: 'aitutor' 고정으로 설정 간소화
- **비동기 처리**: Queue 기반 긴 작업 처리 (자막 추출 등)
- **에러 격리**: 각 엔드포인트 독립적 try-catch
- **스트리밍 중심**: SSE 방식 실시간 응답
- **입력 검증**: XSS 방지, 타입 검증
- **CORS 지원**: 웹앱에서 직접 호출 가능

## 📋 현재 완료 상태
- ✅ 기본 채팅 API 구현
- ✅ 퀴즈 생성 API 구현
- ✅ 도메인 기반 JWT 인증 시스템 완료
- ✅ 인증키 발행 시스템 완료
- ✅ API 문서 시스템 (Swagger UI)
- ✅ Cloudflare AI Gateway 통합 (OpenAI/Whisper)
- ✅ Azure OpenAI fallback 시스템
- ✅ Cloudflare Workers 배포 설정
- ✅ 중앙 집중식 보안 아키텍처
- ✅ 포괄적 단위 테스트 시스템
- ⏳ 동영상 자막 추출 시스템 (구현 예정)

## 🚀 다음 구현 계획
1. **Cloudflare Stream 통합**: MP4 URL 업로드 기능
2. **Cloudflare Queues 설정**: 비동기 자막 추출 작업
3. **Azure Speech Services 통합**: 음성 인식 API
4. **자막 추출 엔드포인트**: 완전 자동화된 워크플로우
5. **진행률 추적**: 실시간 작업 상태 확인

## 🔗 운영 URL
- **API 서버**: https://aitutor.apiserver.kr
- **API 문서**: https://aitutor.apiserver.kr/docs
- **Health Check**: https://aitutor.apiserver.kr/health