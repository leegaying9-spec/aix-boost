import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
// 이미지 데이터 전송을 위해 용량 제한을 늘립니다.
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

// ✅ 메인 페이지 라우트: 접속 시 preview.html을 먼저 보여줌
app.get("/", (req, res) => {
  const previewPath = path.join(STATIC_DIR, "preview.html");
  if (fs.existsSync(previewPath)) {
    return res.sendFile(previewPath);
  }
  res.status(404).send("첫 화면(preview.html)을 찾을 수 없습니다.");
});

// ✅ 개별 HTML 페이지들에 대한 경로 명시
app.get("/home.html", (req, res) => res.sendFile(path.join(STATIC_DIR, "home.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
app.get("/2P.html", (req, res) => res.sendFile(path.join(STATIC_DIR, "2P.html")));
app.get("/sns.html", (req, res) => res.sendFile(path.join(STATIC_DIR, "sns.html")));

// ✅ 게시물 및 카드뉴스 이미지 생성 API
app.post("/api/generate-post", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ ok: false, error: "내용이 없습니다." });

    // 1. 텍스트 콘텐츠 생성 (GPT-4o)
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "너는 SNS 카드뉴스 전문가야. 사용자의 입력 내용을 바탕으로 블로그나 인스타그램에 올리기 좋은 카드뉴스용 제목과 본문 내용을 JSON 형식으로 만들어줘. 구조: { \"title\": \"...\", \"content\": \"...\", \"hashtags\": [\"#...\", \"#...\"] }" 
        },
        { role: "user", content: transcript }
      ],
      response_format: { type: "json_object" }
    });

    const postData = JSON.parse(completion.choices[0].message.content);

    // 2. 카드뉴스 스타일 이미지 생성 (DALL-E 3)
    // 사용자님이 주신 참고 예시(깔끔한 배경, 메모지 스타일, 인포그래픽)를 반영한 프롬프트입니다.
    const image = await client.images.generate({
      model: "dall-e-3",
      prompt: `
        Professional "Card News" design for Instagram. 
        Theme: ${postData.title}.
        Visual Style: 
        - Clean, minimalist flat design with a soft pastel color scheme (mint and white).
        - A central white rectangular area resembling a clean memo paper or a notepad.
        - High-quality 2D vector illustrations and icons related to the theme.
        - No realistic photos, no human faces.
        - The layout should have a clear space at the top for a title and a structured body area with bullet points.
        - Overall feel should be modern, organized, and academic yet friendly, exactly like a professional infographic card.
        - Aspect ratio 1:1.
      `,
      size: "1024x1024",
      response_format: "b64_json"
    });

    return res.json({
      ok: true,
      post: postData,
      image: { data_url: `data:image/png;base64,${image.data[0].b64_json}` }
    });
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ 서버 상태 확인용 (Health Check)
app.get("/api/health", (req, res) => res.json({ ok: true, status: "running" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server ready on port ${PORT}`));
