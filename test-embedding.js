/**
 * OpenAI Embedding API 테스트
 */

console.log('🔧 OpenAI Embedding API 테스트 시작...');

const testOpenAIEmbedding = async () => {
  try {
    // OpenAI API 호출 (AI Gateway 통해)
    const apiKey = process.env.OPENAI_API_KEY || 'your-openai-api-key';
    const accountId = 'd2b8c5524b7259214fa302f1fecb4ad6';
    const baseUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/aitutor/openai`;

    console.log('📡 AI Gateway 엔드포인트:', baseUrl);

    const testText = '재택근무 보안 수칙';
    console.log('📝 테스트 텍스트:', testText);

    const response = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: testText,
        encoding_format: 'float'
      })
    });

    console.log('📊 응답 상태:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ 오류 응답:', errorText);
      return;
    }

    const data = await response.json();

    console.log('✅ 응답 구조 분석:');
    console.log('  - object:', data.object);
    console.log('  - model:', data.model);
    console.log('  - data 배열 길이:', data.data?.length);

    if (data.data && data.data[0]) {
      console.log('  - 첫 번째 임베딩:');
      console.log('    - object:', data.data[0].object);
      console.log('    - index:', data.data[0].index);
      console.log('    - embedding 차원:', data.data[0].embedding?.length);

      if (data.data[0].embedding && data.data[0].embedding.length > 0) {
        console.log('    - 첫 5개 값:', data.data[0].embedding.slice(0, 5).map(v => v.toFixed(4)).join(', '));
        console.log('    - 데이터 타입:', typeof data.data[0].embedding[0]);
      }
    }

    if (data.usage) {
      console.log('  - 사용량:');
      console.log('    - prompt_tokens:', data.usage.prompt_tokens);
      console.log('    - total_tokens:', data.usage.total_tokens);
    }

  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    console.error('세부사항:', error);
  }
};

testOpenAIEmbedding();