import { Router }   from 'express';
import Anthropic     from '@anthropic-ai/sdk';
import { prisma }    from '../config/db.js';

const router = Router();

async function getWeather(city) {
  try {
    if (!city || !process.env.WEATHER_API_KEY || process.env.WEATHER_API_KEY === 'optional') return null;
    const { default: axios } = await import('axios');
    const { data } = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric`,
      { timeout: 3000 }
    );
    return { temp: Math.round(data.main.temp), desc: data.weather[0].description, city: data.name };
  } catch { return null; }
}

function buildSystem(user, wardrobe, weather) {
  const items = wardrobe.map(i => `- ${i.name} (${i.category}${i.color ? ', ' + i.color : ''}, worn ${i.wornCount}×)`).join('\n');
  const w = weather ? `${weather.temp}°C, ${weather.desc} in ${weather.city}` : `~34°C in ${user.city || 'India'}`;
  return `You are Miré, a warm and elegant AI personal stylist. Expert in Indian ethnic and western wear, colour theory, fabrics, and personal styling.

USER: ${user.name} | City: ${user.city || 'India'} | Style: ${(user.stylePersona || []).join(', ') || 'Minimalist'}
Measurements: Bust ${user.bust || '?'}", Waist ${user.waist || '?'}", Hip ${user.hip || '?'}"
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

// POST /api/stylist/chat
router.post('/chat', async (req, res, next) => {
  try {
    const { message, sessionId, history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sk-ant-...')
      return res.status(503).json({ error: 'AI not configured — add ANTHROPIC_API_KEY to backend/.env then restart' });

    const [wardrobe, weather] = await Promise.all([
      prisma.wardrobeItem.findMany({ where: { userId: req.user.id, isActive: true }, select: { name:true,category:true,color:true,wornCount:true }, take: 40 }),
      getWeather(req.user.city),
    ]);

    let session = sessionId
      ? await prisma.chatSession.findFirst({ where: { id: sessionId, userId: req.user.id } })
      : null;
    if (!session) session = await prisma.chatSession.create({ data: { userId: req.user.id, title: message.slice(0, 60) } });

    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msgs = [
      ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const resp = await ai.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 600,
      system: buildSystem(req.user, wardrobe, weather),
      messages: msgs,
    });

    const aiText = resp.content[0].text;
    const jMatch = aiText.match(/\{"outfit":true[\s\S]*?\}/);
    let outfitData = null, cleanText = aiText;
    if (jMatch) { try { outfitData = JSON.parse(jMatch[0]); } catch {} cleanText = aiText.replace(jMatch[0], '').trim(); }

    await prisma.chatMessage.createMany({ data: [
      { sessionId: session.id, role: 'user', content: message },
      { sessionId: session.id, role: 'assistant', content: aiText, outfitData },
    ]});
    await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });

    res.json({ message: cleanText, outfitData, sessionId: session.id });
  } catch (e) { next(e); }
});

// POST /api/stylist/ootd
router.post('/ootd', async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sk-ant-...')
      return res.json({ message: 'Add ANTHROPIC_API_KEY to .env for AI outfit suggestions!', outfit: null });

    const [wardrobe, weather] = await Promise.all([
      prisma.wardrobeItem.findMany({ where: { userId: req.user.id, isActive: true }, select: { name:true,category:true,color:true,wornCount:true }, take: 40 }),
      getWeather(req.user.city),
    ]);

    if (wardrobe.length < 2)
      return res.json({ message: 'Add at least 2 wardrobe items for OOTD!', outfit: null });

    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await ai.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 300,
      system: buildSystem(req.user, wardrobe, weather),
      messages: [{ role: 'user', content: "Give me today's outfit of the day. Short message then outfit JSON." }],
    });

    const aiText = resp.content[0].text;
    const jMatch = aiText.match(/\{"outfit":true[\s\S]*?\}/);
    let outfitData = null, cleanText = aiText;
    if (jMatch) { try { outfitData = JSON.parse(jMatch[0]); } catch {} cleanText = aiText.replace(jMatch[0], '').trim(); }

    res.json({ message: cleanText, outfit: outfitData, weather });
  } catch (e) { next(e); }
});

// GET /api/stylist/sessions
router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.user.id }, orderBy: { updatedAt: 'desc' }, take: 20,
      include: { messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { content: true } } },
    });
    res.json({ sessions });
  } catch (e) { next(e); }
});

export default router;
