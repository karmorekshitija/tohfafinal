require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const apiKey = process.env.GEMINI_API_KEY;
console.log("API Key:", apiKey);
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
model.generateContent("hello").then(r => console.log(r.response.text())).catch(e => console.error("Error with 2.5:", e.message));

const model15 = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
model15.generateContent("hello").then(r => console.log(r.response.text())).catch(e => console.error("Error with 1.5:", e.message));
