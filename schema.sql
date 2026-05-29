CREATE TABLE IF NOT EXISTS wu_obs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  obs_date TEXT,
  obs_time TEXT,
  slot TEXT,
  temp_c REAL,
  temp_f REAL,
  dewpoint_c REAL,
  dewpoint_f REAL,
  peak_since_7am_c REAL,
  peak_since_7am_f REAL,
  humidity REAL,
  wind_kph REAL,
  condition TEXT,
  source TEXT,
  fetched_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wu_obs_date_time ON wu_obs(obs_date, obs_time);
CREATE INDEX IF NOT EXISTS idx_wu_date ON wu_obs(obs_date);

CREATE TABLE IF NOT EXISTS metar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  obs_date TEXT,
  valid_utc TEXT,
  valid_ist TEXT,
  slot TEXT,
  raw_metar TEXT UNIQUE,
  temp_c REAL,
  dewpoint_c REAL,
  wind_kt REAL,
  wind_dir TEXT,
  visibility TEXT,
  wx TEXT,
  nosig INTEGER,
  becmg INTEGER,
  tempo INTEGER,
  fetched_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_metar_date ON metar(obs_date);

CREATE TABLE IF NOT EXISTS forecast (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_date TEXT,
  fetched_at TEXT,
  today_c REAL,
  tmr_c REAL,
  d2_c REAL,
  d3_c REAL,
  d4_c REAL,
  today_f REAL,
  tmr_f REAL,
  d2_f REAL,
  d3_f REAL,
  d4_f REAL,
  rain_pct REAL,
  phrase TEXT,
  raw_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forecast_unique ON forecast(forecast_date, raw_hash);
CREATE INDEX IF NOT EXISTS idx_forecast_date ON forecast(forecast_date);

CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_date TEXT NOT NULL,
  target_date TEXT NOT NULL,
  horizon_days INTEGER NOT NULL,
  fetch_time_ist TEXT NOT NULL,
  forecast_issue_time_ist TEXT NOT NULL,
  source TEXT DEFAULT 'WU',
  high_c REAL,
  low_c REAL,
  high_f REAL,
  low_f REAL,
  hourly_json TEXT,
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_forecast_snapshots_target ON forecast_snapshots(target_date, horizon_days, forecast_issue_time_ist);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forecast_snapshots_issue_unique ON forecast_snapshots(target_date, horizon_days, forecast_issue_time_ist, source);
