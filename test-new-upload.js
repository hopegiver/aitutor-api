/**
 * 새로운 동영상 업로드 테스트 스크립트
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
  console.log(`✅ JWT 토큰 획득 성공`);
  return authData.token;
}

// 동영상 업로드 테스트
async function uploadVideo(token, videoUrl, force = true) {
  console.log(`\n📹 동영상 업로드 요청`);
  console.log(`   URL: ${videoUrl}`);
  console.log(`   Force: ${force}`);

  const response = await fetch(`${config.apiBaseUrl}/v1/content/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      videoUrl: videoUrl,
      language: 'ko-KR',
      force: force,
      options: {
        format: 'vtt',
        timestamps: true,
        wordTimestamps: false
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  const uploadData = await response.json();
  console.log(`✅ 업로드 요청 성공:`, uploadData);
  return uploadData.data;
}

// 상태 모니터링
async function monitorProgress(token, contentId, maxAttempts = 60) {
  console.log(`\n🔍 진행률 모니터링 시작 (Content ID: ${contentId})`);
  console.log(`   최대 ${maxAttempts}회 확인, 30초 간격`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${config.apiBaseUrl}/v1/content/status/${contentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const statusData = await response.json();
        const { status, progress } = statusData.data;

        console.log(`\n[${i + 1}/${maxAttempts}] 상태: ${status}`);
        if (progress) {
          console.log(`   단계: ${progress.stage}`);
          console.log(`   진행률: ${progress.percentage}%`);
          console.log(`   메시지: ${progress.message}`);
        }

        if (status === 'completed') {
          console.log(`✅ 처리 완료!`);
          return true;
        } else if (status === 'failed') {
          console.log(`❌ 처리 실패:`);
          if (statusData.data.error) {
            console.log(`   오류: ${statusData.data.error.message}`);
          }
          return false;
        }
      } else {
        console.log(`❌ 상태 확인 실패: ${response.status}`);
      }

      // 30초 대기
      if (i < maxAttempts - 1) {
        console.log(`   ⏳ 30초 대기...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }

    } catch (error) {
      console.log(`❌ 상태 확인 오류: ${error.message}`);
    }
  }

  console.log(`⏰ 시간 초과 (${maxAttempts * 30}초)`);
  return false;
}

// 최종 결과 확인
async function checkFinalResults(token, contentId) {
  console.log(`\n📊 최종 결과 확인`);

  const endpoints = [
    { path: `/v1/content/subtitle/${contentId}`, name: 'Subtitle' },
    { path: `/v1/content/summary/${contentId}`, name: 'Summary' },
    { path: `/v1/content/result/${contentId}`, name: 'Result' }
  ];

  for (const { path, name } of endpoints) {
    try {
      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${name}: 데이터 존재`);

        if (data.data.segments) {
          console.log(`   세그먼트 수: ${data.data.segments.length}`);
        }
        if (data.data.originalText) {
          console.log(`   원본 텍스트: "${data.data.originalText.substring(0, 100)}..."`);
        }
        if (data.data.summary) {
          console.log(`   요약: "${data.data.summary.substring(0, 100)}..."`);
        }
      } else {
        console.log(`❌ ${name}: 응답 실패 (${response.status})`);
      }
    } catch (error) {
      console.log(`❌ ${name}: 오류 (${error.message})`);
    }
  }
}

// 벡터 검색 테스트
async function testVectorSearch(token, query = '사이버 보안') {
  console.log(`\n🔍 벡터 검색 테스트: "${query}"`);

  try {
    const response = await fetch(`${config.apiBaseUrl}/v1/content/search?query=${encodeURIComponent(query)}&topK=3`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const searchData = await response.json();
      console.log(`✅ 검색 성공: ${searchData.data.total}개 결과`);

      searchData.data.results.forEach((result, index) => {
        console.log(`\n${index + 1}. [점수: ${result.score?.toFixed(3)}]`);
        console.log(`   ID: ${result.id}`);
        console.log(`   타입: ${result.type}`);
        console.log(`   텍스트: "${result.text?.substring(0, 80)}..."`);
      });
    } else {
      const errorText = await response.text();
      console.log(`❌ 검색 실패: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.log(`❌ 검색 오류: ${error.message}`);
  }
}

// 메인 실행 함수
async function main() {
  console.log('🚀 새로운 동영상 업로드 및 벡터 인덱싱 테스트');
  console.log('='.repeat(60));

  try {
    // 1. JWT 토큰 획득
    const token = await getJWTToken();

    // 2. 동영상 업로드 (동일한 URL로 강제 재처리)
    const videoUrl = 'https://wintersday.v4.wecandeo.com/file/1055/30072/V77853.mp4';
    const uploadResult = await uploadVideo(token, videoUrl, true);

    // 3. 진행률 모니터링
    const success = await monitorProgress(token, uploadResult.contentId);

    if (success) {
      // 4. 최종 결과 확인
      await checkFinalResults(token, uploadResult.contentId);

      // 5. 벡터 검색 테스트
      await testVectorSearch(token, '사이버 보안');
      await testVectorSearch(token, '재택근무');
      await testVectorSearch(token, '메타버스');
    }

    console.log('\n✅ 전체 테스트 완료');

  } catch (error) {
    console.error('❌ 테스트 실행 중 오류:', error.message);
  }
}

// 실행
main().catch(console.error);