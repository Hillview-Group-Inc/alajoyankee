/* ============================================
   server/config/initDb.js
   Run once: node server/config/initDb.js
   Creates all required tables in SQL Server
   ============================================ */

'use strict';

require('dotenv').config();
const { getPool, sql } = require('./db');

const SCHEMA = `
-- ══════════════════════════════════════════
-- Users Table
-- ══════════════════════════════════════════
IF NOT EXISTS (
  SELECT * FROM sysobjects WHERE name='Users' AND xtype='U'
)
CREATE TABLE Users (
  UserID       INT            IDENTITY(1,1) PRIMARY KEY,
  FirstName    NVARCHAR(100)  NOT NULL,
  LastName     NVARCHAR(100)  NOT NULL,
  Email        NVARCHAR(255)  NOT NULL,
  PasswordHash NVARCHAR(255)  NOT NULL,
  Role         NVARCHAR(50)   NOT NULL DEFAULT 'member',
  IsActive     BIT            NOT NULL DEFAULT 1,
  CreatedAt    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_Users_Email UNIQUE (Email)
);

-- ══════════════════════════════════════════
-- ContactMessages Table
-- ══════════════════════════════════════════
IF NOT EXISTS (
  SELECT * FROM sysobjects WHERE name='ContactMessages' AND xtype='U'
)
CREATE TABLE ContactMessages (
  MessageID   INT            IDENTITY(1,1) PRIMARY KEY,
  Name        NVARCHAR(200)  NOT NULL,
  Email       NVARCHAR(255)  NOT NULL,
  Phone       NVARCHAR(50)   NULL,
  Message     NVARCHAR(MAX)  NOT NULL,
  IsRead      BIT            NOT NULL DEFAULT 0,
  SubmittedAt DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);

-- ══════════════════════════════════════════
-- RefreshTokens Table (optional)
-- ══════════════════════════════════════════
IF NOT EXISTS (
  SELECT * FROM sysobjects WHERE name='RefreshTokens' AND xtype='U'
)
CREATE TABLE RefreshTokens (
  TokenID   INT            IDENTITY(1,1) PRIMARY KEY,
  UserID    INT            NOT NULL,
  Token     NVARCHAR(512)  NOT NULL,
  ExpiresAt DATETIME2      NOT NULL,
  CreatedAt DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_RefreshTokens_Users FOREIGN KEY (UserID) REFERENCES Users(UserID) ON DELETE CASCADE
);

-- Indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Users_Email' AND object_id = OBJECT_ID('Users'))
  CREATE INDEX IX_Users_Email ON Users(Email);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_ContactMessages_SubmittedAt' AND object_id = OBJECT_ID('ContactMessages'))
  CREATE INDEX IX_ContactMessages_SubmittedAt ON ContactMessages(SubmittedAt DESC);
`;

async function initDb() {
  console.log('🔧 Initializing database schema...');
  try {
    const pool = await getPool();
    // Execute each statement individually (SQL Server doesn't allow GO in mssql)
    const statements = SCHEMA
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    for (const stmt of statements) {
      await pool.request().query(stmt);
    }
    console.log('✅ Database schema initialized successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Schema initialization failed:', err.message);
    process.exit(1);
  }
}

initDb();
