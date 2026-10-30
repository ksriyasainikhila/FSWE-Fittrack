import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('\n❌ ERROR: DATABASE_URL environment variable is missing!');
  console.error('👉 Please add DATABASE_URL in your Render Web Service -> Environment settings.\n');
}

// Enable SSL for any cloud/remote database (Render, Supabase, Neon, etc.)
const isLocal = !connectionString || connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

export async function initDb() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing. Please configure DATABASE_URL in your Render Environment settings.');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_premium BOOLEAN NOT NULL DEFAULT FALSE,
      stripe_customer_id TEXT, -- retained for compatibility with older local databases
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workout_type VARCHAR(80) NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0),
      calories_burned INTEGER NOT NULL DEFAULT 0 CHECK(calories_burned >= 0),
      notes TEXT, logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS steps (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      step_count INTEGER NOT NULL CHECK(step_count >= 0), logged_on DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, logged_on)
    );
    CREATE TABLE IF NOT EXISTS meals (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meal_name VARCHAR(120) NOT NULL, calories INTEGER NOT NULL CHECK(calories >= 0),
      meal_type VARCHAR(30) NOT NULL DEFAULT 'Snack', logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS goals (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      daily_steps INTEGER NOT NULL DEFAULT 8000 CHECK(daily_steps > 0),
      daily_calories INTEGER NOT NULL DEFAULT 2200 CHECK(daily_calories > 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_session_id TEXT UNIQUE, status VARCHAR(30) NOT NULL DEFAULT 'pending',
      amount_total INTEGER, currency VARCHAR(10), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      razorpay_order_id TEXT UNIQUE, razorpay_payment_id TEXT UNIQUE
    );
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
    ALTER TABLE payments ALTER COLUMN stripe_session_id DROP NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_order_id_uq ON payments(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_payment_id_uq ON payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
  `);
}
