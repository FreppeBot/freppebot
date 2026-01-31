/**
 * 🌤️ WEATHER PLUGIN
 * 
 * Get weather for any location using Open-Meteo (FREE, no API key needed!)
 * 
 * Commands: !weather <location>
 * AI Tools: getWeather
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

// Geocoding API (free, no key needed)
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
// Weather API (free, no key needed)
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

async function getCoordinates(location) {
    const response = await fetch(`${GEOCODE_URL}?name=${encodeURIComponent(location)}&count=1`);
    const data = await response.json();

    if (!data.results || data.results.length === 0) {
        throw new Error(`Location not found: ${location}`);
    }

    return {
        lat: data.results[0].latitude,
        lon: data.results[0].longitude,
        name: data.results[0].name,
        country: data.results[0].country,
    };
}

async function fetchWeather(lat, lon) {
    const url = `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
    const response = await fetch(url);
    return response.json();
}

const weatherCodes = {
    0: '☀️ Clear',
    1: '🌤️ Mostly Clear',
    2: '⛅ Partly Cloudy',
    3: '☁️ Cloudy',
    45: '🌫️ Foggy',
    48: '🌫️ Icy Fog',
    51: '🌧️ Light Drizzle',
    53: '🌧️ Drizzle',
    55: '🌧️ Heavy Drizzle',
    61: '🌧️ Light Rain',
    63: '🌧️ Rain',
    65: '🌧️ Heavy Rain',
    71: '🌨️ Light Snow',
    73: '🌨️ Snow',
    75: '🌨️ Heavy Snow',
    77: '🌨️ Snow Grains',
    80: '🌦️ Light Showers',
    81: '🌦️ Showers',
    82: '🌦️ Heavy Showers',
    85: '🌨️ Snow Showers',
    86: '🌨️ Heavy Snow Showers',
    95: '⛈️ Thunderstorm',
    96: '⛈️ Thunderstorm with Hail',
    99: '⛈️ Severe Thunderstorm',
};

module.exports = new Plugin({
    name: 'weather',
    description: 'Get weather for any location (free, no API key needed)',
    version: '1.0.0',

    commands: {
        weather: {
            description: 'Get weather: !weather <city>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return '🌤️ Usage: !weather <city>';
                }

                const location = args.join(' ');

                try {
                    const coords = await getCoordinates(location);
                    const weather = await fetchWeather(coords.lat, coords.lon);

                    const current = weather.current;
                    const condition = weatherCodes[current.weather_code] || 'Unknown';

                    return `${condition} in **${coords.name}, ${coords.country}**
🌡️ ${current.temperature_2m}°C
💨 ${current.wind_speed_10m} km/h
💧 ${current.relative_humidity_2m}% humidity`;
                } catch (error) {
                    return `❌ ${error.message}`;
                }
            },
        },
    },

    tools: {
        getWeather: {
            description: 'Get current weather for a location',
            parameters: {
                location: {
                    type: 'string',
                    description: 'City name or location',
                },
            },
            execute: async (params) => {
                try {
                    const coords = await getCoordinates(params.location);
                    const weather = await fetchWeather(coords.lat, coords.lon);
                    const current = weather.current;

                    return {
                        location: `${coords.name}, ${coords.country}`,
                        temperature: current.temperature_2m,
                        humidity: current.relative_humidity_2m,
                        windSpeed: current.wind_speed_10m,
                        condition: weatherCodes[current.weather_code] || 'Unknown',
                    };
                } catch (error) {
                    return { error: error.message };
                }
            },
        },
    },
});
