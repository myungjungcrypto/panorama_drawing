import Anthropic from '@anthropic-ai/sdk';

const ANALYSIS_PROMPT = `You are a dental radiograph analysis expert. Analyze this panoramic dental X-ray (OPG) image.

For each of the 32 permanent adult teeth (FDI numbering: 11-18, 21-28, 31-38, 41-48), determine the status:

- "present": Normal tooth clearly visible
- "missing": Tooth is absent, empty space or no tooth structure visible at that position
- "crown": Tooth has a dental crown restoration (appears as a bright white cap, distinct metallic or ceramic restoration covering the entire crown)
- "implant": Dental implant visible (metallic screw/fixture in the bone, often with an abutment)
- "bridge": Part of a dental bridge (pontic or connected crowns spanning a gap)

Important notes:
- In panoramic X-rays, the patient's RIGHT side appears on the LEFT side of the image
- FDI quadrant 1 (upper right, teeth 11-18) appears on the LEFT side of the image
- FDI quadrant 2 (upper left, teeth 21-28) appears on the RIGHT side of the image
- FDI quadrant 3 (lower left, teeth 31-38) appears on the RIGHT side of the image
- FDI quadrant 4 (lower right, teeth 41-48) appears on the LEFT side of the image
- Wisdom teeth (18, 28, 38, 48) may be absent naturally - mark as "missing"
- Root canal treated teeth without a crown should be marked as "present"
- If a tooth position is ambiguous, default to "present"

Respond ONLY with a valid JSON object in this exact format, no other text:
{"11":"present","12":"present","13":"present","14":"present","15":"present","16":"present","17":"present","18":"missing","21":"present","22":"present","23":"present","24":"present","25":"present","26":"present","27":"present","28":"missing","31":"present","32":"present","33":"present","34":"present","35":"present","36":"present","37":"present","38":"missing","41":"present","42":"present","43":"present","44":"present","45":"present","46":"present","47":"present","48":"missing"}`;

export async function POST(request: Request) {
  try {
    const { imageData } = await request.json();

    if (!imageData) {
      return Response.json({ error: '이미지 데이터가 없습니다.' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local 파일에 API 키를 추가해주세요.' },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    // Extract base64 data and media type from data URL
    const match = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return Response.json({ error: '올바른 이미지 형식이 아닙니다.' }, { status: 400 });
    }

    const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    const base64Data = match[2];

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: ANALYSIS_PROMPT,
            },
          ],
        },
      ],
    });

    // Extract text response
    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return Response.json({ error: '분석 결과를 받지 못했습니다.' }, { status: 500 });
    }

    // Parse JSON from response
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: '분석 결과를 파싱할 수 없습니다.' }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);

    return Response.json({ result });
  } catch (error: unknown) {
    console.error('Analysis error:', error);
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ error: `분석 중 오류 발생: ${message}` }, { status: 500 });
  }
}
