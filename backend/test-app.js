const request = require('supertest');
const express = require('express');
const tanyaRoutes = require('./src/routes/tanya.routes.js');
const app = express();
app.use(express.json());
app.use('/api/chatbot', tanyaRoutes);

request(app)
  .post('/api/chatbot/message')
  .send({ message: "Report a payment issue" })
  .expect(200)
  .end(function(err, res) {
    if (err) console.error("Error:", res.text, err);
    else console.log("Success:", res.body);
  });
