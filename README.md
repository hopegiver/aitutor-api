# AI Tutor API

Hono 프레임워크와 Cloudflare Workers 기반 AI 튜터 API 서버입니다. OpenAI API를 사용하여 스트리밍 방식의 실시간 AI 튜터링을 제공합니다.

## 기능

- **Hono 프레임워크**: 빠르고 경량화된 웹 프레임워크
- **스트리밍 채팅**: 실시간 AI 응답
- **튜터 모드**: 교육에 특화된 AI 응답
- **CORS 지원**: 웹 애플리케이션에서 직접 호출 가능
- **에러 핸들링**: 포괄적인 입력 검증 및 에러 처리

## API 엔드포인트

### POST /v1/chat
일반적인 채팅 대화를 위한 엔드포인트

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello!"
    }
  ],
  "options": {
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "maxTokens": 1000
  }
}
```

### POST /v1/tutor
교육에 특화된 튜터 모드 엔드포인트

```json
{
  "question": "What is photosynthesis?",
  "context": "I'm a high school student learning biology",
  "options": {
    "model": "gpt-3.5-turbo",
    "temperature": 0.5,
    "maxTokens": 1500
  }
}
```

### GET /health
서버 상태 확인

## 설치 및 배포

1. 의존성 설치:
```bash
npm install
```

2. 환경 변수 설정:
```bash
cp .env.example .env
# .env 파일에 OpenAI API 키 설정
```

3. 로컬 개발:
```bash
npm run dev
```

4. 배포:
```bash
npm run deploy
```

## 환경 변수

- `OPENAI_API_KEY`: OpenAI API 키 (필수)

## 사용 예제

```javascript
// 스트리밍 응답 받기
const response = await fetch('/v1/tutor', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    question: '미적분학이 무엇인가요?',
    context: '고등학생 수준으로 설명해주세요'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  console.log(chunk); // 실시간으로 응답 출력
}
```