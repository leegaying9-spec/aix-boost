import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
// 이미지 등 큰 데이터를 주고받을 수 있도록 제한 확장
app.use(express.json({ limit: "10mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ OpenAI Client 설정
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ CORS 설정
app.use(cors());

// ✅ 정적 폴더 경로: 현재 위치(Root)로 설정
const STATIC_DIR = __dirname; 
app.use(express.static(STATIC_DIR));

// ✅ 메인 페이지 라우트: index.html(구 preview)을 최우선으로 보냄
app.get("/", (req, res) => {
  const indexPath = path.join(STATIC_DIR, "index.html");
  
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  } else {
    // 파일이 없을 경우 디버깅을 위해 경로 표시
    return res.status(404).send(`index.html을 찾을 수 없습니다. (경로: ${indexPath})`);
  }
});

// ✅ 게시물 생성 API
app.post("/api/generate-post", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ ok: false, error: "내용이 없습니다." });

    // 1. 텍스트 생성
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "너는 SNS 게시물 작성자야. 반드시 JSON 형식으로만 응답해. 키값은 title, content, hashtags(배열)로 구성해줘." 
        },
        { role: "user", content: transcript }
      ],
      response_format: { type: "json_object" }
    });

    const postData = JSON.parse(completion.choices[0].message.content);

    // 2. 이미지 생성 (DALL-E 3)
    // 텍스트 생성에 성공한 제목을 기반으로 이미지 생성
    const image = await client.images.generate({
      model: "dall-e-3",
      prompt: `A high-quality social media background image related to: ${postData.title}. Professional and modern style.`,
      size: "1024x1024",
      response_format: "b64_json"
    });

    return res.json({
      ok: true,
      post: postData,
      image: { data_url: `data:image/png;base64,${image.data[0].b64_json}` }
    });
  } catch (err) {
    console.error("❌ API Error:", err);
    // API 키 만료나 잔액 부족 등 에러 메시지를 클라이언트에 전달
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 헬스체크용 (Vercel 배포 확인용)
app.get("/api/health", (req, res) => res.json({ ok: true, dir: STATIC_DIR }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
