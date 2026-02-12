import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
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

// ✅ [수정 포인트] 메인 페이지 라우트: index.html 대신 preview.html을 보냄
app.get("/", (req, res) => {
  const previewPath = path.join(STATIC_DIR, "preview.html");
  
  if (fs.existsSync(previewPath)) {
    return res.sendFile(previewPath);
  } else {
    // 혹시라도 preview.html이 없으면 index.html이라도 보냄
    const indexPath = path.join(STATIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    
    return res.status(404).send("첫 페이지(preview.html)를 찾을 수 없습니다.");
  }
});

// ✅ 게시물 생성 API
app.post("/api/generate-post", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ ok: false, error: "내용이 없습니다." });

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "너는 SNS 게시물 작성자야. JSON 형식으로 제목(title), 내용(content), 해시태그(hashtags) 배열을 만들어줘." },
        { role: "user", content: transcript }
      ],
      response_format: { type: "json_object" }
    });

    const postData = JSON.parse(completion.choices[0].message.content);

    const image = await client.images.generate({
      model: "dall-e-3",
      prompt: `SNS post style image about: ${postData.title}`,
      size: "1024x1024",
      response_format: "b64_json"
    });

    return res.json({
      ok: true,
      post: postData,
      image: { data_url: `data:image/png;base64,${image.data[0].b64_json}` }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 헬스체크용
app.get("/api/health", (req, res) => res.json({ ok: true, dir: STATIC_DIR }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
