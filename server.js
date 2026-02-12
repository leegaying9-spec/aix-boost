import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
// 용량이 큰 데이터(이미지 등) 처리를 위해 limit 설정
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

// ==========================================
// 🛠 페이지 라우팅 설정 (중요)
// ==========================================

// 1. 첫 화면 접속 시 (preview.html이었던 index.html을 보여줌)
app.get("/", (req, res) => {
  const indexPath = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).send("index.html 파일을 찾을 수 없습니다.");
});

// 2. '시작하기' 버튼 클릭 시 (home.html로 이동)
app.get("/home.html", (req, res) => {
  const homePath = path.join(STATIC_DIR, "home.html");
  if (fs.existsSync(homePath)) {
    return res.sendFile(homePath);
  }
  res.status(404).send("home.html 파일을 찾을 수 없습니다. 파일명을 확인해주세요.");
});

// 3. 기타 HTML 파일들 (2P.html, sns.html 등)에 대한 자동 라우팅
app.get("/:filename.html", (req, res) => {
  const fileName = `${req.params.filename}.html`;
  const filePath = path.join(STATIC_DIR, fileName);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  res.status(404).send(`${fileName} 파일을 찾을 수 없습니다.`);
});

// ==========================================
// 🤖 AI 게시물 생성 API
// ==========================================
app.post("/api/generate-post", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ ok: false, error: "내용이 없습니다." });

    // 텍스트 생성
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "너는 SNS 게시물 작성자야. JSON 형식으로 제목(title), 내용(content), 해시태그(hashtags) 배열을 만들어줘." },
        { role: "user", content: transcript }
      ],
      response_format: { type: "json_object" }
    });

    const postData = JSON.parse(completion.choices[0].message.content);

    // 이미지 생성
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

// 서버 상태 확인용
app.get("/api/health", (req, res) => res.json({ ok: true, dir: STATIC_DIR }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
