import { Router, type Request, type Response, type NextFunction } from 'express';
import { getCurrentWeather } from '../usecases/weather.js';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const weather = await getCurrentWeather(typeof req.query.city === 'string' ? req.query.city : undefined);
    if (!weather) {
      return res.json({ city: req.query.city || 'Rajkot', temp: 34, feelsLike: 36, desc: 'Sunny', humidity: 45,
        advice: '☀️ Light breathable outfits recommended (add WEATHER_API_KEY for live data)' });
    }
    res.json(weather);
  } catch (error) {
    next(error);
  }
});

export default router;
