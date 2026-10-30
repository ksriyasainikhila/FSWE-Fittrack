import React, { useEffect, useState } from 'react';

const RAW_API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
let cleanApi = RAW_API.replace(/\/+$/, '');
if (!cleanApi.endsWith('/api')) {
  cleanApi = `${cleanApi}/api`;
}
const API = cleanApi;

async function request(path, token, options = {}) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${API}${cleanPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  }).catch(err => {
    if (err.message?.includes('fetch') || err.name === 'TypeError') {
      throw new Error(`Cannot connect to backend API at ${API}. If using Render free tier, please wait 30-60s for backend wake-up, or verify VITE_API_URL.`);
    }
    throw err;
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

function MiniSparkline({ data = [], color = '#8877d8' }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 30 - ((v - min) / range) * 24;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="sparkline-wrapper">
      <svg className="spark-svg" viewBox="0 0 100 32" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}

function WeeklyStepChart({ activity = [], goal = 8000 }) {
  if (!activity || activity.length === 0) return null;
  const maxSteps = Math.max(...activity.map(a => a.steps || 0), goal * 1.15, 10000);
  const avgSteps = Math.round(activity.reduce((sum, a) => sum + (a.steps || 0), 0) / activity.length);
  const goalYPercent = Math.max(10, Math.min(90, 100 - (goal / maxSteps) * 100));

  return (
    <div className="panel chart-panel">
      <div className="panel-title">
        <div>
          <h3>Weekly step trends</h3>
          <p>Movement over the last 7 days</p>
        </div>
        <div className="chart-badge lilac">
          <span>7-day avg:</span> <b>{avgSteps.toLocaleString()} steps/day</b>
        </div>
      </div>

      <div className="bar-chart-wrapper">
        <div className="chart-goal-line" style={{ top: `${goalYPercent}%` }}>
          <span className="goal-label">Goal: {goal.toLocaleString()}</span>
        </div>
        <div className="bars-row">
          {activity.map((item, idx) => {
            const heightPct = Math.min(100, Math.max(8, Math.round(((item.steps || 0) / maxSteps) * 100)));
            const isGoalMet = (item.steps || 0) >= goal;
            const isToday = idx === activity.length - 1;
            return (
              <div key={item.date || idx} className="bar-col">
                <div className="bar-track">
                  <div
                    className={`bar-fill step-fill ${isGoalMet ? 'goal-met' : ''} ${isToday ? 'is-today' : ''}`}
                    style={{ height: `${heightPct}%` }}
                  >
                    <span className="bar-tooltip">
                      <strong>{(item.steps || 0).toLocaleString()}</strong>
                      <small>{Math.round(((item.steps || 0) / goal) * 100)}% of goal</small>
                    </span>
                  </div>
                </div>
                <div className="bar-label-wrap">
                  <span className={`bar-day ${isToday ? 'today-text' : ''}`}>
                    {isToday ? 'Today' : item.day}
                  </span>
                  <small className="bar-sub">{item.label?.split(' ')[1] || ''}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart-footer">
        <div className="chart-legend-item"><span className="legend-dot lilac" /> <span>Normal days</span></div>
        <div className="chart-legend-item"><span className="legend-dot lilac-bright" /> <span>Goal achieved (8k+)</span></div>
        <div className="chart-legend-item"><span className="legend-line" /> <span>Target threshold</span></div>
      </div>
    </div>
  );
}

function WeeklyCalorieChart({ activity = [] }) {
  if (!activity || activity.length === 0) return null;
  const maxCal = Math.max(...activity.map(a => Math.max(a.intake || 0, a.burned || 0)), 2200);

  return (
    <div className="panel chart-panel">
      <div className="panel-title">
        <div>
          <h3>Energy balance</h3>
          <p>Calories consumed vs active burn</p>
        </div>
        <div className="chart-legend-row">
          <span className="legend-chip"><i className="legend-dot peach" /> Ingested</span>
          <span className="legend-chip"><i className="legend-dot mint" /> Burned</span>
        </div>
      </div>

      <div className="bar-chart-wrapper">
        <div className="bars-row">
          {activity.map((item, idx) => {
            const intakePct = Math.min(100, Math.max(8, Math.round(((item.intake || 0) / maxCal) * 100)));
            const burnedPct = Math.min(100, Math.max(8, Math.round(((item.burned || 0) / maxCal) * 100)));
            const isToday = idx === activity.length - 1;
            return (
              <div key={item.date || idx} className="bar-col">
                <div className="bar-track dual-track">
                  <div className="bar-fill calorie-in" style={{ height: `${intakePct}%` }}>
                    <span className="bar-tooltip"><strong>{item.intake || 0} kcal</strong><small>Eaten</small></span>
                  </div>
                  <div className="bar-fill calorie-out" style={{ height: `${burnedPct}%` }}>
                    <span className="bar-tooltip"><strong>{item.burned || 0} kcal</strong><small>Burned</small></span>
                  </div>
                </div>
                <div className="bar-label-wrap">
                  <span className={`bar-day ${isToday ? 'today-text' : ''}`}>{isToday ? 'Today' : item.day}</span>
                  <small className="bar-sub">{item.label?.split(' ')[1] || ''}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart-footer">
        <span className="chart-footer-note">✧ Net balance tracked daily to maintain healthy habit consistency.</span>
      </div>
    </div>
  );
}

function WorkoutBreakdown({ types = [] }) {
  if (!types || types.length === 0) return null;
  const totalMinutes = types.reduce((acc, t) => acc + (t.minutes || 0), 0) || 1;
  const colors = ['#8877d8', '#4da984', '#d68c65', '#5a96e3', '#e06d9b', '#e5a93b'];
  const icons = {
    'Running': '🏃',
    'Walking': '🚶',
    'Cycling': '🚴',
    'Strength training': '🏋️',
    'Yoga': '🧘',
    'Swimming': '🏊'
  };

  return (
    <div className="panel chart-panel">
      <div className="panel-title">
        <div>
          <h3>Activity distribution</h3>
          <p>Types of movement logged this week</p>
        </div>
        <span className="soft-badge">{totalMinutes} TOTAL MIN</span>
      </div>
      <div className="breakdown-list">
        {types.map((t, idx) => {
          const share = Math.round(((t.minutes || 0) / totalMinutes) * 100);
          const color = colors[idx % colors.length];
          return (
            <div key={t.workout_type} className="breakdown-item">
              <div className="breakdown-head">
                <span className="breakdown-icon">{icons[t.workout_type] || '↗'}</span>
                <div className="breakdown-meta">
                  <b>{t.workout_type}</b>
                  <small>{t.count} session{t.count > 1 ? 's' : ''} · {t.minutes} mins · {t.calories} kcal</small>
                </div>
                <strong className="breakdown-pct">{share}%</strong>
              </div>
              <div className="breakdown-bar">
                <div className="breakdown-fill" style={{ width: `${share}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('fittrack_token') || '');
  const [user, setUser] = useState(null), [dash, setDash] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [authMode, setAuthMode] = useState('login'), [busy, setBusy] = useState(false);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [workout, setWorkout] = useState({ workoutType: 'Walking', durationMinutes: 30, caloriesBurned: 150, notes: '' });
  const [meal, setMeal] = useState({ mealName: '', calories: 400, mealType: 'Lunch' });
  const [steps, setSteps] = useState('6000'), [goals, setGoals] = useState({ dailySteps: 8000, dailyCalories: 2200 });
  const [tab, setTab] = useState('overview');

  const update = (setter, key, value) => setter(old => ({ ...old, [key]: value }));

  async function refresh(t = token) {
    const [me, d] = await Promise.all([request('/auth/me', t), request('/dashboard', t)]);
    setUser(me.user);
    setDash(d);
    setGoals(d.goals);
    setSteps(String(d.summary.steps || 0));
  }

  useEffect(() => {
    if (token) refresh(token).catch(e => { setError(e.message); logout(false); });
  }, [token]);

  useEffect(() => {
    const p = new URLSearchParams(location.search).get('payment');
    if (p === 'success') setNotice('Payment verified. Welcome to FitTrack Premium!');
    if (p === 'cancelled') setNotice('Payment was cancelled. No payment was made.');
  }, []);

  function logout(clear = true) {
    if (clear) localStorage.removeItem('fittrack_token');
    setToken('');
    setUser(null);
    setDash(null);
  }

  async function submitAuth(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await request(`/auth/${authMode === 'register' ? 'register' : 'login'}`, null, {
        method: 'POST',
        body: JSON.stringify(authForm)
      });
      localStorage.setItem('fittrack_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setNotice(authMode === 'register' ? 'Welcome to FitTrack! Check your email if SMTP is configured.' : 'Welcome back!');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(path, body, success) {
    setError('');
    setNotice('');
    try {
      await request(path, token, { method: path === '/goals' ? 'PUT' : 'POST', body: JSON.stringify(body) });
      await refresh();
      setNotice(success);
    } catch (e) {
      setError(e.message);
    }
  }

  async function upgrade() {
    setError('');
    setNotice('');
    try {
      const data = await request('/payments/checkout', token, { method: 'POST', body: JSON.stringify({}) });
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check your internet connection.'));
          document.body.appendChild(script);
        });
      }
      const checkout = new window.Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: data.name,
        description: data.description,
        order_id: data.orderId,
        prefill: data.prefill,
        theme: { color: '#6750a4' },
        handler: async function (response) {
          try {
            await request('/payments/verify', token, { method: 'POST', body: JSON.stringify(response) });
            await refresh();
            setNotice('Payment verified successfully. FitTrack Premium is now active.');
          } catch (err) {
            setError(err.message || 'Payment verification failed. Contact support if money was deducted.');
          }
        },
        modal: { ondismiss: () => setNotice('Checkout closed. If you completed payment, wait for confirmation or refresh your dashboard.') }
      });
      checkout.on('payment.failed', response => setError(response.error?.description || 'Payment failed. Please try again.'));
      checkout.open();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!token || !user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand">
            <div className="brand-icon">✦</div>
            <span>fittrack</span>
          </div>
          <p className="eyebrow">YOUR HEALTH, IN FOCUS</p>
          <h1>{authMode === 'login' ? 'Welcome back.' : 'Build your healthier routine.'}</h1>
          <p className="muted">Track movement, nutrition, and progress in one calm space.</p>
          {error && <div className="alert error">{error}</div>}
          <form onSubmit={submitAuth} className="stack">
            {authMode === 'register' && (
              <Field
                label="Your name"
                value={authForm.name}
                onChange={e => update(setAuthForm, 'name', e.target.value)}
                required
                minLength="2"
                placeholder="Alex Morgan"
              />
            )}
            <Field
              label="Email address"
              type="email"
              value={authForm.email}
              onChange={e => update(setAuthForm, 'email', e.target.value)}
              required
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              type="password"
              value={authForm.password}
              onChange={e => update(setAuthForm, 'password', e.target.value)}
              required
              minLength="8"
              placeholder="At least 8 characters"
            />
            <button className="primary full" disabled={busy}>
              {busy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <p className="switch">
            {authMode === 'login' ? 'New to FitTrack?' : 'Already have an account?'}{' '}
            <button
              className="text-button"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {authMode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <p className="tiny">By continuing, you agree to use FitTrack as a wellness tool, not as medical advice.</p>
        </section>
      </main>
    );
  }

  if (!dash) return <main className="loading">Preparing your dashboard…</main>;

  const pct = Math.min(100, Math.round((dash.summary.steps / Math.max(1, dash.goals.dailySteps)) * 100));
  const weeklyStepsList = dash.weeklyActivity?.map(a => a.steps) || [6500, 7200, 8100, 9680];
  const weeklyBurnedList = dash.weeklyActivity?.map(a => a.burned) || [350, 420, 500, 740];
  const weeklyEatenList = dash.weeklyActivity?.map(a => a.intake) || [1800, 1950, 2100, 1960];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">✦</div>
          <span>fittrack</span>
        </div>
        <div className="side-label">WORKSPACE</div>
        {['overview', 'workouts', 'nutrition', 'goals'].map(x => (
          <button key={x} className={`nav-item ${tab === x ? 'active' : ''}`} onClick={() => setTab(x)}>
            <span>{({ overview: '◫', workouts: '↗', nutrition: '◉', goals: '◎' })[x]}</span>
            {x[0].toUpperCase() + x.slice(1)}
          </button>
        ))}
        <div className="side-bottom">
          <div className="mini-avatar">{user.name?.slice(0, 1).toUpperCase()}</div>
          <div className="user-meta">
            <strong>{user.name}</strong>
            <span>{dash.isPremium ? 'Premium member' : 'Free plan'}</span>
          </div>
          <button className="logout" title="Sign out" onClick={() => logout()}>↪</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">FITNESS OVERVIEW</p>
            <h1>
              {tab === 'overview'
                ? 'Your daily snapshot'
                : tab === 'workouts'
                ? 'Workout journal'
                : tab === 'nutrition'
                ? 'Nutrition journal'
                : 'Your goals'}
            </h1>
          </div>
          <div className="top-actions">
            <span className="date-pill">● Today</span>
            <button className="upgrade" onClick={upgrade}>
              {dash.isPremium ? '✓ Premium active' : '✦ Upgrade to Premium'}
            </button>
          </div>
        </header>

        {notice && (
          <div className="alert success">
            {notice}
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}
        {error && (
          <div className="alert error">
            {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}

        {tab === 'overview' && (
          <>
            <section className="welcome-row">
              <div>
                <h2>Good to see you, {user.name.split(' ')[0]} <span>✦</span></h2>
                <p>Small steps add up. Here’s how your activity is tracking.</p>
              </div>
              <div className="streak-pill">✧ 7-day active streak</div>
            </section>

            {/* Top Stat Cards with Mini Sparklines */}
            <section className="stats-grid">
              <article className="stat-card">
                <div className="stat-head">
                  <span>Steps today</span>
                  <span className="stat-icon lilac">↗</span>
                </div>
                <strong>{Number(dash.summary.steps).toLocaleString()}</strong>
                <div className="progress">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <small>{pct}% of {Number(dash.goals.dailySteps).toLocaleString()} step goal</small>
                <MiniSparkline data={weeklyStepsList} color="#8877d8" />
              </article>

              <article className="stat-card">
                <div className="stat-head">
                  <span>Calories eaten</span>
                  <span className="stat-icon peach">◉</span>
                </div>
                <strong>{Number(dash.summary.calories).toLocaleString()} <em>kcal</em></strong>
                <div className="subtle-bar">
                  <i style={{ width: `${Math.min(100, (dash.summary.calories / dash.goals.dailyCalories) * 100)}%` }} />
                </div>
                <small>Daily target {Number(dash.goals.dailyCalories).toLocaleString()} kcal</small>
                <MiniSparkline data={weeklyEatenList} color="#d68c65" />
              </article>

              <article className="stat-card">
                <div className="stat-head">
                  <span>Calories burned</span>
                  <span className="stat-icon mint">♨</span>
                </div>
                <strong>{Number(dash.summary.caloriesBurned).toLocaleString()} <em>kcal</em></strong>
                <div className="sparkline-bar">
                  <i style={{ width: `${Math.min(100, (dash.summary.caloriesBurned / 700) * 100)}%` }} />
                </div>
                <small>{dash.summary.workoutMinutes} active minutes today</small>
                <MiniSparkline data={weeklyBurnedList} color="#4da984" />
              </article>
            </section>

            {/* Interactive Weekly Trend Charts Section */}
            <section className="charts-grid">
              <WeeklyStepChart activity={dash.weeklyActivity || []} goal={dash.goals.dailySteps} />
              <WeeklyCalorieChart activity={dash.weeklyActivity || []} />
            </section>

            {/* Activity Distribution + Quick Log + Insights */}
            <section className="content-grid">
              <div className="left-column">
                <WorkoutBreakdown types={dash.workoutTypes || []} />

                <div className="panel">
                  <div className="panel-title">
                    <div>
                      <h3>Quick log</h3>
                      <p>Capture your activity as you go</p>
                    </div>
                    <span className="soft-badge">TODAY</span>
                  </div>
                  <form
                    className="quick-form"
                    onSubmit={e => {
                      e.preventDefault();
                      submit('/steps', { stepCount: Number(steps) }, 'Steps updated.');
                    }}
                  >
                    <div className="form-title">
                      <span className="form-icon lilac">↗</span>
                      <div>
                        <b>Daily steps</b>
                        <small>Update your step count</small>
                      </div>
                    </div>
                    <div className="inline-form">
                      <input
                        type="number"
                        min="0"
                        max="200000"
                        value={steps}
                        onChange={e => setSteps(e.target.value)}
                        required
                      />
                      <button className="secondary">Save steps</button>
                    </div>
                  </form>

                  <form
                    className="quick-form"
                    onSubmit={e => {
                      e.preventDefault();
                      submit(
                        '/workouts',
                        {
                          ...workout,
                          durationMinutes: Number(workout.durationMinutes),
                          caloriesBurned: Number(workout.caloriesBurned)
                        },
                        'Workout logged successfully.'
                      );
                    }}
                  >
                    <div className="form-title">
                      <span className="form-icon mint">↗</span>
                      <div>
                        <b>Log a workout</b>
                        <small>Record a movement session</small>
                      </div>
                    </div>
                    <div className="form-grid">
                      <label className="field">
                        <span>Activity</span>
                        <select
                          value={workout.workoutType}
                          onChange={e => update(setWorkout, 'workoutType', e.target.value)}
                        >
                          {['Walking', 'Running', 'Cycling', 'Strength training', 'Yoga', 'Swimming', 'Other'].map(x => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </label>
                      <Field
                        label="Minutes"
                        type="number"
                        min="1"
                        value={workout.durationMinutes}
                        onChange={e => update(setWorkout, 'durationMinutes', e.target.value)}
                        required
                      />
                      <Field
                        label="Calories burned"
                        type="number"
                        min="0"
                        value={workout.caloriesBurned}
                        onChange={e => update(setWorkout, 'caloriesBurned', e.target.value)}
                        required
                      />
                    </div>
                    <button className="secondary">+ Add workout</button>
                  </form>
                </div>
              </div>

              <div className="right-column">
                <div className="panel insights">
                  <div className="panel-title">
                    <div>
                      <h3>Your insights</h3>
                      <p>Guidance based on your activity</p>
                    </div>
                    <span className="stat-icon peach">✧</span>
                  </div>
                  {dash.tips.map((tip, i) => (
                    <div className="tip" key={tip}>
                      <span>{i === 0 ? '✦' : i === 1 ? '◌' : '↗'}</span>
                      <p>{tip}</p>
                    </div>
                  ))}
                  <div className="premium-card">
                    <div className="premium-star">✦</div>
                    <div>
                      <b>Make progress your own</b>
                      <p>Premium unlocks custom goals and extended weekly trends.</p>
                      <button onClick={upgrade}>Explore Premium ↗</button>
                    </div>
                  </div>
                </div>

                <div className="panel recent">
                  <div className="panel-title">
                    <div>
                      <h3>Recent activity</h3>
                      <p>Your latest recorded sessions</p>
                    </div>
                    <button className="text-button" onClick={() => setTab('workouts')}>
                      View journal ↗
                    </button>
                  </div>
                  {dash.recentWorkouts.length === 0 ? (
                    <div className="empty">No workouts logged yet. Add your first session above.</div>
                  ) : (
                    dash.recentWorkouts.map(w => (
                      <div className="activity-row" key={w.id}>
                        <span className="activity-icon">↗</span>
                        <div className="activity-main">
                          <b>{w.workout_type}</b>
                          <small>{new Date(w.logged_at).toLocaleString()}</small>
                        </div>
                        <span>{w.duration_minutes} min</span>
                        <strong>{w.calories_burned} kcal</strong>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {tab === 'workouts' && (
          <section className="panel">
            <div className="panel-title">
              <div>
                <h3>Workout journal</h3>
                <p>Recent sessions you've recorded</p>
              </div>
            </div>
            <form
              className="form-grid roomy"
              onSubmit={e => {
                e.preventDefault();
                submit(
                  '/workouts',
                  {
                    ...workout,
                    durationMinutes: Number(workout.durationMinutes),
                    caloriesBurned: Number(workout.caloriesBurned)
                  },
                  'Workout logged.'
                );
              }}
            >
              <label className="field">
                <span>Activity</span>
                <select
                  value={workout.workoutType}
                  onChange={e => update(setWorkout, 'workoutType', e.target.value)}
                >
                  {['Walking', 'Running', 'Cycling', 'Strength training', 'Yoga', 'Swimming', 'Other'].map(x => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <Field
                label="Duration (minutes)"
                type="number"
                min="1"
                value={workout.durationMinutes}
                onChange={e => update(setWorkout, 'durationMinutes', e.target.value)}
              />
              <Field
                label="Calories burned"
                type="number"
                min="0"
                value={workout.caloriesBurned}
                onChange={e => update(setWorkout, 'caloriesBurned', e.target.value)}
              />
              <button className="primary">Add workout</button>
            </form>
            {dash.recentWorkouts.map(w => (
              <div className="activity-row" key={w.id}>
                <span className="activity-icon">↗</span>
                <div className="activity-main">
                  <b>{w.workout_type}</b>
                  <small>{new Date(w.logged_at).toLocaleString()}</small>
                </div>
                <span>{w.duration_minutes} min</span>
                <strong>{w.calories_burned} kcal</strong>
              </div>
            ))}
          </section>
        )}

        {tab === 'nutrition' && (
          <section className="panel">
            <div className="panel-title">
              <div>
                <h3>Nutrition journal</h3>
                <p>Keep an eye on your daily intake</p>
              </div>
            </div>
            <form
              className="form-grid roomy"
              onSubmit={e => {
                e.preventDefault();
                submit('/meals', { ...meal, calories: Number(meal.calories) }, 'Meal added to your journal.');
                setMeal(m => ({ ...m, mealName: '' }));
              }}
            >
              <Field
                label="Meal or food"
                value={meal.mealName}
                onChange={e => update(setMeal, 'mealName', e.target.value)}
                placeholder="e.g. Oats and berries"
                required
              />
              <Field
                label="Calories"
                type="number"
                min="0"
                value={meal.calories}
                onChange={e => update(setMeal, 'calories', e.target.value)}
                required
              />
              <label className="field">
                <span>Meal type</span>
                <select value={meal.mealType} onChange={e => update(setMeal, 'mealType', e.target.value)}>
                  {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(x => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <button className="primary">+ Log meal</button>
            </form>
            <div className="nutrition-summary">
              <span>Logged today</span>
              <strong>{dash.summary.calories.toLocaleString()} <small>kcal</small></strong>
              <span>Target: {dash.goals.dailyCalories.toLocaleString()} kcal</span>
            </div>
            {dash.recentMeals.length === 0 ? (
              <div className="empty">No meals logged yet.</div>
            ) : (
              dash.recentMeals.map(m => (
                <div className="activity-row" key={m.id}>
                  <span className="activity-icon food">◉</span>
                  <div className="activity-main">
                    <b>{m.meal_name}</b>
                    <small>{m.meal_type} · {new Date(m.logged_at).toLocaleString()}</small>
                  </div>
                  <strong>{m.calories} kcal</strong>
                </div>
              ))
            )}
          </section>
        )}

        {tab === 'goals' && (
          <section className="panel goal-panel">
            <div className="panel-title">
              <div>
                <h3>Personal goals</h3>
                <p>Choose targets that feel realistic for you</p>
              </div>
            </div>
            <form
              className="goal-form"
              onSubmit={e => {
                e.preventDefault();
                submit(
                  '/goals',
                  { dailySteps: Number(goals.dailySteps), dailyCalories: Number(goals.dailyCalories) },
                  'Your goals have been updated.'
                );
              }}
            >
              <Field
                label="Daily step target"
                type="number"
                min="500"
                max="100000"
                value={goals.dailySteps}
                onChange={e => update(setGoals, 'dailySteps', e.target.value)}
                required
              />
              <Field
                label="Daily calorie target (kcal)"
                type="number"
                min="500"
                max="10000"
                value={goals.dailyCalories}
                onChange={e => update(setGoals, 'dailyCalories', e.target.value)}
                required
              />
              <button className="primary">Save goals</button>
            </form>
            <div className="goal-note">
              <span>✧</span>
              <p>
                Consistency matters more than perfection. These targets are customizable tracking preferences, not medical recommendations.
              </p>
            </div>
          </section>
        )}

        <footer>
          FitTrack · Built for better habits, one day at a time <span>Wellness insights are informational only.</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
