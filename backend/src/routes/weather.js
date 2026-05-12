// weather.js
import { Router } from 'express';
const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const city = req.query.city || 'Rajkot';
    if (!process.env.WEATHER_API_KEY || process.env.WEATHER_API_KEY === 'optional') {
      return res.json({ city, temp: 34, feelsLike: 36, desc: 'Sunny', humidity: 45,
        advice: '☀️ Light breathable outfits recommended (add WEATHER_API_KEY for live data)' });
    }
    const { default: axios } = await import('axios');
    const { data } = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric`,
      { timeout: 4000 }
    );
    const temp = Math.round(data.main.temp);
    const advice = temp > 35 ? '🥵 Ultra light fabrics only' : temp > 28 ? '☀️ Light breathable outfits' : temp > 20 ? '🌤️ Light layers' : '🧥 Layer up!';
    res.json({ city: data.name, temp, feelsLike: Math.round(data.main.feels_like),
      desc: data.weather[0].description, humidity: data.main.humidity, advice });
  } catch (e) { next(e); }
});

export default router;
