import bcrypt from 'bcryptjs';
import { pool } from './db.js';

async function seed() {
  console.log('Seeding rich sample fitness data with weekly trends and graphs...');

  // 1. Ensure demo user exists
  const email = 'demo@fittrack.com';
  let userRes = await pool.query('SELECT id, name, email FROM users WHERE email=$1', [email]);
  let userId;

  if (userRes.rows.length === 0) {
    const hash = await bcrypt.hash('password123', 12);
    const createRes = await pool.query(
      'INSERT INTO users(name, email, password_hash, is_premium) VALUES($1, $2, $3, TRUE) RETURNING id',
      ['Demo User', email, hash]
    );
    userId = createRes.rows[0].id;
  } else {
    userId = userRes.rows[0].id;
    await pool.query('UPDATE users SET is_premium=TRUE WHERE id=$1', [userId]);
  }

  // Clear existing activity data for this user to ensure pristine clean state
  await pool.query('DELETE FROM workouts WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM meals WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM steps WHERE user_id=$1', [userId]);

  // Set goals: 8,000 steps and 2,200 daily calories
  await pool.query(
    `INSERT INTO goals(user_id, daily_steps, daily_calories)
     VALUES($1, 8000, 2200)
     ON CONFLICT(user_id) DO UPDATE SET daily_steps=8000, daily_calories=2200, updated_at=NOW()`,
    [userId]
  );

  // 2. Steps for the past 7 days (including today)
  const stepData = [
    { offset: 6, steps: 7650 },
    { offset: 5, steps: 8920 },
    { offset: 4, steps: 9400 },
    { offset: 3, steps: 6850 },
    { offset: 2, steps: 10420 },
    { offset: 1, steps: 8750 },
    { offset: 0, steps: 9680 } // today (exceeds goal!)
  ];

  for (const s of stepData) {
    await pool.query(
      `INSERT INTO steps(user_id, step_count, logged_on)
       VALUES($1, $2, (CURRENT_DATE - INTERVAL '${s.offset} days')::date)
       ON CONFLICT(user_id, logged_on) DO UPDATE SET step_count=EXCLUDED.step_count`,
      [userId, s.steps]
    );
  }

  // 3. Workouts across the week (using explicit CURRENT_DATE offsets so they match dates perfectly)
  const workoutData = [
    // Today (offset 0)
    { offset: 0, time: '07:30:00', type: 'Running', duration: 35, cal: 340, notes: 'Morning brisk outdoor run' },
    { offset: 0, time: '12:15:00', type: 'Strength training', duration: 45, cal: 290, notes: 'Upper body and core circuit' },
    { offset: 0, time: '17:45:00', type: 'Walking', duration: 25, cal: 110, notes: 'Post-work evening walk' },
    // Yesterday (offset 1)
    { offset: 1, time: '08:00:00', type: 'Cycling', duration: 45, cal: 380, notes: 'Scenic riverside ride' },
    { offset: 1, time: '18:30:00', type: 'Yoga', duration: 30, cal: 125, notes: 'Mindfulness and stretching' },
    // 2 days ago (offset 2)
    { offset: 2, time: '07:15:00', type: 'Swimming', duration: 40, cal: 410, notes: 'Laps freestyle and breaststroke' },
    { offset: 2, time: '19:00:00', type: 'Walking', duration: 30, cal: 130, notes: 'Evening stroll' },
    // 3 days ago (offset 3)
    { offset: 3, time: '11:00:00', type: 'Strength training', duration: 50, cal: 330, notes: 'Lower body leg day' },
    // 4 days ago (offset 4)
    { offset: 4, time: '07:45:00', type: 'Running', duration: 40, cal: 390, notes: 'Tempo pace run' },
    { offset: 4, time: '18:00:00', type: 'Yoga', duration: 25, cal: 110, notes: 'Gentle spinal mobility' },
    // 5 days ago (offset 5)
    { offset: 5, time: '08:30:00', type: 'Cycling', duration: 50, cal: 420, notes: 'Endurance ride' },
    // 6 days ago (offset 6)
    { offset: 6, time: '09:00:00', type: 'Walking', duration: 45, cal: 180, notes: 'Trail hike' }
  ];

  for (const w of workoutData) {
    await pool.query(
      `INSERT INTO workouts(user_id, workout_type, duration_minutes, calories_burned, notes, logged_at)
       VALUES($1, $2, $3, $4, $5, ((CURRENT_DATE - INTERVAL '${w.offset} days')::date + TIME '${w.time}')::timestamptz)`,
      [userId, w.type, w.duration, w.cal, w.notes]
    );
  }

  // 4. Meals across the week
  const mealData = [
    // Today (offset 0)
    { offset: 0, time: '08:30:00', name: 'Avocado Toast & 2 Soft Boiled Eggs', cal: 440, type: 'Breakfast' },
    { offset: 0, time: '13:00:00', name: 'Grilled Chicken & Quinoa Harvest Bowl', cal: 680, type: 'Lunch' },
    { offset: 0, time: '16:30:00', name: 'Greek Yogurt, Berries & Honey Almonds', cal: 260, type: 'Snack' },
    { offset: 0, time: '19:45:00', name: 'Baked Salmon with Asparagus & Sweet Potato', cal: 580, type: 'Dinner' },
    // Yesterday (offset 1)
    { offset: 1, time: '08:15:00', name: 'Steel Cut Oatmeal with Banana & Almond Butter', cal: 410, type: 'Breakfast' },
    { offset: 1, time: '12:45:00', name: 'Tuna Poke Bowl with Brown Rice & Edamame', cal: 640, type: 'Lunch' },
    { offset: 1, time: '16:00:00', name: 'Protein Shake & Dark Chocolate Walnuts', cal: 270, type: 'Snack' },
    { offset: 1, time: '19:30:00', name: 'Herb Roasted Turkey Salad with Tahini', cal: 590, type: 'Dinner' },
    // 2 days ago (offset 2)
    { offset: 2, time: '08:00:00', name: 'Egg White Veggie Scramble with Rye Bread', cal: 380, type: 'Breakfast' },
    { offset: 2, time: '13:15:00', name: 'Mediterranean Chicken Wrap with Hummus', cal: 620, type: 'Lunch' },
    { offset: 2, time: '17:00:00', name: 'Green Apple Slices with Almond Butter', cal: 210, type: 'Snack' },
    { offset: 2, time: '20:00:00', name: 'Chicken Fajita Bowl with Guacamole', cal: 690, type: 'Dinner' },
    // 3 days ago (offset 3)
    { offset: 3, time: '08:30:00', name: 'Blueberry Protein Smoothie Bowl', cal: 430, type: 'Breakfast' },
    { offset: 3, time: '13:00:00', name: 'Lentil & Veggie Bowl with Feta', cal: 580, type: 'Lunch' },
    { offset: 3, time: '20:00:00', name: 'Grilled Steak with Roasted Asparagus', cal: 650, type: 'Dinner' },
    // 4 days ago (offset 4)
    { offset: 4, time: '08:15:00', name: 'Peanut Butter Granola & Greek Yogurt', cal: 420, type: 'Breakfast' },
    { offset: 4, time: '13:00:00', name: 'Grilled Salmon Caesar Salad', cal: 610, type: 'Lunch' },
    { offset: 4, time: '19:30:00', name: 'Brown Rice Stir-fry with Tofu & Cashews', cal: 590, type: 'Dinner' },
    // 5 days ago (offset 5)
    { offset: 5, time: '08:00:00', name: 'Chia Seed Pudding with Sliced Kiwi', cal: 350, type: 'Breakfast' },
    { offset: 5, time: '13:30:00', name: 'Smoked Salmon & Cream Cheese Bagel', cal: 540, type: 'Lunch' },
    { offset: 5, time: '19:45:00', name: 'Turkey Meatballs with Marinara & Polenta', cal: 620, type: 'Dinner' },
    // 6 days ago (offset 6)
    { offset: 6, time: '08:45:00', name: 'Scrambled Eggs with Avocado & Sourdough', cal: 460, type: 'Breakfast' },
    { offset: 6, time: '13:15:00', name: 'Warm Grain Bowl with Roasted Squash', cal: 570, type: 'Lunch' },
    { offset: 6, time: '19:30:00', name: 'Cod Fish Fillet with Lemon Potatoes', cal: 580, type: 'Dinner' }
  ];

  for (const m of mealData) {
    await pool.query(
      `INSERT INTO meals(user_id, meal_name, calories, meal_type, logged_at)
       VALUES($1, $2, $3, $4, ((CURRENT_DATE - INTERVAL '${m.offset} days')::date + TIME '${m.time}')::timestamptz)`,
      [userId, m.name, m.cal, m.type]
    );
  }

  console.log('✓ Rich sample fitness data successfully seeded for demo@fittrack.com!');
  await pool.end();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
