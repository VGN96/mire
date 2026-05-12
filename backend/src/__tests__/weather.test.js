import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import weatherRoutes from '../routes/weather.js';
import { errorHandler } from '../middleware/errorHandler.js';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

const app = express();
app.use(express.json());
app.use('/api/weather', weatherRoutes);
app.use(errorHandler);

const savedKey = process.env.WEATHER_API_KEY;

afterEach(() => {
  process.env.WEATHER_API_KEY = savedKey;
});

describe('GET /api/weather', () => {
  it('returns mock data when WEATHER_API_KEY is not set', async () => {
    delete process.env.WEATHER_API_KEY;

    const res = await request(app).get('/api/weather?city=Mumbai');

    expect(res.status).toBe(200);
    expect(res.body.city).toBe('Mumbai');
    expect(res.body.temp).toBe(34);
    expect(res.body).toHaveProperty('advice');
  });

  it('returns mock data when WEATHER_API_KEY is the placeholder "optional"', async () => {
    process.env.WEATHER_API_KEY = 'optional';

    const res = await request(app).get('/api/weather?city=Delhi');

    expect(res.status).toBe(200);
    expect(res.body.temp).toBe(34);
  });

  it('defaults city to Rajkot when city param is omitted', async () => {
    delete process.env.WEATHER_API_KEY;

    const res = await request(app).get('/api/weather');

    expect(res.status).toBe(200);
    expect(res.body.city).toBe('Rajkot');
  });

  it('calls OpenWeatherMap and returns live data when key is set', async () => {
    process.env.WEATHER_API_KEY = 'live-key-123';
    const { default: axios } = await import('axios');
    axios.get.mockResolvedValue({
      data: {
        name: 'Mumbai',
        main: { temp: 32.4, feels_like: 35.1, humidity: 80 },
        weather: [{ description: 'overcast clouds' }],
      },
    });

    const res = await request(app).get('/api/weather?city=Mumbai');

    expect(res.status).toBe(200);
    expect(res.body.temp).toBe(32);
    expect(res.body.feelsLike).toBe(35);
    expect(res.body.humidity).toBe(80);
    expect(res.body.desc).toBe('overcast clouds');
    expect(res.body.city).toBe('Mumbai');
  });

  it('gives correct heat advice for very hot weather (> 35°C)', async () => {
    process.env.WEATHER_API_KEY = 'live-key-123';
    const { default: axios } = await import('axios');
    axios.get.mockResolvedValue({
      data: {
        name: 'Rajkot',
        main: { temp: 42, feels_like: 44, humidity: 30 },
        weather: [{ description: 'clear sky' }],
      },
    });

    const res = await request(app).get('/api/weather?city=Rajkot');

    expect(res.status).toBe(200);
    expect(res.body.advice).toContain('Ultra light');
  });

  it('gives light layers advice for mild weather (20–28°C)', async () => {
    process.env.WEATHER_API_KEY = 'live-key-123';
    const { default: axios } = await import('axios');
    axios.get.mockResolvedValue({
      data: {
        name: 'Shimla',
        main: { temp: 22, feels_like: 20, humidity: 60 },
        weather: [{ description: 'partly cloudy' }],
      },
    });

    const res = await request(app).get('/api/weather?city=Shimla');

    expect(res.status).toBe(200);
    expect(res.body.advice).toContain('Light layers');
  });
});
