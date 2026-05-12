import { Hono } from "hono";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const MINI_APP_URL = process.env.MINI_APP_URL!;

export const botRoutes = new Hono();

async function sendMessage(chatId: number, text: string, replyMarkup?: any) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    }),
  });
  return response.json();
}

botRoutes.post("/webhook", async (c) => {
  const update = await c.req.json();

  if (update.message?.text === "/start") {
    const chatId = update.message.chat.id;
    const firstName = update.message.from.first_name;

    const greeting = `<b>Assalomu alaykum, ${firstName}!</b>\n\nBotga xush kelibsiz! Pastdagi tugmaga bosib, Telegram kanallardan mahsulotlarni oson toping.`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          {
            text: "Luupani ochish",
            web_app: { url: MINI_APP_URL },
          },
        ],
      ],
    };

    await sendMessage(chatId, greeting, inlineKeyboard);
  }

  return c.json({ ok: true });
});
