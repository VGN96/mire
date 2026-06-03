export type WeatherData = {
  city: string;
  temp: number;
  feelsLike: number;
  desc: string;
  humidity: number;
  advice: string;
};

export async function fetchWeather(city?: string | null): Promise<WeatherData | null> {
  if (!city || !process.env.WEATHER_API_KEY || process.env.WEATHER_API_KEY === 'optional') return null;

  const { default: axios } = await import('axios');
  const { data } = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
    params: {
      q: city,
      appid: process.env.WEATHER_API_KEY,
      units: 'metric',
    },
    timeout: 4000,
  });

  const temp = Math.round(data.main.temp);
  const feelsLike = Math.round(data.main.feels_like);
  const desc = data.weather?.[0]?.description || 'Clear';
  const advice = temp > 35 ? '🥵 Ultra light fabrics only' : temp > 28 ? '☀️ Light breathable outfits' : temp > 20 ? '🌤️ Light layers' : '🧥 Layer up!';

  return { city: data.name, temp, feelsLike, desc, humidity: data.main.humidity, advice };
}
