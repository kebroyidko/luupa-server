import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.ALIBABA_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

const REGIONS = [
  "Andijon", "Buxoro", "Farg'ona", "Jizzax",
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
  console.log(result);
  return REGIONS.includes(result) ? result : null;
}

export async function extractProducts(posts, categories) {
  const categoryInstructions = categories.map(cat => {
    const fields = (cat.metaFields ?? []).map(f => {
      let desc = `"${f.key}" (${f.type}`;
      if (f.type === "select") desc += `, options: ${f.options.join(", ")}`;
      desc += `)`;
      return desc;
    }).join(", ");
    return `- ${cat.name} (id: ${cat.id})${fields ? `: meta fields: ${fields}` : ": no meta fields"}`;
  }).join("\n");

  const systemPrompt = `You are a product extraction assistant for an Uzbek marketplace.
  You receive a batch of Telegram channel posts and must analyze each one.

  For each post return a JSON object with:
  - "post_id": the message id (integer)
  - "is_product": true ONLY if the post is a SINGLE specific product listing for sale, false otherwise
  - "is_sold": true if the post indicates a product is sold out, false otherwise
  - "reply_to_id": the post_id this message replies to, or null

  A post must be marked "is_product": false if:
  - It is a price list with multiple products or models (even if they are similar items)
  - It is an announcement, news, or informational post
  - It is an advertisement for a service, not a physical product
  - It is a channel promotion or link sharing post
  - It contains a list of prices for different variants/configurations without specifying a single item being sold
  - It is a general availability update (e.g. "bugungi narxlar", "today's prices")
  - It has more than 3 price entries — this strongly indicates a price list, not a single product

  A post must be marked "is_product": true ONLY if:
  - It lists a single specific item for sale with a specific price
  - It has photos of the specific item being sold
  - It describes one product's condition, specs, and price
  - The seller is offering one specific unit, not a catalog

  If "is_product" is true, also include:
  - "name": short product title extracted from the post (string)
  - "price": { "amount": number, "currency": "USD" or "UZS" } or null if no price found
  - "category_id": one of the category ids below, or null if none match
  - "meta": object with only the meta fields defined for the matched category, extracted from the post. Use null for fields not mentioned.
  - "region": one of these exact values or null: ${REGIONS.join(", ")}. Only for marketplace posts where seller location is mentioned.

  IMPORTANT:
  - Do NOT include or rewrite the description. Description is handled separately.
  - Only use category ids from the list below. Do not invent new ones.
  - Respond ONLY with a valid JSON array. No markdown, no explanation.

  Available categories:
${categoryInstructions}`;

  const userContent = posts.map(p =>
    `[post_id: ${p.id}]${p.replyToId ? ` [reply_to: ${p.replyToId}]` : ""}\n${p.text ?? ""}`
  ).join("\n\n---\n\n");

  const completion = await openai.chat.completions.create({
    model: "qwen3.5-flash-2026-02-23",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.1,
    enable_thinking: false,
  });

  console.log(completion);

  const raw = completion.choices[0].message.content.trim().replace(/```json|```/g, "");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
