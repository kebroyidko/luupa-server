import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.ALIBABA_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

const REGIONS = [
  "Toshkent shahri", "Andijon", "Buxoro", "Farg'ona", "Jizzax",
  "Namangan", "Navoiy", "Qashqadaryo", "Samarqand", "Sirdaryo",
  "Surxondaryo", "Toshkent", "Xorazm", "Qoraqalpog'iston Respublikasi",
];

export async function detectRegion(description) {
  if (!description) return null;

  const completion = await openai.chat.completions.create({
    model: "qwen3.5-flash-2026-02-23",
    messages: [
      {
        role: "system",
        content: `You are a location detector. Given a Telegram channel description, identify which Uzbekistan region it belongs to. Reply with ONLY one of these exact values or null if not determinable: ${REGIONS.join(", ")}. Do not add any explanation.`,
      },
      { role: "user", content: description },
    ],
    temperature: 0.1,
    enable_thinking: false,
  });

  const result = completion.choices[0].message.content.trim();
  return REGIONS.includes(result) ? result : null;
}
