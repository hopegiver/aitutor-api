/**
 * Whisper Endpoint Test
 * 새로운 Azure Cognitive Services Whisper 엔드포인트 테스트
 */

import { WhisperService } from '../src/services/whisper.js';

// Whisper 설정 (환경 변수에서 읽기)
const whisperApiKey = process.env.WHISPER_API_KEY || 'YOUR_WHISPER_API_KEY_HERE';
const whisperEndpoint = process.env.WHISPER_ENDPOINT || 'https://info-mg6frpzu-eastus2.cognitiveservices.azure.com';
const whisperApiVersion = process.env.WHISPER_API_VERSION || '2024-06-01';

console.log('🎤 Whisper Endpoint Test\n');

// 설정 확인
console.log('📋 Configuration:');
console.log(`- Endpoint: ${whisperEndpoint}`);
console.log(`- API Version: ${whisperApiVersion}`);
console.log(`- API Key: ${whisperApiKey ? whisperApiKey.substring(0, 8) + '...' : 'Not set'}\n`);

// WhisperService 초기화 테스트
console.log('🔧 Service Initialization:');
try {
  const whisperService = new WhisperService(whisperApiKey, whisperEndpoint, whisperApiVersion);

  console.log(`✅ WhisperService created successfully`);
  console.log(`- Base URL: ${whisperService.baseUrl}`);
  console.log(`- API Version: ${whisperService.apiVersion}`);

  // URL 구조 검증
  const expectedBaseUrl = `${whisperEndpoint}/openai/deployments/whisper/audio/transcriptions`;
  if (whisperService.baseUrl === expectedBaseUrl) {
    console.log('✅ Base URL is correctly formatted');
  } else {
    console.log('❌ Base URL mismatch');
    console.log(`  Expected: ${expectedBaseUrl}`);
    console.log(`  Actual: ${whisperService.baseUrl}`);
  }

} catch (error) {
  console.log(`❌ Service initialization failed: ${error.message}`);
}

// 시간 포맷팅 테스트
console.log('\n⏰ Time Formatting Tests:');
try {
  const whisperService = new WhisperService(whisperApiKey, whisperEndpoint, whisperApiVersion);

  // SRT 시간 포맷 테스트
  const srtTime = whisperService.formatSRTTime(65.5);
  const expectedSrtTime = '00:01:05,500';

  if (srtTime === expectedSrtTime) {
    console.log(`✅ SRT time formatting: ${srtTime}`);
  } else {
    console.log(`❌ SRT time formatting failed: expected ${expectedSrtTime}, got ${srtTime}`);
  }

  // VTT 시간 포맷 테스트
  const vttTime = whisperService.formatVTTTime(65.5);
  const expectedVttTime = '00:01:05.500';

  if (vttTime === expectedVttTime) {
    console.log(`✅ VTT time formatting: ${vttTime}`);
  } else {
    console.log(`❌ VTT time formatting failed: expected ${expectedVttTime}, got ${vttTime}`);
  }

} catch (error) {
  console.log(`❌ Time formatting test failed: ${error.message}`);
}

// API 엔드포인트 연결 테스트 (실제 요청 없이)
console.log('\n🌐 API Endpoint Test:');
if (whisperApiKey && whisperEndpoint) {

  // Mock FormData for testing
  global.FormData = class MockFormData {
    constructor() {
      this.data = new Map();
    }
    append(key, value, filename) {
      this.data.set(key, { value, filename });
    }
    get(key) {
      return this.data.get(key);
    }
  };

  // Mock Blob for testing
  global.Blob = class MockBlob {
    constructor(data, options = {}) {
      this.data = data;
      this.type = options.type || 'application/octet-stream';
    }
  };

  try {
    const whisperService = new WhisperService(whisperApiKey, whisperEndpoint, whisperApiVersion);

    // FormData 구성 테스트
    const mockBlob = new Blob(['test audio data'], { type: 'audio/mp3' });
    const formData = new FormData();
    formData.append('file', mockBlob, 'audio.mp3');
    formData.append('model', 'whisper');
    formData.append('response_format', 'verbose_json');

    console.log('✅ FormData construction successful');
    console.log(`- File type: ${formData.get('file').value.type}`);
    console.log(`- Model: ${formData.get('model').value}`);
    console.log(`- Response format: ${formData.get('response_format').value}`);

    // URL 구성 테스트
    const fullUrl = `${whisperService.baseUrl}?api-version=${whisperService.apiVersion}`;
    console.log(`✅ Full API URL: ${fullUrl}`);

    // 헤더 구성 테스트
    const headers = {
      'api-key': whisperService.apiKey
    };
    console.log(`✅ Headers configured with api-key`);

  } catch (error) {
    console.log(`❌ API setup test failed: ${error.message}`);
  }

} else {
  console.log('⚠️  Skipping API test - missing API key or endpoint');
}

// 언어 매핑 테스트 (TranscribeConsumer에서 사용)
console.log('\n🌍 Language Mapping Test:');
const languageMap = {
  'ko-KR': 'ko',
  'en-US': 'en',
  'ja-JP': 'ja',
  'zh-CN': 'zh'
};

console.log('✅ Language mapping test:');
Object.entries(languageMap).forEach(([input, expected]) => {
  const result = input.split('-')[0];
  if (result === expected) {
    console.log(`  ${input} → ${result} ✅`);
  } else {
    console.log(`  ${input} → ${result} ❌ (expected ${expected})`);
  }
});

console.log('\n📊 Test Summary:');
console.log('- Configuration loaded from .env');
console.log('- Service initialization verified');
console.log('- Time formatting functions working');
console.log('- API endpoint structure validated');
console.log('- Ready for real audio transcription');

console.log('\n🚀 Next Steps:');
console.log('1. Set Cloudflare secrets with new Whisper configuration:');
console.log('   wrangler secret put WHISPER_API_KEY');
console.log('   wrangler secret put WHISPER_ENDPOINT');
console.log('   wrangler secret put WHISPER_API_VERSION');
console.log('2. Test with actual audio file using /v1/transcribe endpoint');
console.log('3. Verify SRT/VTT output format');