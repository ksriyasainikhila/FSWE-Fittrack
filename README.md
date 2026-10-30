# FitTrack — Full-stack Fitness Tracker

A full-stack fitness tracker built with React + Vite, Node.js + Express, PostgreSQL, Razorpay Checkout, and SMTP email.

## Features
- Register/login with bcrypt password hashing and JWT authentication
- Dashboard with daily steps, calorie intake, calories burned, workout minutes, progress bars, and tips
- Add and review workouts
- Log meals and calorie intake
- Track daily steps
- Customize daily step and calorie tracking goals
- Razorpay Checkout order creation, server-side signature verification, and signed webhook handling (one-time Premium purchase)
- Email notifications for welcome, workout logged, steps updated, meal logged, goals changed, and successful Premium activation
- SMTP can be left unconfigured during local development; emails are then skipped safely and logged

## Requirements
- Node.js 20+
- Docker Desktop (recommended) or PostgreSQL 15+
- Razorpay account for payment testing (optional)
- SMTP provider credentials for real emails (optional)

## Setup (Windows PowerShell or macOS/Linux)
1. Extract this ZIP.
2. Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`.
3. Edit `server/.env`. Set a long random `JWT_SECRET`. The example PostgreSQL URL matches the included Docker Compose database.
4. From the project root, start the database:
   ```bash
   docker compose up -d db
   ```
5. In terminal 1:
   ```bash
   cd server
   npm install
   npm run dev
   ```
6. In terminal 2:
   ```bash
   cd client
   npm install
   npm run dev
   ```
7. Open http://localhost:5173. API health check: http://localhost:4000/api/health

## Configure email notifications
Set these values in `server/.env` using your SMTP provider:
- `SMTP_HOST`
- `SMTP_PORT` (usually 587)
- `SMTP_SECURE` (`false` for STARTTLS on port 587; `true` for implicit TLS on port 465)
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`

Email notifications are attempted after workout, step, meal, or goal updates. Welcome and Premium activation emails are also sent. If SMTP is not configured, the app logs that email was skipped; it does not pretend an email was sent.

## Configure Razorpay test payments
1. Create/sign in to your Razorpay account and switch to **Test Mode**.
2. In the Razorpay Dashboard, create API keys and copy the Key ID and Key Secret.
3. Put them in `server/.env` as `RAZORPAY_KEY_ID=rzp_test_...` and `RAZORPAY_KEY_SECRET=...`.
4. Set `RAZORPAY_AMOUNT_PAISE=19900` for ₹199 (amounts are in paise) or change it to your desired amount.
5. In the Razorpay Dashboard, configure a webhook pointing to `https://YOUR_PUBLIC_API/api/payments/webhook` and subscribe to `payment.captured` (and optionally `order.paid`). Set the webhook secret as `RAZORPAY_WEBHOOK_SECRET`. For local testing, use a tunnel such as ngrok to expose your local API.
6. Restart the backend, sign in, and choose **Upgrade to Premium**. Use Razorpay's test mode and test payment details from its documentation.

The included flow is a **one-time payment** for Premium access, not an automatically renewing subscription. The server verifies the Checkout signature before activating Premium; the webhook provides a second payment notification path. Keep API secrets on the backend only and never commit `.env` files. Configure SMTP if you want payment confirmation emails.

## Useful commands
```bash
# Start/stop database
 docker compose up -d db
 docker compose down
# Build frontend production bundle
 cd client && npm run build
```

## API overview
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/dashboard`
- `GET/POST /api/workouts`
- `GET/POST /api/steps`
- `GET/POST /api/meals`
- `GET/PUT /api/goals`
- `POST /api/payments/checkout`
- `POST /api/payments/webhook\n- `POST /api/payments/verify``

## Important notes
This is a development starter, not a production-hardened financial or medical application. Before public deployment, add rate limiting, robust tests, monitoring, database migrations, and appropriate privacy/security controls. Fitness insights are informational only. Never commit `.env` files or use live Razorpay keys during development.
