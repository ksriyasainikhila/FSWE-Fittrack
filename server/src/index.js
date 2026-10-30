import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import crypto from 'node:crypto';
import { pool, initDb } from './db.js';
import { auth } from './auth.js';
import { sendEmail } from './email.js';

dotenv.config();
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required. Copy server/.env.example to server/.env and configure it.');
  process.exit(1);
}
const app = express();
// Allow frontend origin (handles trailing slash or any origin smoothly)
app.use(cors());

// Razorpay webhook must receive the raw body for signature verification.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).send('Razorpay webhook is not configured');
  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest('hex');
  const a = Buffer.from(String(signature || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).send('Webhook signature verification failed');
  try {
    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity;
      const order = event.payload?.order?.entity;
      const userId = Number(payment?.notes?.userId || order?.notes?.userId);
      const orderId = payment?.order_id || order?.id;
      const paymentId = payment?.id;
      const amount = payment?.amount || order?.amount || 0;
      const currency = payment?.currency || order?.currency || 'INR';
      if (userId && orderId) {
        await pool.query(
          `INSERT INTO payments(user_id, razorpay_order_id, razorpay_payment_id, status, amount_total, currency)
           VALUES($1,$2,$3,'paid',$4,$5)
           ON CONFLICT(razorpay_order_id) DO UPDATE SET
             razorpay_payment_id=COALESCE(EXCLUDED.razorpay_payment_id,payments.razorpay_payment_id),
             status='paid', amount_total=EXCLUDED.amount_total, currency=EXCLUDED.currency`,
          [userId, orderId, paymentId || null, amount, currency]
        );
        await pool.query('UPDATE users SET is_premium=TRUE WHERE id=$1', [userId]);
        const user = await pool.query('SELECT name,email FROM users WHERE id=$1', [userId]);
        if (user.rows[0]) await sendEmail({
          to: user.rows[0].email, subject: 'FitTrack Premium activated',
          text: `Hi ${user.rows[0].name}, your FitTrack Premium payment was confirmed. Thank you!`
        }).catch(err => console.error('Premium email failed:', err.message));
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Razorpay webhook processing failed', err);
    res.status(500).send('Webhook processing failed');
  }
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8)
      return res.status(400).json({ error: 'Enter a name, valid email, and password of at least 8 characters.' });
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,is_premium',
      [name, email, hash]
    );
    await pool.query('INSERT INTO goals(user_id) VALUES($1)', [result.rows[0].id]);
    await sendEmail({ to: email, subject: 'Welcome to FitTrack', text: `Hi ${name}, welcome to FitTrack! Start logging your workouts and meals today.` }).catch(err => console.error('Welcome email failed:', err.message));
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error(err); res.status(500).json({ error: 'Could not create account.' });
  }
});
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const result = await pool.query('SELECT id,name,email,password_hash,is_premium FROM users WHERE email=$1', [email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, is_premium: user.is_premium } });
});
app.get('/api/auth/me', auth, async (req, res) => {
  const r = await pool.query('SELECT id,name,email,is_premium FROM users WHERE id=$1', [req.user.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: r.rows[0] });
});

app.get('/api/dashboard', auth, async (req, res) => {
  const uid = req.user.id;
  const [steps, meals, workouts, goals, recentWorkouts, recentMeals, user, weeklyActivity, workoutTypes] = await Promise.all([
    pool.query('SELECT COALESCE(step_count,0)::int AS steps FROM steps WHERE user_id=$1 AND logged_on=CURRENT_DATE', [uid]),
    pool.query('SELECT COALESCE(SUM(calories),0)::int AS calories FROM meals WHERE user_id=$1 AND logged_at::date=CURRENT_DATE', [uid]),
    pool.query('SELECT COALESCE(SUM(calories_burned),0)::int AS burned, COALESCE(SUM(duration_minutes),0)::int AS minutes, COUNT(*)::int AS count FROM workouts WHERE user_id=$1 AND logged_at::date=CURRENT_DATE', [uid]),
    pool.query('SELECT daily_steps,daily_calories FROM goals WHERE user_id=$1', [uid]),
    pool.query('SELECT id,workout_type,duration_minutes,calories_burned,logged_at FROM workouts WHERE user_id=$1 ORDER BY logged_at DESC LIMIT 5', [uid]),
    pool.query('SELECT id,meal_name,calories,meal_type,logged_at FROM meals WHERE user_id=$1 ORDER BY logged_at DESC LIMIT 5', [uid]),
    pool.query('SELECT is_premium FROM users WHERE id=$1', [uid]),
    pool.query(`
      SELECT
        to_char(d.day, 'Dy') AS day,
        to_char(d.day, 'Mon DD') AS label,
        to_char(d.day, 'YYYY-MM-DD') AS date,
        COALESCE(s.step_count, 0)::int AS steps,
        COALESCE(w.burned, 0)::int AS burned,
        COALESCE(m.calories, 0)::int AS intake
      FROM generate_series((CURRENT_DATE - INTERVAL '6 days')::date, CURRENT_DATE::date, '1 day'::interval) AS d(day)
      LEFT JOIN steps s ON s.logged_on = d.day::date AND s.user_id = $1
      LEFT JOIN (
        SELECT logged_at::date AS w_date, SUM(calories_burned)::int AS burned
        FROM workouts WHERE user_id = $1 GROUP BY logged_at::date
      ) w ON w.w_date = d.day::date
      LEFT JOIN (
        SELECT logged_at::date AS m_date, SUM(calories)::int AS calories
        FROM meals WHERE user_id = $1 GROUP BY logged_at::date
      ) m ON m.m_date = d.day::date
      ORDER BY d.day ASC
    `, [uid]),
    pool.query(`
      SELECT workout_type, COUNT(*)::int AS count, SUM(calories_burned)::int AS calories, SUM(duration_minutes)::int AS minutes
      FROM workouts WHERE user_id = $1
      GROUP BY workout_type ORDER BY count DESC LIMIT 6
    `, [uid])
  ]);
  const currentSteps = steps.rows[0]?.steps || 0, calorieIntake = meals.rows[0].calories;
  const goal = goals.rows[0] || { daily_steps: 8000, daily_calories: 2200 };
  const tips = [];
  tips.push(currentSteps >= goal.daily_steps ? 'Great job hitting your step goal today!' : `You are ${Math.max(0, goal.daily_steps-currentSteps).toLocaleString()} steps away from today's step goal.`);
  if (calorieIntake > goal.daily_calories) tips.push('Your logged calorie intake is above your daily target; consider your overall weekly pattern.');
  else tips.push('Keep logging meals consistently to understand your nutrition patterns.');
  if (!workouts.rows[0].count) tips.push('A short walk or light movement break can be a good way to get started.');
  res.json({
    summary: { steps: currentSteps, calories: calorieIntake, caloriesBurned: workouts.rows[0].burned, workoutMinutes: workouts.rows[0].minutes, workouts: workouts.rows[0].count },
    goals: { dailySteps: goal.daily_steps, dailyCalories: goal.daily_calories },
    recentWorkouts: recentWorkouts.rows, recentMeals: recentMeals.rows, tips, isPremium: user.rows[0]?.is_premium || false,
    weeklyActivity: weeklyActivity.rows,
    workoutTypes: workoutTypes.rows
  });
});

app.get('/api/workouts', auth, async (req,res) => {
  const r = await pool.query('SELECT id,workout_type,duration_minutes,calories_burned,notes,logged_at FROM workouts WHERE user_id=$1 ORDER BY logged_at DESC LIMIT 50',[req.user.id]); res.json(r.rows);
});
app.post('/api/workouts', auth, async (req,res) => {
  const type=String(req.body.workoutType||'').trim(), duration=Number(req.body.durationMinutes), calories=Number(req.body.caloriesBurned||0), notes=String(req.body.notes||'').slice(0,500);
  if (!type || type.length>80 || !Number.isInteger(duration) || duration<1 || duration>1440 || !Number.isInteger(calories) || calories<0 || calories>20000) return res.status(400).json({error:'Enter a workout type, duration (1–1440 minutes), and valid calories burned.'});
  const r=await pool.query('INSERT INTO workouts(user_id,workout_type,duration_minutes,calories_burned,notes) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.user.id,type,duration,calories,notes]);
  const u=await pool.query('SELECT name,email FROM users WHERE id=$1',[req.user.id]);
  if(u.rows[0]) await sendEmail({to:u.rows[0].email,subject:'FitTrack fitness update: workout logged',text:`Hi ${u.rows[0].name},\n\nYour workout was saved successfully.\nActivity: ${type}\nDuration: ${duration} minutes\nCalories burned: ${calories} kcal\n\nKeep building healthy habits with FitTrack.`}).catch(err=>console.error('Workout email failed:',err.message));
  res.status(201).json(r.rows[0]);
});
app.get('/api/steps', auth, async (req,res) => { const r=await pool.query('SELECT id,step_count,logged_on FROM steps WHERE user_id=$1 ORDER BY logged_on DESC LIMIT 30',[req.user.id]); res.json(r.rows); });
app.post('/api/steps', auth, async (req,res) => {
  const count=Number(req.body.stepCount);
  if (!Number.isInteger(count)||count<0||count>200000) return res.status(400).json({error:'Steps must be a whole number between 0 and 200,000.'});
  const r=await pool.query(`INSERT INTO steps(user_id,step_count,logged_on) VALUES($1,$2,CURRENT_DATE)
    ON CONFLICT(user_id,logged_on) DO UPDATE SET step_count=EXCLUDED.step_count RETURNING *`,[req.user.id,count]);
  const u=await pool.query('SELECT name,email FROM users WHERE id=$1',[req.user.id]);
  if(u.rows[0]) await sendEmail({to:u.rows[0].email,subject:'FitTrack fitness update: steps saved',text:`Hi ${u.rows[0].name},\n\nYour step count was updated to ${count.toLocaleString()} steps for today. Keep moving at a pace that feels right for you.`}).catch(err=>console.error('Steps email failed:',err.message));
  res.status(201).json(r.rows[0]);
});
app.get('/api/meals', auth, async (req,res) => { const r=await pool.query('SELECT id,meal_name,calories,meal_type,logged_at FROM meals WHERE user_id=$1 ORDER BY logged_at DESC LIMIT 50',[req.user.id]); res.json(r.rows); });
app.post('/api/meals', auth, async (req,res) => {
  const name=String(req.body.mealName||'').trim(), calories=Number(req.body.calories), type=String(req.body.mealType||'Snack');
  if (!name||name.length>120||!Number.isInteger(calories)||calories<0||calories>20000||!['Breakfast','Lunch','Dinner','Snack'].includes(type)) return res.status(400).json({error:'Enter a meal name, valid calories, and meal type.'});
  const r=await pool.query('INSERT INTO meals(user_id,meal_name,calories,meal_type) VALUES($1,$2,$3,$4) RETURNING *',[req.user.id,name,calories,type]);
  const u=await pool.query('SELECT name,email FROM users WHERE id=$1',[req.user.id]);
  if(u.rows[0]) await sendEmail({to:u.rows[0].email,subject:'FitTrack fitness update: meal logged',text:`Hi ${u.rows[0].name},\n\nYour meal was saved.\nMeal: ${name}\nType: ${type}\nCalories: ${calories} kcal\n\nFitTrack helps you track patterns over time; one meal does not define your progress.`}).catch(err=>console.error('Meal email failed:',err.message));
  res.status(201).json(r.rows[0]);
});
app.get('/api/goals', auth, async (req,res) => { const r=await pool.query('SELECT daily_steps,daily_calories FROM goals WHERE user_id=$1',[req.user.id]); res.json(r.rows[0]||{daily_steps:8000,daily_calories:2200}); });
app.put('/api/goals', auth, async (req,res) => {
  const steps=Number(req.body.dailySteps), calories=Number(req.body.dailyCalories);
  if (!Number.isInteger(steps)||steps<500||steps>100000||!Number.isInteger(calories)||calories<500||calories>10000) return res.status(400).json({error:'Goals must be valid numbers (steps 500–100,000; calories 500–10,000).'});
  const r=await pool.query('INSERT INTO goals(user_id,daily_steps,daily_calories) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET daily_steps=EXCLUDED.daily_steps,daily_calories=EXCLUDED.daily_calories,updated_at=NOW() RETURNING daily_steps,daily_calories',[req.user.id,steps,calories]);
  const u=await pool.query('SELECT name,email FROM users WHERE id=$1',[req.user.id]);
  if(u.rows[0]) await sendEmail({to:u.rows[0].email,subject:'FitTrack fitness update: goals changed',text:`Hi ${u.rows[0].name},\n\nYour goals have been updated:\nDaily steps: ${steps.toLocaleString()}\nDaily calorie tracking target: ${calories.toLocaleString()} kcal\n\nThese are personal tracking targets, not medical advice.`}).catch(err=>console.error('Goals email failed:',err.message));
  res.json(r.rows[0]);
});

app.post('/api/payments/checkout', auth, async (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Payments are not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to server/.env.' });
  }
  try {
    const userResult = await pool.query('SELECT id,name,email,is_premium FROM users WHERE id=$1', [req.user.id]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.is_premium) return res.status(400).json({ error: 'Premium is already active for this account.' });
    const amount = Number(process.env.RAZORPAY_AMOUNT_PAISE || 19900);
    if (!Number.isInteger(amount) || amount < 100) return res.status(500).json({ error: 'RAZORPAY_AMOUNT_PAISE must be a valid amount in paise.' });
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.create({
      amount, currency: process.env.RAZORPAY_CURRENCY || 'INR',
      receipt: `fittrack_${user.id}_${Date.now()}`,
      notes: { userId: String(user.id), product: 'FitTrack Premium' }
    });
    await pool.query(
      `INSERT INTO payments(user_id, razorpay_order_id, status, amount_total, currency)
       VALUES($1,$2,'pending',$3,$4)
       ON CONFLICT(razorpay_order_id) DO NOTHING`,
      [user.id, order.id, order.amount, order.currency]
    );
    res.json({
      keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id,
      amount: order.amount, currency: order.currency,
      name: 'FitTrack Premium', description: 'Premium fitness tracking access',
      prefill: { name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Could not create Razorpay order:', err);
    res.status(500).json({ error: 'Could not start payment. Check your Razorpay test keys and server logs.' });
  }
});

app.post('/api/payments/verify', auth, async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  if (!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ error: 'Razorpay is not configured.' });
  if (!orderId || !paymentId || !signature) return res.status(400).json({ error: 'Payment verification details are incomplete.' });
  try {
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`).digest('hex');
    const a = Buffer.from(String(signature), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).json({ error: 'Payment signature is invalid. Premium was not activated.' });
    }
    const paymentResult = await pool.query(
      `UPDATE payments SET razorpay_payment_id=$1,status='paid'
       WHERE razorpay_order_id=$2 AND user_id=$3 RETURNING amount_total,currency`,
      [paymentId, orderId, req.user.id]
    );
    if (!paymentResult.rows[0]) return res.status(404).json({ error: 'Payment order was not found for this account.' });
    await pool.query('UPDATE users SET is_premium=TRUE WHERE id=$1', [req.user.id]);
    const user = await pool.query('SELECT name,email FROM users WHERE id=$1', [req.user.id]);
    if (user.rows[0]) await sendEmail({
      to: user.rows[0].email, subject: 'FitTrack Premium activated',
      text: `Hi ${user.rows[0].name}, your FitTrack Premium payment was verified successfully. Thank you!`
    }).catch(err => console.error('Premium email failed:', err.message));
    res.json({ verified: true, isPremium: true });
  } catch (err) {
    console.error('Payment verification failed:', err);
    res.status(500).json({ error: 'Could not verify payment.' });
  }
});

app.get('/', (req, res) => {
  res.send('FitTrack Backend is running successfully!');
});

const port=Number(process.env.PORT||4000);
initDb().then(()=>app.listen(port,()=>console.log(`FitTrack API listening on http://localhost:${port}`)))
  .catch(err=>{console.error('Database initialization failed:',err);process.exit(1);});
