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

// ===============================
// ✅ 현재 실행 중 파일/경로 확인용
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🧭 Running server file:", __filename);
console.log("🧭 Running server dir :", __dirname);

// ===============================
// ✅ OpenAI Client
// ===============================
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY가 .env에 없습니다.");
}
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ===============================
// ✅ CORS (로컬 개발용 넉넉하게 허용)
// ===============================
const allowedOrigins = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  })
);

// ===============================
// ✅ 요청 로깅(문제 추적용)
// ===============================
app.use((req, res, next) => {
  console.log(`➡️  ${req.method} ${req.url}`);
  next();
});

// ===============================
// ✅ 정적 폴더
// ===============================
const STATIC_DIR = path.resolve(__dirname, "..", "aixboost");
console.log("📁 STATIC_DIR:", STATIC_DIR);

if (!fs.existsSync(STATIC_DIR)) {
  console.error("❌ STATIC_DIR 폴더를 찾지 못했습니다:", STATIC_DIR);
} else {
  app.use(express.static(STATIC_DIR));
}

app.get("/", (req, res) => {
  const indexPath = path.join(STATIC_DIR, "index.html");
  const previewPath = path.join(STATIC_DIR, "preview.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  if (fs.existsSync(previewPath)) return res.sendFile(previewPath);
  return res.status(404).send("index.html / preview.html not found in STATIC_DIR");
});

// ===============================
// ✅ 헬스체크/라우트 확인용
// ===============================
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    serverFile: __filename,
    staticDir: STATIC_DIR,
    time: new Date().toISOString(),
  });
});

app.get("/api/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((m) => {
    if (m.route && m.route.path) {
      const methods = Object.keys(m.route.methods).join(",").toUpperCase();
      routes.push({ methods, path: m.route.path });
    }
  });
  res.json({ ok: true, routes });
});

// ===============================
// ✅ 카드뉴스 텍스트(JSON) 생성 (허위/추측 금지)
// ===============================
async function generateCardNewsJSON(transcript) {
  const resp = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "system",
        content: `
너는 한국어 카드뉴스(이미지 1장)용 글 구성 편집자다.
규칙:
- 허위/추측 금지. 전사에 없는 내용은 만들지 마.
- 고객센터/문의/댓글쓰기/상담/연락처 같은 문구 금지.
- 너무 길게 쓰지 마. 이미지에 들어갈 분량으로 압축.
- 반드시 아래 JSON 형식만 출력해. (코드블록 금지)

JSON 스키마:
{
  "title": "짧고 굵은 제목(15자 내외)",
  "hook": "한 줄 요약/후킹(25자 내외)",
  "bullets": ["핵심 1", "핵심 2", "핵심 3"],
  "hashtags": ["해시태그1","해시태그2","해시태그3"]
}
        `.trim(),
      },
      {
        role: "user",
        content: `전사 내용:\n${transcript}`,
      },
    ],
  });

  const text = (resp.output_text || "").trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  const jsonStr = firstBrace >= 0 && lastBrace >= 0 ? text.slice(firstBrace, lastBrace + 1) : text;

  let obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    obj = {
      title: "정리 결과",
      hook: "요약을 생성했어요",
      bullets: [text.slice(0, 40), text.slice(40, 80), text.slice(80, 120)].filter(Boolean),
      hashtags: ["말만해요"],
    };
  }

  obj.title = String(obj.title || "").trim();
  obj.hook = String(obj.hook || "").trim();
  obj.bullets = Array.isArray(obj.bullets) ? obj.bullets.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 5) : [];
  obj.hashtags = Array.isArray(obj.hashtags)
    ? obj.hashtags.map((h) => String(h || "").trim().replace(/^#/, "")).filter(Boolean).slice(0, 8)
    : [];

  while (obj.bullets.length < 3) obj.bullets.push("");

  return obj;
}

// ===============================
// ✅ 이미지에는 해시태그 제외 (요청사항)
// ===============================
function stripHashtagsForImage(text) {
  return String(text || "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .replace(/#\S+/g, "")
    .trim();
}

// ===============================
// ✅ 카드뉴스 이미지 프롬프트 (해시태그/브랜드 텍스트 금지)
// ===============================
function buildCardNewsImagePrompt(post) {
  const title = String(post?.title || "오늘의 정리").trim();
  const hook = String(post?.hook || "").trim();
  const bullets = Array.isArray(post?.bullets) ? post.bullets.slice(0, 3) : [];

  return `
Create a 1024x1024 square Korean informational SNS card design.

This is a clean modern card-news layout with a small related illustration.

ABSOLUTE RULES:
- No logo
- No brand name
- No hashtags
- No watermark
- Korean text must be sharp and readable

LAYOUT:
- Soft light background (#F8FAFC).
- Centered rounded card with subtle shadow.
- Large bold Korean title at top.
- Subtitle below title.
- 3 clean bullet points.
- Add a small minimal flat illustration related to the topic,
  positioned in the bottom-right or top-right corner.
- Illustration must be simple, flat vector style, not realistic.
- Illustration should NOT overlap text.
- Generous whitespace.

TEXT:

Title:
${title}

Subtitle:
${hook || ""}

Bullets:
1. ${bullets[0] || ""}
2. ${bullets[1] || ""}
3. ${bullets[2] || ""}

Single 1024x1024 image only.
`.trim();
}
// ===============================
// ✅ 이미지 생성
// ===============================
async function generateImage(prompt) {
  const img = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
  });
  return img.data[0].b64_json;
}

// ===============================
// ✅ 문자열로도 같이 내려주기 (3P.html 호환용)
// ===============================
function postToText(post) {
  const t = [];
  if (post?.title) t.push(`【${post.title}】`);
  if (post?.hook) t.push(post.hook);
  if (Array.isArray(post?.bullets) && post.bullets.length) {
    t.push("");
    post.bullets.slice(0, 3).forEach((b, i) => t.push(`${i + 1}. ${b}`));
  }
  if (Array.isArray(post?.hashtags) && post.hashtags.length) {
    t.push("");
    t.push(post.hashtags.map((h) => (String(h).startsWith("#") ? h : "#" + h)).join(" "));
  }
  return t.join("\n").trim();
}

// ===============================
// ✅ 생성 핸들러
// ===============================
async function handleGeneratePost(req, res) {
  try {
    const transcript = req.body?.transcript;
    if (!transcript || !String(transcript).trim()) {
      return res.status(400).json({ ok: false, error: "No transcript" });
    }

    // 1) 카드뉴스용 텍스트(JSON) 생성
    const postObj = await generateCardNewsJSON(transcript);

    // 2) 카드뉴스 이미지(텍스트 포함) 1장 생성 (브랜드/해시태그 금지 적용)
    const imagePrompt = buildCardNewsImagePrompt(postObj);
    const imageBase64 = await generateImage(imagePrompt);

    const postText = postToText(postObj);

    return res.json({
      ok: true,
      post: postObj,
      post_text: postText,
      image: {
        data_url: `data:image/png;base64,${imageBase64}`,
      },
    });
  } catch (err) {
    console.error("❌ handleGeneratePost error:", err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

// ✅ 네 3P.html이 호출하는 주소
app.post("/api/generate-post", handleGeneratePost);

// ✅ 혹시 프론트가 다른 주소를 쓰는 경우 대비(별칭)
app.post("/api/generate", handleGeneratePost);

// ===============================
// ✅ 404 핸들러
// ===============================
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not Found",
    method: req.method,
    path: req.path,
    hint: "서버에 해당 라우트가 등록되지 않았습니다. /api/routes 로 확인하세요.",
  });
});

// ===============================
const PORT = 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on http://localhost:" + PORT);
  console.log("✅ Health check: http://localhost:" + PORT + "/api/health");
  console.log("✅ Routes list : http://localhost:" + PORT + "/api/routes");
});
