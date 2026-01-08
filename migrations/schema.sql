-- Tabel Pengguna (Users)
-- Menyimpan data profil user Telegram
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, -- ID Telegram User
  username TEXT,          -- Username Telegram
  first_name TEXT,        -- Nama Depan
  language TEXT DEFAULT 'id', -- Bahasa pilihan ('id' atau 'en')
  timezone TEXT DEFAULT 'Asia/Jakarta', -- Zona waktu
  email TEXT,             -- Email Canva yang didaftarkan
  status TEXT DEFAULT 'active', -- Status Akun: 'pending_invite', 'active', 'kicked'
  role TEXT DEFAULT 'user',    -- Role: 'user', 'admin'
  selected_product_id INTEGER DEFAULT 1, -- ID Produk yang dipilih
  referral_code TEXT UNIQUE,   -- Kode Referral Unik (Misal: REF12345)
  referred_by INTEGER,         -- ID User yang mengundang
  referral_points INTEGER DEFAULT 0, -- Poin Referral (Saldo Invite)
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Produk (Products)
-- Menyimpan daftar paket durasi dan harganya
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,         -- Nama Produk (misal: "1 Bulan")
  duration_days INTEGER NOT NULL, -- Durasi dalam hari (30, 90, 365)
  price INTEGER NOT NULL,     -- Harga dalam Rupiah
  is_active BOOLEAN DEFAULT 1 -- 1 = Aktif/Bisa dibeli, 0 = Nonaktif
);

-- Tabel Langganan (Subscriptions)
-- Menyimpan status langganan user yang aktif atau expired
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,        -- UUID Unik untuk langganan
  user_id INTEGER NOT NULL,   -- Link ke users.id
  product_id INTEGER NOT NULL,-- Link ke products.id
  start_date DATETIME DEFAULT CURRENT_TIMESTAMP, -- Waktu mulai
  end_date DATETIME NOT NULL, -- Waktu kedaluwarsa
  status TEXT DEFAULT 'active', -- 'active', 'expired', 'kicked'
  canva_team_id TEXT,         -- ID Team Canva tempat user diundang
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

-- Tabel Transaksi (Transactions)
-- Mencatat riwayat pembayaran
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,        -- Kode Transaksi Unik
  user_id INTEGER NOT NULL,   -- Link ke users.id
  amount INTEGER NOT NULL,    -- Jumlah yang dibayar
  status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Tabel Pengaturan (Settings)
-- Menyimpan konfigurasi dinamis (Cookie Canva, Channel ID, dll)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, -- Nama kunci (misal: canva_cookie)
  value TEXT            -- Nilai konfigurasi
);

-- Data Awal (Seed Data) untuk Produk
INSERT OR IGNORE INTO products (name, duration_days, price) VALUES 
('1 Bulan', 30, 15000),
('3 Bulan', 90, 40000),
('6 Bulan', 180, 75000),
('1 Tahun', 365, 120000),
('Selamanya (Lifetime)', 36500, 250000);
