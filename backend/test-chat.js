require('dotenv').config();
const { chat } = require('./src/services/tanya.service.js');
chat("Report a payment issue").then(res => console.log(JSON.stringify(res, null, 2))).catch(e => console.error(e));
