import { sign, verify } from 'hono/jwt';

export class AuthService {
  constructor(secretKey, jwtSecret) {
    this.secretKey = secretKey;
    this.jwtSecret = jwtSecret;
  }

  // 도메인과 시크릿 키를 결합하여 SHA256 해시 생성
  async generateDomainHash(domain) {
    const message = domain + this.secretKey;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 클라이언트가 제공한 인증키와 도메인 검증
  async verifyDomain(domain, clientAuthKey) {
    const expectedHash = await this.generateDomainHash(domain);
    return expectedHash === clientAuthKey;
  }

  // JWT 토큰 생성
  async generateJWT(domain, additionalInfo = {}) {
    const payload = {
      domain,
      iat: Math.floor(Date.now() / 1000), // issued at
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24시간 후 만료
      ...additionalInfo
    };

    return await sign(payload, this.jwtSecret);
  }

  // JWT 토큰 검증
  async verifyJWT(token) {
    try {
      const payload = await verify(token, this.jwtSecret);

      // 만료 시간 체크
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }

      return payload;
    } catch (error) {
      throw new Error('Invalid token: ' + error.message);
    }
  }

  // 인증 체크 (Context에서 직접 호출)
  async authenticate(c) {
    try {
      const authHeader = c.req.header('Authorization');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Authorization header missing or invalid');
      }

      const token = authHeader.substring(7); // "Bearer " 제거
      const payload = await this.verifyJWT(token);

      return payload;
    } catch (error) {
      throw new Error('Authentication failed: ' + error.message);
    }
  }

  // 도메인별 추가 정보 생성 (필요에 따라 확장 가능)
  getDomainInfo(domain) {
    // 도메인에 따른 추가 정보 설정
    const domainInfo = {
      tier: 'standard', // basic, standard, premium 등
      maxRequestsPerDay: 1000,
      features: ['chat', 'quiz']
    };

    // 특정 도메인에 대한 커스텀 설정
    if (domain.includes('premium')) {
      domainInfo.tier = 'premium';
      domainInfo.maxRequestsPerDay = 10000;
    }

    return domainInfo;
  }
}