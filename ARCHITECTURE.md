# 아키텍처 가이드

## 📁 프로젝트 구조

```
src/
├── config/                 # 설정 파일들
│   └── constants.js        # 상수 정의
├── controllers/            # 컨트롤러 레이어
│   ├── chatController.js
│   └── tutorController.js
├── middleware/             # 미들웨어들
│   ├── errorHandler.js     # 에러 처리
│   └── validation.js       # 검증 로직
├── routes/                 # 라우터들
│   └── v1/
│       ├── index.js
│       ├── chat.js
│       └── tutor.js
├── services/               # 비즈니스 로직
│   ├── openai.js
│   ├── chatService.js
│   └── tutorService.js
├── utils/                  # 유틸리티 함수들
│   ├── logger.js
│   ├── utils.js
│   └── validation.js
└── index.js               # 앱 진입점
```

## 🏗️ 아키텍처 원칙

### 1. 계층 분리 (Layered Architecture)
- **라우터**: HTTP 요청 라우팅만 담당
- **컨트롤러**: 요청/응답 처리, 입출력 변환
- **서비스**: 비즈니스 로직 처리
- **유틸리티**: 공통 기능 및 헬퍼 함수

### 2. 에러 격리 (Error Isolation)
```javascript
// 각 엔드포인트는 독립적인 에러 처리
export const asyncHandler = (fn) => {
  return async (c, next) => {
    try {
      return await fn(c, next);
    } catch (error) {
      return errorHandler(error, c); // 에러가 다른 엔드포인트에 영향 없음
    }
  };
};
```

### 3. 미들웨어 시스템
- **전역 미들웨어**: 로깅, CORS
- **라우트 미들웨어**: API 키 검증, Rate Limiting
- **에러 미들웨어**: 중앙화된 에러 처리

## 🛡️ 에러 처리 전략

### 커스텀 에러 클래스
```javascript
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // 예상된 에러인지 구분
  }
}
```

### 에러 격리 메커니즘
1. **Try-Catch 래퍼**: 각 핸들러는 `asyncHandler`로 래핑
2. **에러 전파 방지**: 한 엔드포인트의 에러가 다른 엔드포인트에 영향 없음
3. **구조화된 에러 응답**: 일관된 에러 형식

## 📊 새로운 엔드포인트 추가 가이드

### 1. 서비스 생성
```javascript
// src/services/newService.js
export class NewService {
  async processData(data) {
    // 비즈니스 로직
  }
}
```

### 2. 컨트롤러 생성
```javascript
// src/controllers/newController.js
import { NewService } from '../services/newService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export class NewController {
  async handleRequest(c) {
    // 요청 처리 로직
  }
}
```

### 3. 라우트 생성
```javascript
// src/routes/v1/new.js
import { Hono } from 'hono';
import { NewController } from '../../controllers/newController.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const newRoutes = new Hono();
const controller = new NewController();

newRoutes.post('/', asyncHandler(controller.handleRequest.bind(controller)));

export default newRoutes;
```

### 4. 메인 라우터에 등록
```javascript
// src/routes/v1/index.js
import newRoutes from './new.js';

v1Routes.route('/new', newRoutes);
```

## 🚀 확장성 고려사항

### 1. 버전 관리
- `/v1`, `/v2` 등으로 API 버전 분리
- 기존 버전 유지하면서 새 버전 추가 가능

### 2. Rate Limiting
- 엔드포인트별 독립적인 제한
- 리소스 사용량에 따른 차등 적용

### 3. 로깅 시스템
- 구조화된 JSON 로그
- 엔드포인트별 성능 모니터링
- 에러 추적 및 디버깅

### 4. 미들웨어 체인
- 재사용 가능한 미들웨어 컴포넌트
- 조건부 미들웨어 적용
- 성능 최적화

## 🔒 보안 고려사항

1. **입력 검증**: 모든 입력에 대한 sanitization
2. **API 키 검증**: 엔드포인트별 API 키 확인
3. **Rate Limiting**: DDoS 방지
4. **에러 정보 노출 방지**: 운영 에러와 개발 에러 구분

이 아키텍처를 통해 각 엔드포인트가 독립적으로 작동하고, 확장 가능하며, 유지보수가 용이한 API 서버를 구축할 수 있습니다.