import { prisma } from '../config/db.js';
import { createAnthropicClient, excerptAnthropicText } from '../infrastructure/anthropicService.js';
import { fetchWeather, type WeatherData } from '../infrastructure/weatherService.js';

function buildSystemPrompt(user: Express.UserContext, wardrobe: Array<{ name: string; category: string; color: string | null; wornCount: number }>, weather: WeatherData | null) {
  const items = wardrobe.map((i) => `- ${i.name} (${i.category}${i.color ? ', ' + i.color : ''}, worn ${i.wornCount}×)`).join('\n');
  const w = weather ? `${weather.temp}°C, ${weather.desc} in ${weather.city}` : `~34°C in ${user.city || 'India'}`;
  return `You are Miré, a warm and elegant AI personal stylist. Expert in Indian ethnic and western wear, colour theory, fabrics, and personal styling.

USER: ${user.name} | City: ${user.city || 'India'} | Style: ${(user.stylePersona || []).join(', ') || 'Minimalist'}
Measurements: Bust ${user.bust || '?'}\" , Waist ${user.waist || '?'}\" , Hip ${user.hip || '?'}\" 
TODAY'S WEATHER: ${w}
WARDROBE (${wardrobe.length} items):
${items || 'No wardrobe items yet — suggest building a capsule wardrobe'}

RESPONSE RULES:
- Be warm, specific and concise (2–4 short paragraphs max)
- Reference actual wardrobe items by name when possible
- Consider weather, occasion and measurements
- Use emojis naturally (not excessively)
- For a complete outfit suggestion, append ONLY this JSON on its own line at the very end:
{"outfit":true,"title":"Look name","pieces":[{"em":"👗","lbl":"item name"},{"em":"👡","lbl":"shoes"}]}`;
}

export async function createStylistChat(user: Express.UserContext, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, sessionId?: string) {
  const anthropic = createAnthropicClient();
  if (!anthropic) {
    return { error: 'AI not configured — add ANTHROPIC_API_KEY to backend/.env then restart' };
  }

  const [wardrobe, weather] = await Promise.all([
    prisma.wardrobeItem.findMany({ where: { userId: user.id, isActive: true }, select: { name: true, category: true, color: true, wornCount: true }, take: 40 }),
    fetchWeather(user.city),
  ]);

  let session = sessionId
    ? await prisma.chatSession.findFirst({ where: { id: sessionId, userId: user.id } })
    : null;
  if (!session) {
    session = await prisma.chatSession.create({ data: { userId: user.id, title: message.slice(0, 60) } });
  }

  const messages = [
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: message },
  ];

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 600,
    system: buildSystemPrompt(user, wardrobe, weather),
    messages,
  });

  const aiText = excerptAnthropicText(resp);
  const jMatch = aiText.match(/\{"outfit":true[\s\S]*?\}/);
  let outfitData = null;
  let cleanText = aiText;
  if (jMatch) {
    try { outfitData = JSON.parse(jMatch[0]); } catch {};
    cleanText = aiText.replace(jMatch[0], '').trim();
  }

  await prisma.chatMessage.createMany({ data: [
    { sessionId: session.id, role: 'user', content: message },
    { sessionId: session.id, role: 'assistant', content: aiText, outfitData },
  ] });

  await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });

  return { message: cleanText, outfitData, sessionId: session.id };
}

export async function createOOTD(user: Express.UserContext) {
  const anthropic = createAnthropicClient();
  if (!anthropic) {
    return { message: 'Add ANTHROPIC_API_KEY to .env for AI outfit suggestions!', outfit: null };
  }

  const [wardrobe, weather] = await Promise.all([
    prisma.wardrobeItem.findMany({ where: { userId: user.id, isActive: true }, select: { name: true, category: true, color: true, wornCount: true }, take: 40 }),
    fetchWeather(user.city),
  ]);

  if (wardrobe.length < 2) return { message: 'Add at least 2 wardrobe items for OOTD!', outfit: null, weather };

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 300,
    system: buildSystemPrompt(user, wardrobe, weather),
    messages: [{ role: 'user', content: "Give me today's outfit of the day. Short message then outfit JSON." }],
  });

  const aiText = excerptAnthropicText(resp);
  const jMatch = aiText.match(/\{"outfit":true[\s\S]*?\}/);
  let outfitData = null;
  let cleanText = aiText;
  if (jMatch) {
    try { outfitData = JSON.parse(jMatch[0]); } catch {};
    cleanText = aiText.replace(jMatch[0], '').trim();
  }

  return { message: cleanText, outfit: outfitData, weather };
}

export async function listStylistSessions(userId: string) {
  return prisma.chatSession.findMany({
    where: { userId }, orderBy: { updatedAt: 'desc' }, take: 20,
    include: { messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { content: true } } },
  });
}
