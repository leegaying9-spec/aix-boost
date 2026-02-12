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

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());

const STATIC_DIR = __dirname;
app.use(express.static(STATIC_DIR));

// 모든 .html 요청 자동 처리
app.get("/:page.html", (req, res) => {
  const fileName = `${req.params.page}.html`;
  const filePath = path.join(STATIC_DIR, fileName);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send(`${fileName} 파일을 찾을 수 없습니다.`);
  }
});

// 첫 화면 설정
app.get("/", (req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

// 카드뉴스 스타일 이미지 생성 API
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
      prompt: `A professional 'Card News' infographic for Instagram. Topic: "${postData.title}". Style: Modern minimalist flat design, soft pastel palette, central 'notepaper' area for text, cute 3D icons about AI, 1:1 square ratio.`,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
