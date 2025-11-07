// 통계 대시보드 JavaScript

const TRACKING_SERVER_URL = 'https://gdtrading08com-production.up.railway.app';
// const TRACKING_SERVER_URL = 'http://localhost:3000'; // 로컬 테스트용

let statsData = null;

// 페이지 로드 시 통계 가져오기
document.addEventListener('DOMContentLoaded', async () => {
  await loadStats();
  await loadSendingStats(); // 발송 상태 로드

  // 새로고침 버튼
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadStats();
    loadSendingStats(); // 발송 상태도 새로고침
  });

  // 5분마다 자동 새로고침
  setInterval(() => {
    loadStats();
    loadSendingStats();
  }, 5 * 60 * 1000);
});

/**
 * 통계 데이터 로드
 */
async function loadStats() {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const content = document.getElementById('statsContent');

  loading.style.display = 'block';
  error.style.display = 'none';
  content.style.display = 'none';

  try {
    const response = await fetch(`${TRACKING_SERVER_URL}/api/stats/mailersend`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    statsData = await response.json();
    console.log('📊 통계 데이터:', statsData);

    // UI 업데이트
    updateUI(statsData);

    loading.style.display = 'none';
    content.style.display = 'block';

    // 마지막 업데이트 시간
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleString('ko-KR');

  } catch (err) {
    console.error('❌ 통계 로드 실패:', err);
    loading.style.display = 'none';
    error.style.display = 'block';
    error.textContent = `통계 로드 실패: ${err.message}`;
  }
}

/**
 * UI 업데이트
 */
function updateUI(stats) {
  // 카운트 업데이트
  document.getElementById('sentCount').textContent = stats.sent || 0;
  document.getElementById('deliveredCount').textContent = stats.delivered || 0;
  document.getElementById('openedCount').textContent = `${stats.unique_opens || 0} (${stats.opens || 0})`;
  document.getElementById('clickedCount').textContent = `${stats.unique_clicks || 0} (${stats.clicks || 0})`;
  document.getElementById('bouncedCount').textContent = (stats.hard_bounces || 0) + (stats.soft_bounces || 0);
  document.getElementById('spamCount').textContent = stats.spam_reports || 0;

  // 비율 계산
  const sent = stats.sent || 0;
  const delivered = stats.delivered || 0;
  const opened = stats.unique_opens || 0;
  const clicked = stats.unique_clicks || 0;
  const bounced = (stats.hard_bounces || 0) + (stats.soft_bounces || 0);

  // 전달률 = (전달됨 / 발송됨) * 100
  const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : 0;

  // 오픈율 = (오픈된 이메일 / 전달됨) * 100
  const openRate = delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : 0;

  // 클릭률 = (클릭됨 / 오픈됨) * 100
  const clickRate = opened > 0 ? ((clicked / opened) * 100).toFixed(1) : 0;

  // 반송률 = (반송됨 / 발송됨) * 100
  const bounceRate = sent > 0 ? ((bounced / sent) * 100).toFixed(1) : 0;

  // 비율 텍스트 업데이트
  document.getElementById('deliveryRate').textContent = `${deliveryRate}%`;
  document.getElementById('openRate').textContent = `${openRate}%`;
  document.getElementById('clickRate').textContent = `${clickRate}%`;
  document.getElementById('bounceRate').textContent = `${bounceRate}%`;

  // 바 애니메이션
  setTimeout(() => {
    document.getElementById('deliveryBar').style.width = `${deliveryRate}%`;
    document.getElementById('deliveryBar').textContent = `${deliveryRate}%`;

    document.getElementById('openBar').style.width = `${openRate}%`;
    document.getElementById('openBar').textContent = `${openRate}%`;

    document.getElementById('clickBar').style.width = `${clickRate}%`;
    document.getElementById('clickBar').textContent = `${clickRate}%`;

    document.getElementById('bounceBar').style.width = `${bounceRate}%`;
    document.getElementById('bounceBar').textContent = `${bounceRate}%`;
  }, 100);
}

/**
 * 숫자에 천 단위 콤마 추가
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Chrome storage에서 발송 상태 가져오기
 */
async function loadSendingStats() {
  try {
    // Chrome storage에서 데이터 가져오기
    chrome.storage.local.get(['uploadedEmails', 'sentEmails', 'sendingStats'], (data) => {
      const uploadedEmails = data.uploadedEmails || [];
      const sentEmails = data.sentEmails || [];
      const sendingStats = data.sendingStats || { failed: 0, today: 0 };

      // 총 개수
      const total = uploadedEmails.length;
      document.getElementById('totalCount').textContent = total;

      // 현재까지 보낸 것
      const sent = sentEmails.length;
      document.getElementById('sentCount').textContent = sent;

      // 남은 것
      const remaining = total - sent;
      document.getElementById('remainingCount').textContent = remaining > 0 ? remaining : 0;

      // 실패
      document.getElementById('failedCount').textContent = sendingStats.failed || 0;

      // 오늘 발송 (오늘 날짜와 일치하는 sentEmails 카운트)
      const today = new Date().toISOString().split('T')[0];
      let todayCount = 0;

      if (sentEmails.length > 0) {
        sentEmails.forEach(email => {
          if (email.sentDate && email.sentDate.startsWith(today)) {
            todayCount++;
          }
        });
      }

      document.getElementById('todayCount').textContent = todayCount;

      console.log('📊 발송 상태:', {
        total,
        sent,
        remaining,
        failed: sendingStats.failed,
        today: todayCount
      });
    });
  } catch (err) {
    console.error('❌ 발송 상태 로드 실패:', err);
  }
}
