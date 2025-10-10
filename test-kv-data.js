/**
 * KV 데이터 확인 스크립트
 * f4d86c8ffbed032815287f11af8c4668 콘텐츠의 실제 데이터를 확인합니다.
 */

import { KVService } from './src/services/kv.js';

// Mock KV for testing
class MockKV {
  constructor() {
    this.data = new Map();
  }

  async get(key) {
    console.log(`🔍 KV GET: ${key}`);
    return this.data.get(key) || null;
  }

  async put(key, value) {
    console.log(`💾 KV PUT: ${key}`);
    this.data.set(key, value);
  }

  async list(options = {}) {
    const keys = Array.from(this.data.keys())
      .filter(key => !options.prefix || key.startsWith(options.prefix))
      .slice(0, options.limit || 100)
      .map(name => ({ name }));

    console.log(`📋 KV LIST: prefix=${options.prefix}, found=${keys.length} keys`);
    return { keys };
  }
}

async function testKVData() {
  console.log('📊 KV 데이터 확인 테스트');
  console.log('='.repeat(50));

  const mockKv = new MockKV();
  const kvService = new KVService(mockKv);

  const contentId = 'f4d86c8ffbed032815287f11af8c4668';

  // 1. Content Info 확인
  console.log('\n1️⃣ Content Info 확인');
  console.log('-'.repeat(30));

  try {
    const contentInfo = await kvService.getContentInfo(contentId);
    console.log(`✅ Content Info:`, contentInfo ? 'Found' : 'Not Found');
    if (contentInfo) {
      console.log(`   - Status: ${contentInfo.status}`);
      console.log(`   - Language: ${contentInfo.language}`);
      console.log(`   - Created: ${contentInfo.createdAt}`);
      console.log(`   - Progress: ${JSON.stringify(contentInfo.progress)}`);
    }
  } catch (error) {
    console.log(`❌ Content Info Error:`, error.message);
  }

  // 2. Content Subtitle 확인
  console.log('\n2️⃣ Content Subtitle 확인');
  console.log('-'.repeat(30));

  try {
    const subtitle = await kvService.getContentSubtitle(contentId);
    console.log(`✅ Subtitle:`, subtitle ? 'Found' : 'Not Found');
    if (subtitle) {
      console.log(`   - Language: ${subtitle.language}`);
      console.log(`   - Duration: ${subtitle.duration}`);
      console.log(`   - Format: ${subtitle.format}`);
      console.log(`   - Source: ${subtitle.source}`);
      console.log(`   - Segments: ${subtitle.segments ? subtitle.segments.length : 0}`);
      console.log(`   - Text Preview: "${subtitle.text?.substring(0, 100)}..."`);
    }
  } catch (error) {
    console.log(`❌ Subtitle Error:`, error.message);
  }

  // 3. Content Summary 확인
  console.log('\n3️⃣ Content Summary 확인');
  console.log('-'.repeat(30));

  try {
    const summary = await kvService.getContentSummary(contentId);
    console.log(`✅ Summary:`, summary ? 'Found' : 'Not Found');
    if (summary) {
      console.log(`   - Language: ${summary.language}`);
      console.log(`   - Duration: ${summary.duration}`);
      console.log(`   - Created: ${summary.createdAt}`);
      console.log(`   - Original Text Preview: "${summary.originalText?.substring(0, 100)}..."`);
      console.log(`   - Summary Preview: "${summary.summary?.substring(0, 200)}..."`);
    }
  } catch (error) {
    console.log(`❌ Summary Error:`, error.message);
  }

  // 4. 실제 API를 통해 데이터 가져오기 테스트
  console.log('\n4️⃣ 실제 API 데이터 확인');
  console.log('-'.repeat(30));

  const testUrls = [
    `https://aitutor.apiserver.kr/v1/content/status/${contentId}`,
    `https://aitutor.apiserver.kr/v1/content/subtitle/${contentId}`,
    `https://aitutor.apiserver.kr/v1/content/summary/${contentId}`
  ];

  for (const url of testUrls) {
    try {
      console.log(`🌐 API 요청: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkb21haW4iOiJsb2NhbGhvc3QiLCJpYXQiOjE3Mjg2NDI4NzEsImV4cCI6MTcyODcyOTI3MX0.Xa09fCZiJ-vr7CWQZ-EB7U5oirfXE6wQJIj5hF4kRaI'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ API 응답 성공:`, JSON.stringify(data, null, 2).substring(0, 300) + '...');
      } else {
        console.log(`❌ API 응답 실패: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.log(`   Error: ${errorText.substring(0, 200)}`);
      }
    } catch (error) {
      console.log(`❌ API 요청 실패:`, error.message);
    }
  }

  console.log('\n📊 KV 데이터 확인 완료');
}

// 실행
testKVData().catch(console.error);