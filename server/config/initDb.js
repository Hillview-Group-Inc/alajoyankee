/* ============================================
   server/config/initDb.js
   Run once: node server/config/initDb.js
   Creates / migrates all required tables in SQL Server.
   Idempotent — safe to re-run.
   ============================================ */

"use strict";

require("dotenv").config();
const { getPool } = require("./db");

const SCHEMA = `
-- ══════════════════════════════════════════
-- Users (existing — additive migrations only)
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
CREATE TABLE Users (
  UserID       INT            IDENTITY(1,1) PRIMARY KEY,
  FirstName    NVARCHAR(100)  NOT NULL,
  LastName     NVARCHAR(100)  NOT NULL,
  Email        NVARCHAR(255)  NOT NULL,
  PasswordHash NVARCHAR(255)  NOT NULL,
  Phone        NVARCHAR(50)   NULL,
  Role         NVARCHAR(50)   NOT NULL DEFAULT 'member',
  IsActive     BIT            NOT NULL DEFAULT 1,
  LastLoginAt  DATETIME2      NULL,
  CreatedAt    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_Users_Email UNIQUE (Email)
);

-- Migration: add Phone column if upgrading an older Users table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'Phone' AND Object_ID = Object_ID(N'Users'))
  ALTER TABLE Users ADD Phone NVARCHAR(50) NULL;

-- Migration: add LastLoginAt column
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'LastLoginAt' AND Object_ID = Object_ID(N'Users'))
  ALTER TABLE Users ADD LastLoginAt DATETIME2 NULL;

-- ══════════════════════════════════════════
-- ContactMessages
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ContactMessages' AND xtype='U')
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
-- RefreshTokens
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RefreshTokens' AND xtype='U')
CREATE TABLE RefreshTokens (
  TokenID   INT            IDENTITY(1,1) PRIMARY KEY,
  UserID    INT            NOT NULL,
  Token     NVARCHAR(512)  NOT NULL,
  ExpiresAt DATETIME2      NOT NULL,
  CreatedAt DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_RefreshTokens_Users FOREIGN KEY (UserID) REFERENCES Users(UserID) ON DELETE CASCADE
);

-- ══════════════════════════════════════════
-- PoolSize (lookup)
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PoolSize' AND xtype='U')
CREATE TABLE PoolSize (
  PoolSizeID    INT            IDENTITY(1,1) PRIMARY KEY,
  PoolSizeName  NVARCHAR(100)  NOT NULL,
  PoolSizeValue INT            NOT NULL,
  IsActive      BIT            NOT NULL DEFAULT 1,
  CreatedAt     DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt     DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_PoolSize_Value UNIQUE (PoolSizeValue)
);

-- ══════════════════════════════════════════
-- RotationSchedule (lookup)
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RotationSchedule' AND xtype='U')
CREATE TABLE RotationSchedule (
  RotationScheduleID   INT            IDENTITY(1,1) PRIMARY KEY,
  RotationScheduleName NVARCHAR(100)  NOT NULL,
  ValueInDays          INT            NOT NULL,
  IsActive             BIT            NOT NULL DEFAULT 1,
  CreatedAt            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_RotationSchedule_Days UNIQUE (ValueInDays)
);

-- ══════════════════════════════════════════
-- ContributionAmount (lookup)
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ContributionAmount' AND xtype='U')
CREATE TABLE ContributionAmount (
  ContributionAmountID INT            IDENTITY(1,1) PRIMARY KEY,
  Amount               DECIMAL(18,2)  NOT NULL,
  IsActive             BIT            NOT NULL DEFAULT 1,
  CreatedAt            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_ContributionAmount_Value UNIQUE (Amount)
);

-- ══════════════════════════════════════════
-- ContributionPool
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ContributionPool' AND xtype='U')
CREATE TABLE ContributionPool (
  PoolID               INT           IDENTITY(1,1) PRIMARY KEY,
  PoolSizeID           INT           NOT NULL,
  RotationScheduleID   INT           NOT NULL,
  ContributionAmountID INT           NOT NULL,
  Status               NVARCHAR(20)  NOT NULL DEFAULT 'open',
  OpenDate             DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  FilledDate           DATETIME2     NULL,
  CreatedAt            DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt            DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_Pool_PoolSize           FOREIGN KEY (PoolSizeID)           REFERENCES PoolSize(PoolSizeID),
  CONSTRAINT FK_Pool_RotationSchedule   FOREIGN KEY (RotationScheduleID)   REFERENCES RotationSchedule(RotationScheduleID),
  CONSTRAINT FK_Pool_ContributionAmount FOREIGN KEY (ContributionAmountID) REFERENCES ContributionAmount(ContributionAmountID),
  CONSTRAINT CK_Pool_Status CHECK (Status IN ('open','filled','completed'))
);

-- ══════════════════════════════════════════
-- ContributionPoolEnrollment
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ContributionPoolEnrollment' AND xtype='U')
CREATE TABLE ContributionPoolEnrollment (
  ContributionPoolEnrollmentID INT IDENTITY(1,1) PRIMARY KEY,
  PoolID    INT       NOT NULL,
  UserID    INT       NOT NULL,
  Rank      INT       NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_Enrollment_Pool FOREIGN KEY (PoolID) REFERENCES ContributionPool(PoolID),
  CONSTRAINT FK_Enrollment_User FOREIGN KEY (UserID) REFERENCES Users(UserID),
  CONSTRAINT UQ_Enrollment_PoolUser UNIQUE (PoolID, UserID),
  CONSTRAINT UQ_Enrollment_PoolRank UNIQUE (PoolID, Rank)
);

-- ══════════════════════════════════════════
-- Rotation
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Rotation' AND xtype='U')
CREATE TABLE Rotation (
  RotationID           INT            IDENTITY(1,1) PRIMARY KEY,
  RotationName         NVARCHAR(150)  NOT NULL,
  PoolID               INT            NOT NULL,
  Status               NVARCHAR(20)   NOT NULL DEFAULT 'started',
  RotationStartDate    DATE           NOT NULL,
  LastContributionDate DATE           NOT NULL,
  RotationEndDate      DATE           NOT NULL,
  CreatedAt            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_Rotation_Pool FOREIGN KEY (PoolID) REFERENCES ContributionPool(PoolID),
  CONSTRAINT CK_Rotation_Status CHECK (Status IN ('started','in-progress','completed')),
  CONSTRAINT UQ_Rotation_Pool UNIQUE (PoolID)
);

-- ══════════════════════════════════════════
-- RotationDetail — one row per "collection event" (rank → recipient)
-- MemberCollectionDate is the date the rank-K member collects the pot.
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RotationDetail' AND xtype='U')
CREATE TABLE RotationDetail (
  RotationDetailID     INT            IDENTITY(1,1) PRIMARY KEY,
  RotationID           INT            NOT NULL,
  PoolID               INT            NOT NULL,
  UserID               INT            NOT NULL,  -- the recipient (rank-K member who collects)
  Rank                 INT            NOT NULL,
  ContributionDue      DECIMAL(18,2)  NOT NULL,
  MemberCollectionDate DATE           NOT NULL,
  CreatedAt            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_RotationDetail_Rotation FOREIGN KEY (RotationID) REFERENCES Rotation(RotationID),
  CONSTRAINT FK_RotationDetail_Pool     FOREIGN KEY (PoolID)     REFERENCES ContributionPool(PoolID),
  CONSTRAINT FK_RotationDetail_User     FOREIGN KEY (UserID)     REFERENCES Users(UserID),
  CONSTRAINT UQ_RotationDetail UNIQUE (RotationID, UserID)
);

-- Migration: rename ContributionDueDate → MemberCollectionDate on existing installs
IF EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'ContributionDueDate' AND Object_ID = Object_ID(N'RotationDetail'))
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'MemberCollectionDate' AND Object_ID = Object_ID(N'RotationDetail'))
   EXEC sp_rename 'RotationDetail.ContributionDueDate', 'MemberCollectionDate', 'COLUMN';

-- ══════════════════════════════════════════
-- RotationDetailContribution — one row per (collection event × member)
-- N×N rows per rotation: each member contributes on every MemberCollectionDate.
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RotationDetailContribution' AND xtype='U')
CREATE TABLE RotationDetailContribution (
  RotationDetailContributionID INT            IDENTITY(1,1) PRIMARY KEY,
  RotationDetailID             INT            NOT NULL,
  RotationID                   INT            NOT NULL,
  PoolID                       INT            NOT NULL,
  UserID                       INT            NOT NULL,  -- the contributor
  Rank                         INT            NOT NULL,  -- the contributor's rank
  ContributionDue              DECIMAL(18,2)  NOT NULL,
  ContributionDueDate          DATE           NOT NULL,  -- equals parent RotationDetail.MemberCollectionDate
  CreatedAt                    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt                    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_RDC_RotationDetail FOREIGN KEY (RotationDetailID) REFERENCES RotationDetail(RotationDetailID),
  CONSTRAINT FK_RDC_Rotation       FOREIGN KEY (RotationID)       REFERENCES Rotation(RotationID),
  CONSTRAINT FK_RDC_Pool           FOREIGN KEY (PoolID)           REFERENCES ContributionPool(PoolID),
  CONSTRAINT FK_RDC_User           FOREIGN KEY (UserID)           REFERENCES Users(UserID),
  CONSTRAINT UQ_RDC_DetailUser     UNIQUE (RotationDetailID, UserID)
);

-- ══════════════════════════════════════════
-- Notifications (table created now; service wired in Phase 5)
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')
CREATE TABLE Notifications (
  NotificationID INT            IDENTITY(1,1) PRIMARY KEY,
  UserID         INT            NOT NULL,
  Type           NVARCHAR(20)   NOT NULL,
  Title          NVARCHAR(200)  NOT NULL,
  Message        NVARCHAR(MAX)  NOT NULL,
  IsSent         BIT            NOT NULL DEFAULT 0,
  SentAt         DATETIME2      NULL,
  CreatedAt      DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_Notifications_User FOREIGN KEY (UserID) REFERENCES Users(UserID),
  CONSTRAINT CK_Notifications_Type CHECK (Type IN ('SMS','Email'))
);

-- ══════════════════════════════════════════
-- Payments — UserID is the payer; MemberToBePaid is the recipient (rank-K member)
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Payments' AND xtype='U')
CREATE TABLE Payments (
  PaymentID      INT            IDENTITY(1,1) PRIMARY KEY,
  RotationID     INT            NOT NULL,
  UserID         INT            NOT NULL,  -- the payer
  MemberToBePaid INT            NULL,      -- the recipient (UserID of current ranked member)
  Amount         DECIMAL(18,2)  NOT NULL,
  PaymentDate    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  Status         NVARCHAR(20)   NOT NULL DEFAULT 'Pending',
  VerifiedBy     INT            NULL,
  CreatedAt      DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_Payments_Rotation  FOREIGN KEY (RotationID)     REFERENCES Rotation(RotationID),
  CONSTRAINT FK_Payments_User      FOREIGN KEY (UserID)         REFERENCES Users(UserID),
  CONSTRAINT FK_Payments_Recipient FOREIGN KEY (MemberToBePaid) REFERENCES Users(UserID),
  CONSTRAINT FK_Payments_Verifier  FOREIGN KEY (VerifiedBy)     REFERENCES Users(UserID),
  CONSTRAINT CK_Payments_Status CHECK (Status IN ('Pending','Verified','Failed'))
);

-- Migration: add MemberToBePaid + FK on existing installs
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'MemberToBePaid' AND Object_ID = Object_ID(N'Payments'))
  ALTER TABLE Payments ADD MemberToBePaid INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Payments_Recipient')
  ALTER TABLE Payments ADD CONSTRAINT FK_Payments_Recipient FOREIGN KEY (MemberToBePaid) REFERENCES Users(UserID);

-- ══════════════════════════════════════════
-- PasswordResetTokens (table created now; routes wired in Phase 4)
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PasswordResetTokens' AND xtype='U')
CREATE TABLE PasswordResetTokens (
  TokenID   INT            IDENTITY(1,1) PRIMARY KEY,
  UserID    INT            NOT NULL,
  Token     NVARCHAR(255)  NOT NULL,
  ExpiresAt DATETIME2      NOT NULL,
  Used      BIT            NOT NULL DEFAULT 0,
  CreatedAt DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT FK_PRT_Users FOREIGN KEY (UserID) REFERENCES Users(UserID) ON DELETE CASCADE,
  CONSTRAINT UQ_PRT_Token UNIQUE (Token)
);

-- ══════════════════════════════════════════
-- Indexes
-- ══════════════════════════════════════════
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Users_Email' AND object_id = OBJECT_ID('Users'))
  CREATE INDEX IX_Users_Email ON Users(Email);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_ContactMessages_SubmittedAt' AND object_id = OBJECT_ID('ContactMessages'))
  CREATE INDEX IX_ContactMessages_SubmittedAt ON ContactMessages(SubmittedAt DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Pool_Lookup' AND object_id = OBJECT_ID('ContributionPool'))
  CREATE INDEX IX_Pool_Lookup ON ContributionPool(PoolSizeID, RotationScheduleID, ContributionAmountID, Status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Enrollment_User' AND object_id = OBJECT_ID('ContributionPoolEnrollment'))
  CREATE INDEX IX_Enrollment_User ON ContributionPoolEnrollment(UserID);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_RotationDetail_User' AND object_id = OBJECT_ID('RotationDetail'))
  CREATE INDEX IX_RotationDetail_User ON RotationDetail(UserID, MemberCollectionDate);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_RDC_UserDate' AND object_id = OBJECT_ID('RotationDetailContribution'))
  CREATE INDEX IX_RDC_UserDate ON RotationDetailContribution(UserID, ContributionDueDate);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_RDC_Rotation' AND object_id = OBJECT_ID('RotationDetailContribution'))
  CREATE INDEX IX_RDC_Rotation ON RotationDetailContribution(RotationID);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Payments_Rotation' AND object_id = OBJECT_ID('Payments'))
  CREATE INDEX IX_Payments_Rotation ON Payments(RotationID, Status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Payments_Recipient' AND object_id = OBJECT_ID('Payments'))
  CREATE INDEX IX_Payments_Recipient ON Payments(MemberToBePaid);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_PRT_UserID' AND object_id = OBJECT_ID('PasswordResetTokens'))
  CREATE INDEX IX_PRT_UserID ON PasswordResetTokens(UserID);
`;

// Idempotent seed data — only inserts if missing
const SEED = `
IF NOT EXISTS (SELECT 1 FROM PoolSize WHERE PoolSizeValue = 2)
  INSERT INTO PoolSize (PoolSizeName, PoolSizeValue) VALUES (N'Mini Circle (2 members)', 2);

IF NOT EXISTS (SELECT 1 FROM PoolSize WHERE PoolSizeValue = 3)
  INSERT INTO PoolSize (PoolSizeName, PoolSizeValue) VALUES (N'Midi Circle (3 members)', 3);
   
IF NOT EXISTS (SELECT 1 FROM PoolSize WHERE PoolSizeValue = 5)
  INSERT INTO PoolSize (PoolSizeName, PoolSizeValue) VALUES (N'Small Circle (5 members)', 5);

IF NOT EXISTS (SELECT 1 FROM PoolSize WHERE PoolSizeValue = 10)
  INSERT INTO PoolSize (PoolSizeName, PoolSizeValue) VALUES (N'Standard Circle (10 members)', 10);

IF NOT EXISTS (SELECT 1 FROM PoolSize WHERE PoolSizeValue = 15)
  INSERT INTO PoolSize (PoolSizeName, PoolSizeValue) VALUES (N'Large Circle (15 members)', 15);

IF NOT EXISTS (SELECT 1 FROM PoolSize WHERE PoolSizeValue = 20)
  INSERT INTO PoolSize (PoolSizeName, PoolSizeValue) VALUES (N'Community Circle (20 members)', 20);

IF NOT EXISTS (SELECT 1 FROM RotationSchedule WHERE ValueInDays = 7)
  INSERT INTO RotationSchedule (RotationScheduleName, ValueInDays) VALUES (N'Weekly', 7);

IF NOT EXISTS (SELECT 1 FROM RotationSchedule WHERE ValueInDays = 14)
  INSERT INTO RotationSchedule (RotationScheduleName, ValueInDays) VALUES (N'Bi-Weekly', 14);

IF NOT EXISTS (SELECT 1 FROM RotationSchedule WHERE ValueInDays = 28)
  INSERT INTO RotationSchedule (RotationScheduleName, ValueInDays) VALUES (N'Monthly (28 days)', 28);

IF NOT EXISTS (SELECT 1 FROM ContributionAmount WHERE Amount = 100)
  INSERT INTO ContributionAmount (Amount) VALUES (100);

IF NOT EXISTS (SELECT 1 FROM ContributionAmount WHERE Amount = 250)
  INSERT INTO ContributionAmount (Amount) VALUES (250);

IF NOT EXISTS (SELECT 1 FROM ContributionAmount WHERE Amount = 500)
  INSERT INTO ContributionAmount (Amount) VALUES (500);

IF NOT EXISTS (SELECT 1 FROM ContributionAmount WHERE Amount = 1000)
  INSERT INTO ContributionAmount (Amount) VALUES (1000);
`;

async function initDb() {
  console.log("🔧 Initializing database schema...");
  try {
    const pool = await getPool();

    const allSql = SCHEMA + "\n" + SEED;
    const statements = allSql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10 && !s.startsWith("--"));

    for (const stmt of statements) {
      await pool.request().query(stmt);
    }

    console.log(`✅ Schema initialized — ran ${statements.length} statements.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Schema initialization failed:", err.message);
    process.exit(1);
  }
}

initDb();
