CREATE TABLE IF NOT EXISTS wu_obs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  obs_date TEXT,
  obs_time TEXT,
  slot TEXT,
  temp_c REAL,
  dewpoint_c REAL,
  peak_since_7am_c REAL,
  humidity REAL,
  wind_kph REAL,
  condition TEXT,
  source TEXT,
  fetched_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wu_unique ON wu_obs(obs_date, obs_time, temp_c);
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
  rain_pct REAL,
  phrase TEXT,
  raw_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forecast_unique ON forecast(forecast_date, raw_hash);
CREATE INDEX IF NOT EXISTS idx_forecast_date ON forecast(forecast_date);