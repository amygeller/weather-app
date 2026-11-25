//Server entry point
const express = require("express");
const app = express();
const fs = require("node:fs/promises");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
let publicPath = path.resolve(__dirname, "..", "client");
app.use(express.static(publicPath));
const port = 3000;
const apiKey = process.env.WEATHER_API_KEY;

//Dew point calculator helper function using Magnus formula for dew point
function dewPointCalc(temp, humidity) {
  let gamma = Math.log(humidity / 100) + (17.62 * temp) / (243.12 + temp);
  return (243.12 * gamma) / (17.62 - gamma);
}

//Getting the forcast for city
app.get("/api/v1/forecast", async (req, res) => {
  let city = req.query.city;
  if (!city) {
    return res.status(400).json({ error: "No city entered" });
  }
  let safeCity = encodeURIComponent(city);

  const address = `https://api.openweathermap.org/data/2.5/forecast?q=${safeCity}&units=metric&APPID=${apiKey}`;

  let reply = await fetch(address);
  if (reply.status === 404) {
    return res.status(404).json({ error: `${city} is not in the system` });
  }

  let allData = await reply.json();

  const days = {};

  for (const item of allData.list) {
    const time = item.dt_txt;
    const parts = time.split(" ");
    const date = parts[0];

    const rain = item.rain?.["3h"] ?? 0;

    if (!days[date]) {
      days[date] = {
        temps: [],
        winds: [],
        humidities: [],
        feels_like: [],
        dewPoint: [],
        totalRain: 0,
      };
    }
    days[date].totalRain += rain;
    days[date].temps.push(item.main.temp);
    days[date].winds.push(item.wind.speed);
    days[date].humidities.push(item.main.humidity);
    days[date].feels_like.push(item.main.feels_like);
    days[date].dewPoint.push(dewPointCalc(item.main.temp, item.main.humidity));
  }

  const dates = Object.keys(days).slice(0, 3);
  const summary = dates.map((date) => {
    const temps = days[date].temps;
    const winds = days[date].winds;
    const humidities = days[date].humidities;
    const feels_like = days[date].feels_like;
    const dewPoint = days[date].dewPoint;

    let feelsLikeTotal = 0;
    for (const value of feels_like) {
      feelsLikeTotal += value;
    }
    const avgFeelsLike = feelsLikeTotal / feels_like.length;

    return {
      date: date,
      lowestTemp: Math.min(...temps),
      maxTemp: Math.max(...temps),
      totalRain: Math.round(days[date].totalRain * 10) / 10,
      maxWind: Math.max(...winds),
      maxHumidity: Math.max(...humidities),
      avgFeelsLike: Math.round(avgFeelsLike * 10) / 10,
      dewPoint: Math.round(Math.max(...dewPoint) * 10) / 10,
    };
  });

  //Pollution
  let lat = allData.city.coord.lat;
  let lon = allData.city.coord.lon;
  const pollutionAddress = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
  let pollutionReply = await fetch(pollutionAddress);
  let pollutionData = await pollutionReply.json();

  res.json({
    city: allData.city.name,
    country: allData.city.country,
    days: summary,
    pollution: pollutionData.list[0].components,
  });
});

app.listen(port, () => {
  // start waiting for requests
  console.log(`Server is running at http://localhost:${port}`);
});
