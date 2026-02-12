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

// ==========================================
// 🛠 페이지 라우팅 설정
// ==========================================
app.get("/", (req, res) => {
  const indexPath = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send("index.html 파일을 찾을 수 없습니다.");
});

app.get("/home.html", (req, res) => {
  const homePath = path.join(STATIC_DIR, "home.html");
  if (fs.existsSync(homePath)) return res.sendFile(homePath);
  res.status(404).send("home.html 파일을 찾을 수 없습니다. 파일명을 확인해주세요.");
});

app.get("/:filename.html", (req, res) => {
  const fileName = `${req.params.filename}.html`;
  const filePath = path.join(STATIC_DIR, fileName);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.status(404).send(`${fileName} 파일을 찾을 수 없습니다.`);
});

// ==========================================
// 🤖 AI 게시물 생성 API
// ==========================================
app.post("/api/generate-post", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) {
      return res.status(400).json({ ok: false, error: "내용이 없습니다." });
    }

    // 1) 텍스트 생성 (제목/본문/해시태그)
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "너는 SNS 게시물 작성자야. 반드시 JSON 형식으로만 출력해. 키는 title, content, hashtags(배열)만 사용해.",
        },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
    });

    const postData = JSON.parse(completion.choices[0].message.content);

    // 2) 이미지 생성: 카드뉴스 '배경'만 만들기 (텍스트 넣지 말라고 강하게 지시)
    //    -> 글자는 프론트에서 Canvas로 얹어서 '진짜 카드뉴스'를 만든다.
    const title = String(postData.title || "").slice(0, 60);
    const content = String(postData.content || "").slice(0, 180);

    const imagePrompt = `
Create a clean square background illustration for a Korean SNS card-news.
Theme: "${title}".
Context: "${content}".

STYLE:
- modern minimal, flat/vector 느낌 + 은은한 그라데이션
- SNS 카드뉴스 배경처럼 여백 충분, 중앙에 넓은 빈 공간(텍스트 올릴 자리)
- 색감: 밝고 산뜻한 파스텔 톤, 너무 복잡하지 않게
- simple icons/shapes related to the theme (subtle)

IMPORTANT:
- NO TEXT, NO LETTERS, NO WORDS, NO LOGOS.
- Do not draw any writing at all.
- Keep composition clean and uncluttered.
`.trim();

    const image = await client.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      size: "1024x1024",
      response_format: "b64_json",
    });

    return res.json({
      ok: true,
      post: postData,
      // 배경 이미지
      image: { data_url: `data:image/png;base64,${image.data[0].b64_json}` },
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
