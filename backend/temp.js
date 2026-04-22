import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function listModels() {
    try {
        const res = await axios.get(
            `https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`
        );

        res.data.models.forEach(model => {
            console.log(model.name);
        });

    } catch (err) {
        console.error("Error:", err.response?.data || err.message);
    }
}

listModels();