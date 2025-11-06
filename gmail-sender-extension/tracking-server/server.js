// 트래킹 서버 (Express + SQLite)
// 픽셀 트래킹 + 링크 트래킹

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 허용
app.use(cors());
app.use(express.json());

// SQLite DB 초기화 (Railway Volume 지원)
const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/tracking.db`
  : './tracking.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('DB 연결 오류:', err);
  } else {
    console.log(`✅ SQLite DB 연결 성공: ${DB_PATH}`);
    initDB();
  }
});

// 테이블 생성
function initDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS email_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      tracking_type TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT
    )
  `, (err) => {
    if (err) {
      console.error('테이블 생성 오류:', err);
    } else {
      console.log('✅ email_tracking 테이블 준비 완료');
    }
  });
}

// 1x1 투명 픽셀 이미지 (Base64)
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// 트래킹 픽셀 엔드포인트
app.get('/track.png', (req, res) => {
  const { id, email } = req.query;

  if (!id || !email) {
    console.warn('⚠️ 트래킹 픽셀: 파라미터 누락', { id, email });
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(TRACKING_PIXEL);
  }

  // DB에 기록
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  db.run(
    `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, ip_address, user_agent)
     VALUES (?, ?, 'open', ?, ?)`,
    [id, email, ip, userAgent],
    (err) => {
      if (err) {
        console.error('❌ 트래킹 픽셀 기록 실패:', err);
      } else {
        console.log(`📧 이메일 오픈 기록: ${email} (Campaign: ${id})`);
      }
    }
  );

  // 1x1 투명 PNG 이미지 반환
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(TRACKING_PIXEL);
});

// 링크 트래킹 + 리다이렉트
app.get('/redirect', (req, res) => {
  const { id, email, to } = req.query;

  if (!id || !email || !to) {
    console.warn('⚠️ 링크 트래킹: 파라미터 누락', { id, email, to });
    return res.status(400).send('Invalid tracking link');
  }

  // DB에 클릭 기록
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  db.run(
    `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, ip_address, user_agent)
     VALUES (?, ?, 'click', ?, ?)`,
    [id, email, ip, userAgent],
    (err) => {
      if (err) {
        console.error('❌ 링크 클릭 기록 실패:', err);
      } else {
        console.log(`🔗 링크 클릭 기록: ${email} → ${to}`);
      }
    }
  );

  // 실제 URL로 리다이렉트
  res.redirect(decodeURIComponent(to));
});

// MailerSend 웹훅 엔드포인트
app.post('/api/webhook/mailersend', (req, res) => {
  console.log('📨 MailerSend 웹훅 수신:', JSON.stringify(req.body, null, 2));

  const event = req.body;

  // 이벤트 타입별 처리
  if (event.type === 'activity.hard_bounced') {
    const email = event.data?.recipient;
    const bounceCode = event.data?.meta?.bounce_code;
    const bounceReason = event.data?.meta?.bounce_reason;
    console.log(`❌ Hard Bounce: ${email} (Code: ${bounceCode}, Reason: ${bounceReason})`);

    // DB에 기록
    db.run(
      `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, ip_address, user_agent)
       VALUES (?, ?, 'hard_bounce', ?, ?)`,
      ['mailersend', email, 'webhook', `Code:${bounceCode}`],
      (err) => {
        if (err) {
          console.error('Hard bounce 기록 실패:', err);
        } else {
          console.log(`✅ Hard bounce 기록 완료: ${email}`);
        }
      }
    );
  } else if (event.type === 'activity.soft_bounced') {
    const email = event.data?.recipient;
    const bounceCode = event.data?.meta?.bounce_code;
    console.log(`⚠️ Soft Bounce: ${email} (Code: ${bounceCode})`);
  }

  // 200 응답 (MailerSend가 재시도하지 않도록)
  res.status(200).json({ received: true });
});

// 미오픈 리스트 조회 API (Campaign ID 방식 - 레거시)
app.get('/api/unopened', (req, res) => {
  const { campaign_id } = req.query;

  if (!campaign_id) {
    return res.status(400).json({ error: 'campaign_id required' });
  }

  // 캠페인의 모든 수신자 중 오픈/클릭 기록 없는 사람
  db.all(
    `SELECT DISTINCT recipient_email
     FROM email_tracking
     WHERE campaign_id = ?`,
    [campaign_id],
    (err, openedRows) => {
      if (err) {
        console.error('❌ 조회 오류:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      const openedEmails = openedRows.map(row => row.recipient_email);

      res.json({
        campaign_id,
        opened_count: openedEmails.length,
        opened_emails: openedEmails
      });
    }
  );
});

// ⭐ 날짜 범위 기반 미오픈 조회 API (신규)
app.get('/api/unopened-by-date', (req, res) => {
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date and end_date required (format: YYYY-MM-DD)' });
  }

  // 날짜 범위 내 오픈한 이메일 목록 조회
  db.all(
    `SELECT DISTINCT recipient_email
     FROM email_tracking
     WHERE tracking_type = 'open'
       AND DATE(timestamp) BETWEEN DATE(?) AND DATE(?)`,
    [start_date, end_date],
    (err, openedRows) => {
      if (err) {
        console.error('❌ 날짜 범위 조회 오류:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      const openedEmails = openedRows.map(row => row.recipient_email);

      res.json({
        start_date,
        end_date,
        opened_count: openedEmails.length,
        opened_emails: openedEmails
      });
    }
  );
});

// 전체 통계 조회
app.get('/api/stats/:campaign_id', (req, res) => {
  const { campaign_id } = req.params;

  db.all(
    `SELECT
       tracking_type,
       COUNT(*) as count,
       COUNT(DISTINCT recipient_email) as unique_count
     FROM email_tracking
     WHERE campaign_id = ?
     GROUP BY tracking_type`,
    [campaign_id],
    (err, rows) => {
      if (err) {
        console.error('❌ 통계 조회 오류:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      const stats = {
        campaign_id,
        opens: 0,
        unique_opens: 0,
        clicks: 0,
        unique_clicks: 0
      };

      rows.forEach(row => {
        if (row.tracking_type === 'open') {
          stats.opens = row.count;
          stats.unique_opens = row.unique_count;
        } else if (row.tracking_type === 'click') {
          stats.clicks = row.count;
          stats.unique_clicks = row.unique_count;
        }
      });

      res.json(stats);
    }
  );
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 트래킹 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📊 픽셀 트래킹: http://localhost:${PORT}/track.png?id=CAMPAIGN_ID&email=USER_EMAIL`);
  console.log(`🔗 링크 트래킹: http://localhost:${PORT}/redirect?id=CAMPAIGN_ID&email=USER_EMAIL&to=REAL_URL`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('DB 종료 오류:', err);
    } else {
      console.log('✅ DB 연결 종료');
    }
    process.exit(0);
  });
});
