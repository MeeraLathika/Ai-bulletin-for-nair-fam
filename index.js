const Anthropic = require("@anthropic-ai/sdk");
const nodemailer = require("nodemailer");
const cron = require("node-cron");

// ─── CONFIG (set these as environment variables on Render) ───────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GMAIL_USER = process.env.GMAIL_USER;         // your Gmail address
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD; // Gmail App Password
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL; // who receives the bulletin
// ─────────────────────────────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const BULLETIN_PROMPT = `You are a sharp tech news anchor. Write a 10-minute spoken AI & tech news bulletin (~1400 words).

Use web search to find TODAY's real news. Be specific — name companies, products, dollar amounts, people.

Structure (use these exact headers):
OPENING
TOP STORY
INDUSTRY WATCH
RESEARCH & BREAKTHROUGHS
BUSINESS & INVESTMENT
QUICK HITS
CLOSING

Write in broadcast style: conversational, punchy, present tense. Flowing paragraphs, no bullet points.`;

async function generateBulletin() {
  console.log("🔍 Fetching today's AI news...");

  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Australia/Sydney"
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: BULLETIN_PROMPT,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{
      role: "user",
      content: `Today is ${today} (AEST). Generate a full 10-minute AI & tech news bulletin with today's real, current news. Search for stories from the past 24-48 hours.`
    }]
  });

  const text = response.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n");

  console.log("✅ Bulletin generated successfully");
  return { text, date: today };
}

function formatEmailHTML(text, date) {
  const SECTION_COLORS = {
    "OPENING": "#00c96e",
    "TOP STORY": "#ff4444",
    "INDUSTRY WATCH": "#4488ff",
    "RESEARCH & BREAKTHROUGHS": "#cc44ff",
    "BUSINESS & INVESTMENT": "#ffaa00",
    "QUICK HITS": "#00ccee",
    "CLOSING": "#00c96e",
  };

  const SECTIONS = ["OPENING","TOP STORY","INDUSTRY WATCH","RESEARCH & BREAKTHROUGHS","BUSINESS & INVESTMENT","QUICK HITS","CLOSING"];

  // Parse into sections
  const sections = [];
  let currentSection = null;
  let currentContent = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const matched = SECTIONS.find(s => trimmed === s || trimmed.startsWith(s + ":"));
    if (matched) {
      if (currentSection) sections.push({ title: currentSection, content: currentContent.join("\n").trim() });
      currentSection = matched;
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) sections.push({ title: currentSection, content: currentContent.join("\n").trim() });

  const sectionsHTML = sections.map(sec => {
    const color = SECTION_COLORS[sec.title] || "#00c96e";
    const paragraphs = sec.content.split(/\n\n+/).filter(Boolean)
      .map(p => `<p style="margin:0 0 16px 0;line-height:1.8;color:#c8d8e8;">${p.replace(/\n/g, " ")}</p>`)
      .join("");

    return `
      <div style="margin-bottom:40px;padding:28px;background:#0d1923;border-radius:4px;border-left:4px solid ${color};">
        <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:4px;color:${color};margin-bottom:16px;text-transform:uppercase;">${sec.title}</div>
        <div style="font-family:Georgia,serif;font-size:15px;">${paragraphs}</div>
      </div>`;
  }).join("");

  const wordCount = text.split(/\s+/).length;
  const readMins = Math.round(wordCount / 130);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080c10;font-family:Georgia,serif;">
  <div style="max-width:680px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="border-bottom:1px solid #1e3a5f;padding-bottom:24px;margin-bottom:32px;">
      <div style="display:inline-block;background:#ff4444;color:white;font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;padding:4px 10px;margin-bottom:12px;">DAILY BRIEFING</div>
      <h1 style="margin:0 0 8px 0;font-family:'Courier New',monospace;font-size:28px;letter-spacing:8px;color:#00c96e;font-weight:normal;">AI BRIEFING</h1>
      <div style="font-family:'Courier New',monospace;font-size:11px;color:#4a6a8a;letter-spacing:2px;">${date.toUpperCase()}</div>
      <div style="font-family:'Courier New',monospace;font-size:10px;color:#2a4a6a;margin-top:6px;">~${readMins} MIN READ · ${wordCount} WORDS · ${sections.length} SEGMENTS</div>
    </div>

    <!-- Sections -->
    ${sectionsHTML}

    <!-- Footer -->
    <div style="border-top:1px solid #1e3a5f;padding-top:20px;font-family:'Courier New',monospace;font-size:10px;color:#2a4a6a;letter-spacing:2px;text-align:center;">
      GENERATED BY AI BRIEFING · POWERED BY CLAUDE · DELIVERED 7AM AEST
    </div>

  </div>
</body>
</html>`;
}

async function sendEmail(html, date) {
  console.log("📧 Sending email...");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"AI Briefing" <${GMAIL_USER}>`,
    to: RECIPIENT_EMAIL,
    subject: `🤖 AI Briefing — ${date}`,
    html,
  });

  console.log(`✅ Email sent to ${RECIPIENT_EMAIL}`);
}

async function runBulletin() {
  try {
    const { text, date } = await generateBulletin();
    const html = formatEmailHTML(text, date);
    await sendEmail(html, date);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// Keep Render happy — it expects an open port
const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("AI Briefing scheduler is running.");
}).listen(PORT, () => {
  console.log(`✅ Health check server on port ${PORT}`);
});

// 7am AEST = 9pm UTC (UTC+10 for AEST)
console.log("🚀 AI Briefing scheduler started");
console.log("⏰ Bulletin will send at 7:00am AEST (21:00 UTC) every day");

cron.schedule("0 21 * * *", () => {
  console.log("⏰ Cron triggered — generating bulletin...");
  runBulletin();
}, { timezone: "UTC" });

// Also run immediately on startup so you can test it right away
if (process.env.RUN_ON_START === "true") {
  console.log("🧪 RUN_ON_START enabled — sending test bulletin now...");
  runBulletin();
}
