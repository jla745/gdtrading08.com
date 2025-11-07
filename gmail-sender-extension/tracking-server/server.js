// 트래킹 서버 (Express + SQLite)
// 픽셀 트래킹 + 링크 트래킹

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 성능 최적화 설정
app.set('trust proxy', 1); // Railway 프록시 신뢰
app.set('x-powered-by', false); // 보안 헤더 제거

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
      user_agent TEXT,
      event_id TEXT,
      message_id TEXT,
      meta_data TEXT
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
// Health check 엔드포인트 (keep-alive용)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

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

  // ⭐ 이메일 주소 추출 (MailerSend payload 구조: data.email.recipient.email)
  const recipientEmail = event.data?.email?.recipient?.email ||
                         event.data?.recipient?.email ||
                         event.data?.recipient ||
                         'unknown';

  const eventId = event.data?.email?.id || event.id || '';
  const messageId = event.data?.email?.message?.id || '';
  const timestamp = event.created_at || new Date().toISOString();

  // 이벤트 타입별 처리
  if (event.type === 'activity.sent') {
    console.log(`📤 Sent: ${recipientEmail}`);
    db.run(
      `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, timestamp, ip_address, user_agent, event_id, message_id, meta_data)
       VALUES (?, ?, 'sent', ?, ?, ?, ?, ?, ?)`,
      ['mailersend', recipientEmail, timestamp, 'webhook', '', eventId, messageId, JSON.stringify(event.data)],
      (err) => {
        if (err) console.error('Sent 기록 실패:', err);
        else console.log(`✅ Sent 기록 완료: ${recipientEmail}`);
      }
    );

  } else if (event.type === 'activity.delivered') {
    console.log(`✅ Delivered: ${recipientEmail}`);
    db.run(
      `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, timestamp, ip_address, user_agent, event_id, message_id, meta_data)
       VALUES (?, ?, 'delivered', ?, ?, ?, ?, ?, ?)`,
      ['mailersend', recipientEmail, timestamp, 'webhook', '', eventId, messageId, JSON.stringify(event.data)],
      (err) => {
        if (err) console.error('Delivered 기록 실패:', err);
        else console.log(`✅ Delivered 기록 완료: ${recipientEmail}`);
      }
    );

  } else if (event.type === 'activity.opened') {
    const userAgent = event.data?.user_agent || '';
    const ipAddress = event.data?.ip || '';
    console.log(`📧 Opened: ${recipientEmail}`);
    db.run(
      `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, timestamp, ip_address, user_agent, event_id, message_id, meta_data)
       VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
      ['mailersend', recipientEmail, timestamp, ipAddress, userAgent, eventId, messageId, JSON.stringify(event.data)],
      (err) => {
        if (err) console.error('Opened 기록 실패:', err);
        else console.log(`✅ Opened 기록 완료: ${recipientEmail}`);
      }
    );

  } else if (event.type === 'activity.clicked') {
    const url = event.data?.url || '';
    const userAgent = event.data?.user_agent || '';
    const ipAddress = event.data?.ip || '';
    console.log(`🔗 Clicked: ${recipientEmail} → ${url}`);
    db.run(
      `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, timestamp, ip_address, user_agent, event_id, message_id, meta_data)
       VALUES (?, ?, 'click', ?, ?, ?, ?, ?, ?)`,
      ['mailersend', recipientEmail, timestamp, ipAddress, userAgent, eventId, messageId, JSON.stringify({...event.data, clicked_url: url})],
      (err) => {
        if (err) console.error('Clicked 기록 실패:', err);
        else console.log(`✅ Clicked 기록 완료: ${recipientEmail}`);
      }
    );

  } else if (event.type === 'activity.hard_bounced') {
    const bounceCode = event.data?.bounce_code || '';
    const bounceReason = event.data?.reason || event.data?.bounce_reason || '';
    console.log(`❌ Hard Bounce: ${recipientEmail} (Code: ${bounceCode}, Reason: ${bounceReason})`);
    db.run(
      `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, timestamp, ip_address, user_agent, event_id, message_id, meta_data)
       VALUES (?, ?, 'hard_bounce', ?, ?, ?, ?, ?, ?)`,
      ['mailersend', recipientEmail, timestamp, 'webhook', `Code:${bounceCode}`, eventId, messageId, JSON.stringify({...event.data, bounce_code: bounceCode, bounce_reason: bounceReason})],
      (err) => {
        if (err) console.error('Hard bounce 기록 실패:', err);
        else console.log(`✅ Hard bounce 기록 완료: ${recipientEmail}`);
      }
    );

  } else if (event.type === 'activity.soft_bounced') {
    const bounceCode = event.data?.bounce_code || '';
    const bounceReason = event.data?.reason || event.data?.bounce_reason || '';
    console.log(`⚠️ Soft Bounce: ${recipientEmail} (Code: ${bounceCode})`);
    db.run(
      `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, timestamp, ip_address, user_agent, event_id, message_id, meta_data)
       VALUES (?, ?, 'soft_bounce', ?, ?, ?, ?, ?, ?)`,
      ['mailersend', recipientEmail, timestamp, 'webhook', `Code:${bounceCode}`, eventId, messageId, JSON.stringify({...event.data, bounce_code: bounceCode, bounce_reason: bounceReason})],
      (err) => {
        if (err) console.error('Soft bounce 기록 실패:', err);
        else console.log(`✅ Soft bounce 기록 완료: ${recipientEmail}`);
      }
    );

  } else if (event.type === 'activity.spam') {
    console.log(`🚨 Spam Report: ${recipientEmail}`);
    db.run(
      `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, timestamp, ip_address, user_agent, event_id, message_id, meta_data)
       VALUES (?, ?, 'spam', ?, ?, ?, ?, ?, ?)`,
      ['mailersend', recipientEmail, timestamp, 'webhook', '', eventId, messageId, JSON.stringify(event.data)],
      (err) => {
        if (err) console.error('Spam 기록 실패:', err);
        else console.log(`✅ Spam 기록 완료: ${recipientEmail}`);
      }
    );

  } else if (event.type === 'activity.unsubscribed') {
    console.log(`🚫 Unsubscribed: ${recipientEmail}`);
    db.run(
      `INSERT INTO email_tracking (campaign_id, recipient_email, tracking_type, timestamp, ip_address, user_agent, event_id, message_id, meta_data)
       VALUES (?, ?, 'unsubscribed', ?, ?, ?, ?, ?, ?)`,
      ['mailersend', recipientEmail, timestamp, 'webhook', '', eventId, messageId, JSON.stringify(event.data)],
      (err) => {
        if (err) console.error('Unsubscribed 기록 실패:', err);
        else console.log(`✅ Unsubscribed 기록 완료: ${recipientEmail}`);
      }
    );

  } else {
    console.log(`ℹ️ 기타 이벤트: ${event.type} - ${recipientEmail}`);
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

// 전체 통계 조회 (Webhook 데이터 포함)
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
        sent: 0,
        delivered: 0,
        unique_delivered: 0,
        opens: 0,
        unique_opens: 0,
        clicks: 0,
        unique_clicks: 0,
        hard_bounces: 0,
        soft_bounces: 0,
        spam_reports: 0,
        unsubscribes: 0
      };

      rows.forEach(row => {
        if (row.tracking_type === 'sent') {
          stats.sent = row.count;
        } else if (row.tracking_type === 'delivered') {
          stats.delivered = row.count;
          stats.unique_delivered = row.unique_count;
        } else if (row.tracking_type === 'open') {
          stats.opens = row.count;
          stats.unique_opens = row.unique_count;
        } else if (row.tracking_type === 'click') {
          stats.clicks = row.count;
          stats.unique_clicks = row.unique_count;
        } else if (row.tracking_type === 'hard_bounce') {
          stats.hard_bounces = row.count;
        } else if (row.tracking_type === 'soft_bounce') {
          stats.soft_bounces = row.count;
        } else if (row.tracking_type === 'spam') {
          stats.spam_reports = row.count;
        } else if (row.tracking_type === 'unsubscribed') {
          stats.unsubscribes = row.count;
        }
      });

      res.json(stats);
    }
  );
});

// 정적 수신거부 HTML (미리 생성)
const UNSUBSCRIBE_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>수신거부</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;text-align:center;padding:50px 20px}h1{color:#dc3545}.btn{padding:12px 30px;font-size:16px;border:none;border-radius:6px;cursor:pointer;margin:5px}.btn-c{background:#dc3545;color:#fff}.btn-x{background:#6c757d;color:#fff}#r{margin-top:20px;padding:15px;border-radius:6px;display:none}.s{background:#d4edda;color:#155724}.e{background:#f8d7da;color:#721c24}</style></head><body><h1>🚫 수신거부</h1><p>더 이상 이메일을 받지 않으시겠습니까?</p><button class="btn btn-c" onclick="c()">✅ 확인</button><button class="btn btn-x" onclick="window.close()">❌ 취소</button><div id="r"></div><script>const u=new URLSearchParams(location.search);const e=u.get('email');async function c(){const r=document.getElementById('r');r.style.display='block';r.textContent='처리 중...';try{const res=await fetch('/api/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e})});const d=await res.json();r.className=d.success?'s':'e';r.textContent=d.success?'✅ 수신거부 완료':'❌ '+d.message;if(d.success)setTimeout(()=>{document.querySelector('.btn-c').style.display='none'},1000)}catch(err){r.className='e';r.textContent='❌ 오류'}}</script></body></html>`;

const ERROR_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>오류</title></head><body style="text-align:center;padding:50px;font-family:Arial"><h1>❌ 이메일 주소가 필요합니다</h1></body></html>`;

// ⭐ 수신거부 페이지 (GET) - GitHub Pages로 리다이렉트 (CDN 효과)
app.get('/unsubscribe', (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send(ERROR_HTML);
  }

  // Vercel로 즉시 리다이렉트 (정적 호스팅, CDN 캐시)
  // 실제 Vercel 배포 URL 사용
  const vercelUrl = process.env.UNSUBSCRIBE_URL || `https://gmail-tracking-server.vercel.app/unsubscribe.html?email=${encodeURIComponent(email)}`;

  res.redirect(301, vercelUrl); // 301 영구 리다이렉트로 브라우저 캐시 활용
});

// ⭐ 수신거부 처리 API (POST) - 최적화
app.post('/api/unsubscribe', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: '이메일이 필요합니다' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 즉시 성공 응답 (비동기로 DB 처리)
  res.json({ success: true, message: '수신거부 처리 중입니다.' });

  // Supabase에 비동기로 추가 (응답 후 처리)
  // 환경 변수에서 가져오기 (Railway에 설정 필요)
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gzybrgmclouskftiiglg.supabase.co';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_ANON_KEY) {
    console.error('⚠️ SUPABASE_ANON_KEY 환경 변수가 설정되지 않았습니다');
    return;
  }

  // 백그라운드에서 처리
  setImmediate(async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/unsubscribed`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'  // 최소 응답
        },
        body: JSON.stringify({
          email: normalizedEmail,
          created_at: new Date().toISOString()
        })
      });

      if (response.ok) {
        console.log(`✅ 수신거부 추가 성공: ${normalizedEmail}`);
      } else {
        console.log(`⚠️ 수신거부 처리 실패: ${normalizedEmail}`);
      }
    } catch (error) {
      console.error('❌ 백그라운드 수신거부 처리 오류:', error);
    }
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 트래킹 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📊 픽셀 트래킹: http://localhost:${PORT}/track.png?id=CAMPAIGN_ID&email=USER_EMAIL`);
  console.log(`🔗 링크 트래킹: http://localhost:${PORT}/redirect?id=CAMPAIGN_ID&email=USER_EMAIL&to=REAL_URL`);
  console.log(`🚫 수신거부: http://localhost:${PORT}/unsubscribe?email=USER_EMAIL`);
  console.log(`🔄 Keep-alive 활성화: 5분마다 자체 핑`);

  // Keep-alive: Railway가 sleep 모드로 가지 않도록 5분마다 자체 핑
  setInterval(() => {
    const serverUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/health`
      : `http://localhost:${PORT}/health`;

    fetch(serverUrl)
      .then(() => console.log(`✅ Keep-alive 핑: ${new Date().toISOString()}`))
      .catch(err => console.error('Keep-alive 실패:', err));
  }, 5 * 60 * 1000); // 5분마다
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
