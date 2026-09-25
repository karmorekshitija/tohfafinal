require('dotenv').config();
const razorpay = require('./src/config/razorpay');
const paymentService = require('./src/services/payment.service');
(async () => {
  try {
    const order = await paymentService.createRazorpayOrder(100, 'test_123');
    console.log('Order created:', order.id);
  } catch (err) {
    console.error('Error:', err);
  }
})();
