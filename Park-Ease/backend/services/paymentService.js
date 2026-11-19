const razorpayRequest = async (path, method, body) => {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    const error = new Error('Prepaid checkout is disabled. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Park-Ease/backend/.env using Razorpay test credentials, then restart the API.');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = response.status === 401
      ? 'Razorpay rejected the API credentials. Generate a matching Test Mode Key ID and Key Secret, update both in Park-Ease/backend/.env, then restart the API.'
      : data.error?.description || 'Payment provider request failed.';
    const error = new Error(message);
    error.status = 502;
    throw error;
  }
  return data;
};

const refundPaidBooking = async booking => {
  if (booking.paymentStatus !== 'paid' || !booking.paymentId) return;

  const refund = await razorpayRequest(`/payments/${encodeURIComponent(booking.paymentId)}/refund`, 'POST', {
    amount: Math.round(booking.totalPrice * 100),
    notes: { bookingId: booking._id.toString() },
  });
  booking.paymentStatus = 'refunded';
  booking.refundId = refund.id;
  await booking.save();
};

module.exports = { razorpayRequest, refundPaidBooking };
