require('dotenv').config();
const Razorpay = require('razorpay');
const client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
client.orders.create({ amount: 1000, currency: 'INR', receipt: 'test_123' })
  .then(console.log)
  .catch(err => console.error(JSON.stringify(err, null, 2)));
