const Anthropic = require("@anthropic-ai/sdk");
const { Resend } = require("resend");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL;

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const resend = new Resend(RESEND_API_KEY);

async function generateBulletin() {
  console.log("Fetching today's AI news...");
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Australia/Sydney"
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{
      role: "user",
      content: `Today is ${today} AEST. Search for today's top AI and tech news stories from the last 24 hours and write a 5-minute briefing email. Write it as plain readable paragraphs with these bold section labels before each section: **OPENING**, **TOP STORY**, **INDUSTRY WATCH**, **QUICK HITS**, **CLOSING**. Be specific with company names, dollar amounts, and facts. After each story, include a clickable source link in markdown format like [Read more](https://url.com). Around 600 words total.`
    }]
  });

  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  console.log("Bulletin generated, length:", text.length, "chars");
  return { text, date: today };
}

function mdLinksToHTML(text) {
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" style="color:#4488ff;font-weight:600;text-decoration:none;">$1 ↗</a>');
}

function formatEmailHTML(text, date) {
  const COLORS = {
    "OPENING": "#00c96e",
    "TOP STORY": "#ff4444",
    "INDUSTRY WATCH": "#4488ff",
    "QUICK HITS": "#00ccee",
    "CLOSING": "#00c96e"
  };

  let html = text;

  Object.entries(COLORS).forEach(([label, color]) => {
    const regex = new RegExp(`\\*\\*${label}\\*\\*`, 'gi');
    html = html.replace(regex,
      `</div><div style="margin-bottom:28px;padding:22px;background:#f9f9f9;border-radius:4px;border-left:4px solid ${color};">` +
      `<div style="font-family:monospace;font-size:10px;letter-spacing:4px;color:${color};margin-bottom:14px;">${label}</div>`
    );
  });

  html = html.split(/\n\n+/).map(para => {
    para = para.trim();
    if (!para) return "";
    if (para.includes("style=")) return para;
    para = mdLinksToHTML(para);
    return `<p style="margin:0 0 14px 0;line-height:1.8;color:#333;font-family:Georgia,serif;font-size:15px;">${para.replace(/\n/g, " ")}</p>`;
  }).join("");

  html += "</div>";
  html = html.replace(/^<\/div>/, "");

  const wc = text.split(/\s+/).length;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">
<div style="background:white;border-radius:8px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<div style="border-bottom:2px solid #eee;padding-bottom:18px;margin-bottom:24px;">
  <div style="display:inline-block;background:#ff4444;color:white;font-family:monospace;font-size:10px;letter-spacing:3px;padding:3px 9px;margin-bottom:8px;">DAILY BRIEFING</div>
  <h1 style="margin:0 0 5px 0;font-family:monospace;font-size:24px;letter-spacing:5px;color:#111;font-weight:normal;">AI BRIEFING</h1>
  <div style="font-family:monospace;font-size:11px;color:#888;">${date.toUpperCase()}</div>
  <div style="font-family:monospace;font-size:10px;color:#bbb;margin-top:3px;">~${Math.round(wc / 130)} MIN READ</div>
</div>
${html}
<div style="border-top:1px solid #eee;padding-top:14px;margin-top:8px;font-family:monospace;font-size:10px;color:#ccc;text-align:center;letter-spacing:2px;">
  AI BRIEFING · POWERED BY CLAUDE · 7AM AEST
</div>
</div></div></body></html>`;
}

async function sendEmail(html, date) {
  console.log("Sending via Resend...");
  const { data, error } = await resend.emails.send({
    from: "AI Briefing <onboarding@resend.dev>",
    to: [RECIPIENT_EMAIL],
    subject: `AI Briefing: ${date}`,
    html,
  });
  if (error) throw new Error(JSON.stringify(error));
  console.log("Email sent! ID:", data.id);
}

// Run once and exit — designed for Render Cron Job
async function main() {
  console.log("=== AI Briefing starting ===");
  try {
    const { text, date } = await generateBulletin();
    const html = formatEmailHTML(text, date);
    await sendEmail(html, date);
    console.log("=== Done! Exiting. ===");
    process.exit(0);
  } catch (err) {
    console.error("=== Failed:", err.message, "===");
    process.exit(1);
  }
}

main();
