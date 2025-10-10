/**
 * 빠른 상태 확인 스크립트
 */

import crypto from 'crypto';

// 환경 설정
const config = {
  domain: 'localhost',
  authSecret: '7k9mN2pQ5rT8uW1xZ4aB6cE9fH2jK5nP8qS1vY4zA7bD0eG3hJ6kM9pR2tU5wX8z',
  apiBaseUrl: 'https://aitutor.apiserver.kr'
};

// JWT 토큰 획득
async function getJWTToken() {
  const authKey = crypto.createHash('sha256').update(config.domain + config.authSecret).digest('hex');

  const response = await fetch(`${config.apiBaseUrl}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: config.domain, authKey: authKey })
  });

  const authData = await response.json();
  return authData.token;
}

// 상태 확인
async function checkStatus(token, contentId, maxChecks = 20) {
  console.log(`🔍 빠른 상태 확인 (${maxChecks}회, 10초 간격)`);

  for (let i = 0; i < maxChecks; i++) {
    try {
      const response = await fetch(`${config.apiBaseUrl}/v1/content/status/${contentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const statusData = await response.json();
        const { status, progress } = statusData.data;

        console.log(`\n[${i + 1}] ${new Date().toLocaleTimeString()} - ${status}`);
        if (progress) {
          console.log(`    ${progress.stage} - ${progress.percentage}% - ${progress.message}`);
        }

        if (status === 'completed') {
          console.log(`✅ 완료!`);

          // 벡터 검색 테스트
          console.log(`\n🔍 벡터 검색 테스트`);
          const searchResponse = await fetch(`${config.apiBaseUrl}/v1/content/search?query=${encodeURIComponent('사이버 보안')}&topK=3`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            console.log(`✅ 검색 성공: ${searchData.data.total}개 결과 (score: ${searchData.data.results[0]?.score?.toFixed(3)})`);
          } else {
            console.log(`❌ 검색 실패: ${searchResponse.status}`);
          }
          return true;
        } else if (status === 'failed') {
          console.log(`❌ 실패:`);
          if (statusData.data.error) {
            console.log(`    ${statusData.data.error.message}`);
          }
          return false;
        }
      }

      // 10초 대기
      if (i < maxChecks - 1) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

    } catch (error) {
      console.log(`❌ 오류: ${error.message}`);
    }
  }

  return false;
}

// 실행
async function main() {
  try {
    const token = await getJWTToken();
    const contentId = 'f4d86c8ffbed032815287f11af8c4668';

    await checkStatus(token, contentId);
  } catch (error) {
    console.error('오류:', error.message);
  }
}

main().catch(console.error);