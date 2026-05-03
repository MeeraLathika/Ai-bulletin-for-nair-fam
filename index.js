const Anthropic = require("@anthropic-ai/sdk");
const { Resend } = require("resend");
const cron = require("node-cron");
const http = require("http");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL; // must be your Resend account email on free tier

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const resend = new Resend(RESEND_API_KEY);

const BULLETIN_PROMPT = `You are a tech news anchor. Write a 5-minute AI & tech news bulletin (~650 words). Use web search for today's real news. Be specific — name companies, products, dollar amounts. Use these exact headers on their own line: OPENING, TOP STORY, INDUSTRY WATCH, QUICK HITS, CLOSING. Broadcast style, flowing paragraphs, no bullet points.`;

async function generateBulletin() {
  console.log("🔍 Fetching today's AI news...");
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Australia/Sydney"
  });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1000,
    system: BULLETIN_PROMPT,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: `Today is ${today} (AEST). Generate a 5-minute AI & tech news bulletin with today's real news from the past 24-48 hours.` }]
  });
  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  console.log("✅ Bulletin generated");
  return { text, date: today };
}

function formatEmailHTML(text, date) {
  const COLORS = { "OPENING":"#00c96e","TOP STORY":"#ff4444","INDUSTRY WATCH":"#4488ff","QUICK HITS":"#00ccee","CLOSING":"#00c96e" };
  const SECTIONS = ["OPENING","TOP STORY","INDUSTRY WATCH","QUICK HITS","CLOSING"];
  const sections = [];
  let cur = null, content = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    const m = SECTIONS.find(s => t === s || t.startsWith(s + ":"));
    if (m) { if (cur) sections.push({ title: cur, content: content.join("\n").trim() }); cur = m; content = []; }
    else if (cur) content.push(line);
  }
  if (cur) sections.push({ title: cur, content: content.join("\n").trim() });

  const sectionsHTML = sections.map(sec => {
    const color = COLORS[sec.title] || "#00c96e";
    const paras = sec.content.split(/\n\n+/).filter(Boolean)
      .map(p => `<p style="margin:0 0 14px 0;line-height:1.8;color:#333;">${p.replace(/\n/g," ")}</p>`).join("");
    return `<div style="margin-bottom:28px;padding:22px;background:#f9f9f9;border-radius:4px;border-left:4px solid ${color};">
      <div style="font-family:monospace;font-size:10px;letter-spacing:4px;color:${color};margin-bottom:12px;">${sec.title}</div>
      <div style="font-family:Georgia,serif;font-size:15px;">${paras}</div></div>`;
  }).join("");

  const wc = text.split(/\s+/).length;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">
<div style="background:white;border-radius:8px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<div style="border-bottom:2px solid #eee;padding-bottom:18px;margin-bottom:24px;">
<div style="display:inline-block;background:#ff4444;color:white;font-family:monospace;font-size:10px;letter-spacing:3px;padding:3px 9px;margin-bottom:8px;">DAILY BRIEFING</div>
<h1 style="margin:0 0 5px 0;font-family:monospace;font-size:24px;letter-spacing:5px;color:#111;font-weight:normal;">AI BRIEFING</h1>
<div style="font-family:monospace;font-size:11px;color:#888;">${date.toUpperCase()}</div>
<div style="font-family:monospace;font-size:10px;color:#bbb;margin-top:3px;">~${Math.round(wc/130)} MIN READ</div></div>
${sectionsHTML}
<div style="border-top:1px solid #eee;padding-top:14px;font-family:monospace;font-size:10px;color:#ccc;text-align:center;letter-spacing:2px;">AI BRIEFING · POWERED BY CLAUDE · 7AM AEST</div>
</div></div></body></html>`;
}

async function sendEmail(html, date) {
  console.log("📧 Sending via Resend...");
  const { data, error } = await resend.emails.send({
    from: "onboarding@resend.dev",   // Resend's own test sender — works on free tier
    to: [RECIPIENT_EMAIL],           // must be your Resend account email on free tier
    subject: `🤖 AI Briefing — ${date}`,
    html,
  });
  if (error) throw new Error(JSON.stringify(error));
  console.log(`✅ Email sent! ID: ${data.id}`);
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

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end("AI Briefing running."); })
  .listen(PORT, () => console.log(`✅ Health check on port ${PORT}`));

console.log("🚀 AI Briefing scheduler started");
console.log("⏰ Sends at 7:00am AEST (21:00 UTC) daily");

cron.schedule("0 21 * * *", () => { console.log("⏰ Cron fired"); runBulletin(); }, { timezone: "UTC" });

if (process.env.RUN_ON_START === "true") {
  console.log("🧪 Test run starting...");
  runBulletin();
}
