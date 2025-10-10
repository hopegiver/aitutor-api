/**
 * 인증 토큰 생성 및 실제 데이터 확인 스크립트
 */

import crypto from 'crypto';

// 환경 설정
const config = {
  domain: 'localhost',
  authSecret: '7k9mN2pQ5rT8uW1xZ4aB6cE9fH2jK5nP8qS1vY4zA7bD0eG3hJ6kM9pR2tU5wX8z',
  apiBaseUrl: 'https://aitutor.apiserver.kr'
};

// 인증 키 생성
function generateAuthKey(domain, secret) {
  return crypto.createHash('sha256').update(domain + secret).digest('hex');
}

// JWT 토큰 획득
async function getJWTToken() {
  const authKey = generateAuthKey(config.domain, config.authSecret);

  console.log(`🔑 생성된 인증키: ${authKey.substring(0, 20)}...`);

  const response = await fetch(`${config.apiBaseUrl}/v1/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      domain: config.domain,
      authKey: authKey
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Auth failed: ${response.status} - ${errorText}`);
  }

  const authData = await response.json();
  console.log(`✅ JWT 토큰 획득 성공:`, authData);
  return authData.data?.token || authData.token;
}

// API 테스트
async function testAPIEndpoints(token, contentId) {
  const endpoints = [
    { path: `/v1/content/status/${contentId}`, desc: 'Content Status' },
    { path: `/v1/content/subtitle/${contentId}`, desc: 'Content Subtitle' },
    { path: `/v1/content/summary/${contentId}`, desc: 'Content Summary' },
    { path: `/v1/content/result/${contentId}`, desc: 'Content Result' }
  ];

  console.log(`\n📋 API 엔드포인트 테스트 (Content ID: ${contentId})`);
  console.log('='.repeat(60));

  for (const { path, desc } of endpoints) {
    try {
      console.log(`\n🌐 ${desc}: ${path}`);

      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`   응답 상태: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();

        if (data.success) {
          console.log(`   ✅ 성공: ${desc} 데이터 존재`);

          // 중요 정보만 표시
          if (data.data) {
            if (data.data.status) console.log(`      - 상태: ${data.data.status}`);
            if (data.data.language) console.log(`      - 언어: ${data.data.language}`);
            if (data.data.duration) console.log(`      - 길이: ${data.data.duration}초`);
            if (data.data.progress) console.log(`      - 진행률: ${JSON.stringify(data.data.progress)}`);
            if (data.data.segments) console.log(`      - 세그먼트 수: ${data.data.segments.length}`);
            if (data.data.originalText) console.log(`      - 원본 텍스트: "${data.data.originalText.substring(0, 100)}..."`);
            if (data.data.summary) console.log(`      - 요약: "${data.data.summary.substring(0, 100)}..."`);
          }
        } else {
          console.log(`   ❌ API 응답 성공하지만 데이터 없음: ${data.error || 'Unknown error'}`);
        }
      } else {
        const errorText = await response.text();
        console.log(`   ❌ API 요청 실패: ${errorText.substring(0, 200)}`);
      }
    } catch (error) {
      console.log(`   ❌ 요청 오류: ${error.message}`);
    }
  }
}

// Content 목록 확인
async function listContents(token) {
  console.log(`\n📋 전체 콘텐츠 목록 확인`);
  console.log('='.repeat(40));

  try {
    const response = await fetch(`${config.apiBaseUrl}/v1/content/contents`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();

      if (data.success && data.data.contents) {
        console.log(`✅ 총 ${data.data.total}개의 콘텐츠 발견`);

        data.data.contents.forEach((content, index) => {
          console.log(`\n${index + 1}. Content ID: ${content.contentId}`);
          console.log(`   - 상태: ${content.status}`);
          console.log(`   - 언어: ${content.language}`);
          console.log(`   - 길이: ${content.duration}초`);
          console.log(`   - 생성일: ${content.createdAt}`);
          console.log(`   - URL: ${content.videoUrl.substring(0, 50)}...`);
          if (content.summaryPreview) {
            console.log(`   - 요약 미리보기: "${content.summaryPreview}"`);
          }
        });

        return data.data.contents;
      } else {
        console.log(`❌ 콘텐츠 목록 없음: ${data.error || 'Unknown error'}`);
        return [];
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ 콘텐츠 목록 요청 실패: ${errorText}`);
      return [];
    }
  } catch (error) {
    console.log(`❌ 콘텐츠 목록 오류: ${error.message}`);
    return [];
  }
}

// 메인 실행 함수
async function main() {
  console.log('🚀 AI Tutor API 데이터 확인 테스트');
  console.log('='.repeat(50));

  try {
    // 1. JWT 토큰 획득
    const token = await getJWTToken();

    // 2. 전체 콘텐츠 목록 확인
    const contents = await listContents(token);

    // 3. 특정 콘텐츠 상세 정보 확인
    const targetContentId = 'f4d86c8ffbed032815287f11af8c4668';
    await testAPIEndpoints(token, targetContentId);

    // 4. 다른 콘텐츠들도 확인 (있다면)
    if (contents.length > 0) {
      console.log(`\n🔍 발견된 다른 콘텐츠들도 확인`);
      for (const content of contents.slice(0, 2)) { // 최대 2개만
        if (content.contentId !== targetContentId) {
          await testAPIEndpoints(token, content.contentId);
        }
      }
    }

    console.log('\n✅ 데이터 확인 테스트 완료');

  } catch (error) {
    console.error('❌ 테스트 실행 중 오류:', error.message);
  }
}

// 실행
main().catch(console.error);