require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });
model.generateContent("hello").then(r => console.log("Success with 3.8:", r.response.text())).catch(e => console.error("Error with 3.8:", e.message));
