import { fetchWeather, type WeatherData } from '../infrastructure/weatherService.js';

export async function getCurrentWeather(city?: string | null): Promise<WeatherData | null> {
  return fetchWeather(city);
}
