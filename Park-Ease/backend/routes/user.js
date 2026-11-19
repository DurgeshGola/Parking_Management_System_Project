const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const User = require('../models/User');
const ParkingSpace = require('../models/ParkingSpace');
const Booking = require('../models/Booking');
const PaymentOrder = require('../models/PaymentOrder');
const { razorpayRequest, refundPaidBooking } = require('../services/paymentService');

const placeSearchCache = new Map();
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;

const geocodePlace = (query) => {
  const request = nominatimQueue.then(async () => {
    const delay = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    lastNominatimRequestAt = Date.now();

    const params = new URLSearchParams({
      format: 'jsonv2',
      limit: '1',
      q: query,
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'ParkEaseParkingSearch/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Place lookup returned ${response.status}`);
    }

    return response.json();
  });

  nominatimQueue = request.catch(() => {});
  return request;
};

const calculateDistanceKm = (originLat, originLng, destinationLat, destinationLng) => {
  const radians = value => (value * Math.PI) / 180;
  const latitudeDelta = radians(destinationLat - originLat);
  const longitudeDelta = radians(destinationLng - originLng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(originLat)) * Math.cos(radians(destinationLat))
    * Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/parking-search', auth, async (req, res) => {
  const query = String(req.query.place || '').trim();
  if (query.length < 3) {
    return res.status(400).json({ msg: 'Enter at least 3 characters to search for a place.' });
  }

  const cacheKey = query.toLowerCase();
  const cachedResult = placeSearchCache.get(cacheKey);
  if (cachedResult && cachedResult.expiresAt > Date.now()) {
    return res.json(cachedResult.data);
  }

  try {
    const [place] = await geocodePlace(query);
    if (!place) {
      return res.status(404).json({ msg: `No map location found for "${query}".` });
    }

    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    const overpassQuery = `[out:json][timeout:20];nwr["amenity"="parking"]["access"!="private"](around:5000,${latitude},${longitude});out center tags;`;
    const parkingResponse = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ParkEaseParkingSearch/1.0',
      },
      body: new URLSearchParams({ data: overpassQuery }),
      signal: AbortSignal.timeout(25000),
    });

    if (!parkingResponse.ok) {
      throw new Error(`Parking map search returned ${parkingResponse.status}`);
    }

    const parkingData = await parkingResponse.json();
    const parkingPlaces = parkingData.elements
      .map(element => {
        const coordinates = element.center || element;
        const lat = Number(coordinates.lat);
        const lng = Number(coordinates.lon ?? coordinates.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        const tags = element.tags || {};
        const address = [
          tags['addr:housenumber'],
          tags['addr:street'],
          tags['addr:suburb'],
          tags['addr:city'],
        ].filter(Boolean).join(', ');

        return {
          id: `${element.type}-${element.id}`,
          name: tags.name || tags.operator || 'Public parking facility',
          address: address || place.display_name,
          coordinates: { lat, lng },
          distance: calculateDistanceKm(latitude, longitude, lat, lng),
          fee: tags.fee || 'unknown',
          access: tags.access || 'public',
          isBookable: false,
          mapUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        };
      })
      .filter(Boolean)
      .sort((first, second) => first.distance - second.distance)
      .slice(0, 50);

    const registeredSpaces = (await ParkingSpace.find({ isActive: true }))
      .map(space => {
        const spaceData = space.toObject();
        const distance = calculateDistanceKm(
          latitude,
          longitude,
          spaceData.coordinates.lat,
          spaceData.coordinates.lng
        );
        return { ...spaceData, distance, isBookable: true };
      })
      .filter(space => space.distance <= 5)
      .sort((first, second) => first.distance - second.distance);

    const result = {
      place: {
        name: place.display_name,
        coordinates: { lat: latitude, lng: longitude },
      },
      radiusKm: 5,
      registeredSpaces,
      parkingPlaces,
    };

    if (placeSearchCache.size >= 100) {
      placeSearchCache.delete(placeSearchCache.keys().next().value);
    }
    placeSearchCache.set(cacheKey, { data: result, expiresAt: Date.now() + 5 * 60 * 1000 });

    return res.json(result);
  } catch (err) {
    console.error('Parking place search failed:', err.message);
    return res.status(502).json({ msg: 'Map search is temporarily unavailable. Please try again.' });
  }
});

// Get available parking spaces
router.get('/parking-spaces', auth, async (req, res) => {
  try {
    const parkingSpaces = await ParkingSpace.find({ isActive: true });
    res.json(parkingSpaces);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/bookings/create-order', auth, async (req, res) => {
  try {
    const { parkingSpaceId, startTime, endTime, vehicleNumber } = req.body;
    if (!parkingSpaceId || !startTime || !endTime || !vehicleNumber?.trim()) {
      return res.status(400).json({ msg: 'Parking space, booking time, and vehicle number are required.' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start <= new Date() || end <= start) {
      return res.status(400).json({ msg: 'Choose a future start time and an end time after it.' });
    }

    const parkingSpace = await ParkingSpace.findOne({ _id: parkingSpaceId, isActive: true });
    if (!parkingSpace || parkingSpace.availableSpots <= 0) {
      return res.status(409).json({ msg: 'This parking space is no longer available.' });
    }

    const normalizedVehicleNumber = vehicleNumber.trim().toUpperCase();
    const activeBooking = await Booking.exists({
      user: req.user.userId,
      vehicleNumber: normalizedVehicleNumber,
      status: 'confirmed',
      endTime: { $gt: new Date() },
    });
    if (activeBooking) {
      return res.status(409).json({ msg: 'This vehicle already has an active booking.' });
    }

    const durationInHours = (end - start) / (1000 * 60 * 60);
    const totalPrice = Math.round(durationInHours * parkingSpace.price * 100) / 100;
    const amount = Math.round(totalPrice * 100);
    if (amount < 100) {
      return res.status(400).json({ msg: 'The minimum prepaid booking amount is ₹1.' });
    }

    const providerOrder = await razorpayRequest('/orders', 'POST', {
      amount,
      currency: 'INR',
      receipt: `park_${Date.now()}`,
      notes: { userId: req.user.userId, parkingSpaceId: parkingSpace._id.toString() },
    });
    await PaymentOrder.create({
      providerOrderId: providerOrder.id,
      user: req.user.userId,
      parkingSpace: parkingSpace._id,
      startTime: start,
      endTime: end,
      vehicleNumber: normalizedVehicleNumber,
      amount,
    });

    return res.status(201).json({
      orderId: providerOrder.id,
      amount: providerOrder.amount,
      currency: providerOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      parkingSpace: parkingSpace.name,
    });
  } catch (err) {
    console.error('Payment order creation failed:', err.message);
    return res.status(err.status || 500).json({ msg: err.message || 'Unable to start prepaid checkout.' });
  }
});

router.post('/bookings/confirm-payment', auth, async (req, res) => {
  const { razorpay_order_id: providerOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (!providerOrderId || !paymentId || !signature) {
    return res.status(400).json({ msg: 'Payment verification details are incomplete.' });
  }

  let paymentOrder;
  let inventoryReserved = false;
  let paymentCaptured = false;
  let booking;

  try {
    paymentOrder = await PaymentOrder.findOne({ providerOrderId, user: req.user.userId });
    if (!paymentOrder) return res.status(404).json({ msg: 'Payment order was not found.' });
    if (paymentOrder.status === 'paid' && paymentOrder.booking) {
      const existingBooking = await Booking.findById(paymentOrder.booking);
      if (existingBooking) return res.json(existingBooking);
    }
    if (paymentOrder.expiresAt <= new Date() || ['failed', 'refunded'].includes(paymentOrder.status)) {
      return res.status(410).json({ msg: 'This payment order has expired. Please start booking again.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${providerOrderId}|${paymentId}`)
      .digest('hex');
    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
      return res.status(400).json({ msg: 'Payment signature could not be verified.' });
    }

    paymentOrder = await PaymentOrder.findOneAndUpdate(
      { _id: paymentOrder._id, status: 'created' },
      { $set: { status: 'processing', paymentId } },
      { new: true }
    );
    if (!paymentOrder) {
      return res.status(409).json({ msg: 'This payment is already being confirmed. Refresh your bookings shortly.' });
    }

    const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, 'GET');
    if (payment.order_id !== providerOrderId || payment.amount !== paymentOrder.amount || payment.currency !== paymentOrder.currency) {
      paymentOrder.status = 'failed';
      await paymentOrder.save();
      return res.status(400).json({ msg: 'Payment details do not match this booking.' });
    }
    if (!['authorized', 'captured'].includes(payment.status)) {
      paymentOrder.status = 'failed';
      await paymentOrder.save();
      return res.status(402).json({ msg: 'Payment was not completed. Please try again.' });
    }
    paymentCaptured = payment.status === 'captured';

    const parkingSpace = await ParkingSpace.findOneAndUpdate(
      { _id: paymentOrder.parkingSpace, isActive: true, availableSpots: { $gt: 0 } },
      { $inc: { availableSpots: -1 } },
      { new: true }
    );
    if (!parkingSpace) {
      if (paymentCaptured) {
        await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, 'POST', {
          amount: paymentOrder.amount,
          notes: { reason: 'Parking space no longer available' },
        });
      }
      paymentOrder.status = paymentCaptured ? 'refunded' : 'failed';
      await paymentOrder.save();
      return res.status(409).json({ msg: 'This parking space is no longer available. Any captured payment has been refunded.' });
    }
    inventoryReserved = true;

    if (!paymentCaptured) {
      const captured = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, 'POST', {
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
      });
      if (captured.status !== 'captured') throw new Error('Payment provider did not confirm the captured payment.');
      paymentCaptured = true;
    }

    booking = await Booking.create({
      user: paymentOrder.user,
      parkingSpace: paymentOrder.parkingSpace,
      startTime: paymentOrder.startTime,
      endTime: paymentOrder.endTime,
      vehicleNumber: paymentOrder.vehicleNumber,
      totalPrice: paymentOrder.amount / 100,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: payment.method,
      paymentId,
      paymentOrderId: providerOrderId,
    });

    paymentOrder.status = 'paid';
    paymentOrder.paymentMethod = payment.method;
    paymentOrder.booking = booking._id;
    await paymentOrder.save();
    return res.status(201).json(booking);
  } catch (err) {
    console.error('Payment confirmation failed:', err.message);
    if (booking) await Booking.deleteOne({ _id: booking._id });
    if (inventoryReserved && paymentOrder) {
      await ParkingSpace.updateOne(
        { _id: paymentOrder.parkingSpace },
        { $inc: { availableSpots: 1 }, $set: { isAvailable: true } }
      );
    }
    if (paymentCaptured && paymentId) {
      try {
        await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, 'POST', {
          amount: paymentOrder.amount,
          notes: { reason: 'Booking could not be confirmed' },
        });
        if (paymentOrder) paymentOrder.status = 'refunded';
      } catch (refundError) {
        console.error('Automatic payment refund failed:', refundError.message);
      }
    } else if (paymentOrder?.status === 'processing') {
      paymentOrder.status = 'created';
    }
    if (paymentOrder) await paymentOrder.save().catch(saveError => console.error(saveError.message));
    return res.status(err.status || 502).json({ msg: err.message || 'Unable to confirm payment.' });
  }
});

router.post('/bookings', auth, (req, res) => res.status(410).json({
  msg: 'Prepaid checkout is required. Create a payment order before confirming a booking.',
}));

// Get user's bookings
router.get('/bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.userId })
      .populate({
        path: 'parkingSpace',
        select: 'name address price coordinates',
        model: 'ParkingSpace'
      })
      .sort({ startTime: -1 });

    // Filter out any bookings where parkingSpace is null (deleted)
    const validBookings = bookings.filter(booking => booking.parkingSpace !== null);
    
    res.json(validBookings);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ 
      msg: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Cancel a booking
router.patch('/bookings/:id/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    // Check if the booking belongs to the user
    if (booking.user.toString() !== req.user.userId) {
      return res.status(403).json({ msg: 'Not authorized to cancel this booking' });
    }

    // Check if the booking can be cancelled (e.g., not already cancelled or completed)
    if (booking.status === 'cancelled') {
      return res.status(400).json({ msg: 'Booking is already cancelled' });
    }

    if (booking.status === 'completed') {
      return res.status(400).json({ msg: 'Cannot cancel a completed booking' });
    }

    await refundPaidBooking(booking);

    // Update booking status to cancelled
    booking.status = 'cancelled';
    await booking.save();

    // Update parking space availability
    const parkingSpace = await ParkingSpace.findById(booking.parkingSpace);
    if (parkingSpace) {
      parkingSpace.availableSpots = parkingSpace.availableSpots + 1;
      parkingSpace.isAvailable = true;
      await parkingSpace.save();
    }

    res.json({ msg: 'Booking cancelled successfully', booking });
  } catch (err) {
    console.error('Error cancelling booking:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Add this route after the cancel booking route
router.patch('/bookings/:id/complete', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    // Check if user is authorized
    if (booking.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    // Update booking status
    booking.status = 'completed';
    await booking.save();

    // Update parking space availability
    const parkingSpace = await ParkingSpace.findById(booking.parkingSpace);
    if (parkingSpace) {
      parkingSpace.availableSpots = parkingSpace.availableSpots + 1;
      parkingSpace.isAvailable = true;
      await parkingSpace.save();
    }

    res.json({ msg: 'Booking completed successfully', booking });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router; 