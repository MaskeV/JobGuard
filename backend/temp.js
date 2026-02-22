const axios = require("axios");

async function listModels() {
  const apiKey = "AIzaSyCYgMBiCR8zSQNnwAwPDjCWJ-UjgmnlC5s";

  const res = await axios.get(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );

  res.data.models.forEach(m => console.log(m.name));
}

listModels().catch(console.error);