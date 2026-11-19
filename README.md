# Parking Management System

A full-stack parking management application built with React, Express, and MongoDB.

## Run locally

Prerequisites: Node.js 18 or newer, npm, and a running MongoDB instance.

Install dependencies from the repository root:

```powershell
npm run setup
```

Create local environment files from the examples if they do not already exist:

```powershell
Copy-Item Park-Ease\backend\.env.example Park-Ease\backend\.env
Copy-Item Park-Ease\frontend\.env.example Park-Ease\frontend\.env
```

Set `MONGODB_URI` and a private `JWT_SECRET` in `Park-Ease\backend\.env`. Add Razorpay test credentials to enable prepaid checkout. Keep real credentials in `.env` files; never commit them.

Start the API and frontend:

```powershell
npm run dev
```

Open <http://localhost:3000>. The API runs at <http://localhost:5000>.

See [Park-Ease/README.md](Park-Ease/README.md) for setup details and API documentation.
