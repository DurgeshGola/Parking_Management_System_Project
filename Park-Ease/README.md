# Parking Management System

A full-stack web application for managing parking spaces, built with React, Node.js, Express, and MongoDB.

## Features

- User and Parking Owner authentication with JWT
- Role-based access control (User and Owner roles)
- Modern and responsive UI using Material-UI
- Secure API endpoints with input validation
- Real-time parking space management
- Booking system with time slots
- Dashboard for both users and parking owners
- Error handling and logging
- CORS enabled for secure cross-origin requests
- Automated booking completion scheduler
- Interactive parking map with Leaflet.js
- Responsive design for all devices

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## Project Structure

```
parking-management/
├── backend/              # Node.js/Express backend
│   ├── models/          # MongoDB models
│   │   ├── User.js      # User model
│   │   ├── Owner.js     # Parking owner model
│   │   ├── ParkingSpace.js # Parking space model
│   │   └── Booking.js   # Booking model
│   ├── routes/          # API routes
│   │   ├── auth.js      # Authentication routes
│   │   ├── user.js      # User-specific routes
│   │   └── owner.js     # Owner-specific routes
│   ├── services/        # Business logic services
│   ├── middleware/      # Custom middleware
│   ├── scheduler.js     # Automated booking scheduler
│   ├── server.js        # Main server file
│   └── package.json     # Backend dependencies
└── frontend/            # React frontend
    ├── src/
    │   ├── components/  # Reusable components
    │   │   ├── Navbar.js        # Navigation bar with role-based menu
    │   │   ├── ParkingMap.js    # Interactive parking space map
    │   │   ├── AddParkingSpace.js # Form for adding new parking spaces
    │   │   ├── GuideDialog.js   # User guide and help dialog
    │   │   ├── ContactDialog.js # Contact form dialog
    │   │   └── ParkingMap.css   # Styles for parking map
    │   ├── context/     # React context for state management
    │   │   └── AuthContext.js   # Authentication state management
    │   ├── pages/       # Page components
    │   │   ├── Home.js          # Landing page with features
    │   │   ├── Login.js         # Unified login page
    │   │   ├── UserLogin.js     # User-specific login
    │   │   ├── OwnerLogin.js    # Owner-specific login
    │   │   ├── UserRegister.js  # User registration
    │   │   ├── OwnerRegister.js # Owner registration
    │   │   ├── UserDashboard.js # User dashboard with bookings
    │   │   ├── OwnerDashboard.js # Owner dashboard with spaces
    │   │   └── FAQ.js          # Frequently asked questions
    │   ├── theme.js     # Material-UI theme configuration
    │   ├── App.js       # Main App component
    │   └── index.js     # Entry point
    └── package.json     # Frontend dependencies
```

## Setup Instructions

### Windows Local Setup

Prerequisites: Node.js 18 or newer, npm, and a running MongoDB instance (local MongoDB or MongoDB Atlas).

From the repository root (`D:\Parking_Management_System`), install all dependencies:

```powershell
npm run setup
```

Create local environment files from the examples:

```powershell
if (-not (Test-Path Park-Ease\backend\.env)) {
  Copy-Item Park-Ease\backend\.env.example Park-Ease\backend\.env
}
if (-not (Test-Path Park-Ease\frontend\.env)) {
  Copy-Item Park-Ease\frontend\.env.example Park-Ease\frontend\.env
}
```

Update `Park-Ease\backend\.env` with your MongoDB connection string, a private random `JWT_SECRET`, and Razorpay **test-mode** `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Get test credentials from your Razorpay account dashboard. Keep the secret key only in the backend `.env`; never commit `.env` files or put the secret in frontend code. Without Razorpay credentials, prepaid checkout is intentionally disabled and no booking is confirmed. The MongoDB service must be running before starting the app.

Start both the API and frontend together:

```powershell
npm run dev
```

Open `http://localhost:3000`. The API runs at `http://localhost:5000`; stop both processes with `Ctrl+C`. To create a production frontend build, run `npm run build` from the repository root.

The frontend API origin can be changed with `REACT_APP_API_URL` in `Park-Ease\frontend\.env`; restart the frontend after editing it. For MongoDB Atlas, use its connection string as `MONGODB_URI` and ensure your network/IP access is permitted.

## API Endpoints

### Authentication
- POST `/api/auth/register/user` - Register a new user
  - Required fields: name, email, password
  - Returns: JWT token, user data
- POST `/api/auth/register/owner` - Register a new parking owner
  - Required fields: name, email, password, businessName
  - Returns: JWT token, owner data
- POST `/api/auth/login` - Login for both users and owners
  - Required fields: email, password
  - Returns: JWT token, user/owner data

### User Routes
- GET `/api/user/profile` - Get user profile
  - Returns: User data, booking history
- GET `/api/user/bookings` - Get user bookings
  - Query params: status, date
  - Returns: Array of bookings
- POST `/api/user/bookings/create-order` - Create a server-priced Razorpay order for prepaid checkout
  - Required fields: parkingSpaceId, startTime, endTime, vehicleNumber
  - Returns: Razorpay checkout order and public key ID
- POST `/api/user/bookings/confirm-payment` - Verify a Razorpay signature and confirm the paid booking
  - Required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature
  - Returns: Confirmed booking only after server-side payment verification

### Owner Routes
- GET `/api/owner/profile` - Get owner profile
  - Returns: Owner data, business info
- GET `/api/owner/spaces` - Get parking spaces
  - Query params: status, availability
  - Returns: Array of parking spaces
- POST `/api/owner/spaces` - Add new parking space
  - Required fields: name, address, coordinates, price, totalSpots
  - Returns: Created parking space
- PUT `/api/owner/spaces/:id` - Update parking space
  - Returns: Updated parking space
- DELETE `/api/owner/spaces/:id` - Delete parking space
  - Returns: Success message

## Technologies Used

### Frontend
- React 18.2.0
- Material-UI 5.14.18
- React Router 6.18.0
- Axios 1.6.0 for API calls
- Context API for state management
- Leaflet 1.9.4 for interactive maps
- React-Leaflet 4.2.1 for React integration
- Leaflet-Routing-Machine 3.2.12 for navigation
- Custom theme configuration

### Backend
- Node.js 14.x
- Express 4.18.2
- MongoDB with Mongoose 7.0.3
- JWT for authentication
- Bcrypt 2.4.3 for password hashing
- Express Validator 7.0.1 for input validation
- CORS 2.8.5 for cross-origin requests
- Dotenv 16.0.3 for environment variables
- Validator 13.9.0 for data validation

## Security Features
- Password hashing using bcrypt
- JWT-based authentication
- Input validation using express-validator
- CORS configuration
- Environment variable protection
- Error handling middleware
- Role-based access control
- Secure HTTP headers
- Rate limiting (implemented in middleware)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Additional Features

### Automated Booking Management
- The system includes a scheduler that automatically updates booking statuses
- Completed bookings are marked as such without manual intervention
- Real-time updates for parking space availability

### Interactive Map Features
- Visual representation of parking spaces
- Search and filter functionality
- Navigation assistance using Leaflet-Routing-Machine
- Responsive design for mobile devices

### User Experience
- Material-UI components for consistent design
- Responsive layouts for all screen sizes
- Loading states and error handling
- Form validation and user feedback
- Helpful error messages and tooltips

## Support

For support, please open an issue in the GitHub repository or contact the development team.

## Credits

Created by Sagar Paul

- GitHub: [github.com/Sagarpaul9475](https://github.com/Sagarpaul9475)
- LinkedIn: [linkedin.com/in/sagar-paul-2b620928b](https://linkedin.com/in/sagar-paul-2b620928b) 