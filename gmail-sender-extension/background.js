// ===== MailerSend 모듈 Import =====
import { sendEmailWithMailerSend, updateMailerSendStats } from './mailersend.js';

// ===== IndexedDB 함수들 (인라인) =====
const DB_NAME = 'GmailSenderDB';
const DB_VERSION = 1;
const STORE_NAME = 'attachments';
let dbInstance = null;

function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function getAllAttachments() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
// ===== IndexedDB 함수들 끝 =====

let sendingQueue = [];
let isSending = false;
let settings = {};
let stats = {
  sent: 0,
  failed: 0,
  today: 0
};
let cachedAttachments = null; // 첨부파일 캐시 (메모리 최적화)
let progressTimerGlobal = null; // 진행률 타이머 (전역)

// 성능 최적화 설정 (사용자 설정값으로 동적 변경됨)
let BATCH_SIZE = 5; // 동시 발송 개수 (사용자 설정에서 로드됨, 최대 10)
let MAX_RETRIES = 3; // 최대 재시도 횟수
let RATE_LIMIT_PER_SECOND = 5; // 초당 최대 요청 수 (사용자 설정에서 로드됨)
const PROGRESS_UPDATE_INTERVAL = 2000; // 진행률 업데이트 주기 (2초, 성능 개선)
let MIN_BATCH_INTERVAL = 6000; // 최소 배치 간격 (사용자 설정에서 로드됨, 밀리초)

// Rate Limiter
class RateLimiter {
  constructor(maxRequestsPerSecond) {
    this.maxRequests = maxRequestsPerSecond;
    this.queue = [];
    this.processing = false;
    this.requestTimes = [];
  }

  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      // 1초 이전 요청 제거
      const now = Date.now();
      this.requestTimes = this.requestTimes.filter(time => now - time < 1000);

      // Rate limit 체크
      if (this.requestTimes.length >= this.maxRequests) {
        const oldestRequest = this.requestTimes[0];
        const waitTime = 1000 - (now - oldestRequest);
        if (waitTime > 0) {
          await sleep(waitTime);
          continue;
        }
      }

      const { fn, resolve, reject } = this.queue.shift();
      this.requestTimes.push(Date.now());

      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // 최소 간격 대기 (API 부하 분산) - 성능 개선
      await sleep(125);
    }

    this.processing = false;
  }
}

let rateLimiter = new RateLimiter(RATE_LIMIT_PER_SECOND);

// 메시지 리스너 (비동기 작업을 위해 return true 필수!)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startSending') {
    startSending(message.emails, message.settings)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 비동기 작업을 위해 반드시 필요!
  } else if (message.action === 'stopSending') {
    stopSending();
    sendResponse({ success: true });
  }

  // 다른 메시지는 무시
  return false;
});

// 발송 시작
async function startSending(emails, config) {
  sendingQueue = [...emails]; // 배열 복사
  settings = config;
  isSending = true;

  // ⭐ 예약 발송 설정 적용
  const scheduleSettings = config.scheduleSettings || {};
  const startTime = scheduleSettings.startTime ? new Date(scheduleSettings.startTime) : new Date();
  const endTime = scheduleSettings.endTime ? new Date(scheduleSettings.endTime) : null;

  // 시간 검증
  const now = new Date();
  if (startTime < now) {
    log('⚠️ 시작 시간이 현재 시간보다 이전입니다. 즉시 발송을 시작합니다.', 'warning');
    // startTime을 현재 시간으로 설정
    startTime.setTime(now.getTime());
  }

  // 발송 간격 계산
  let emailInterval = 0; // 이메일 간 간격 (밀리초)
  let totalDuration = 0; // 총 발송 시간 (밀리초)

  if (endTime && endTime > startTime) {
    // 예약 발송 모드: 시작~마감 시간 내에 균등 분배
    totalDuration = endTime - startTime;
    emailInterval = Math.floor(totalDuration / emails.length);

    log(`📅 예약 발송 모드`, 'info');
    log(`⏰ 시작: ${startTime.toLocaleString('ko-KR')}`, 'info');
    log(`🎯 마감: ${endTime.toLocaleString('ko-KR')}`, 'info');
    log(`📊 간격: ${(emailInterval / 1000).toFixed(1)}초/이메일`, 'info');
  } else {
    // 즉시 발송 모드 (기존 방식과 유사)
    emailInterval = 1000; // 기본 1초 간격
    log(`🚀 즉시 발송 모드 (기본 간격: 1초)`, 'info');
  }

  // ⭐ 분할 발송 설정 로드 (사용자 설정)
  const splitSettings = await chrome.storage.local.get(['batchSize', 'timeInterval']);
  const userBatchSize = splitSettings.batchSize || 5;

  // 배치 크기 검증 (최대 10개로 제한)
  BATCH_SIZE = Math.min(Math.max(1, parseInt(userBatchSize)), 10);

  // 시간 간격 기반 설정 계산
  const timeIntervalHours = splitSettings.timeInterval || 1;
  MIN_BATCH_INTERVAL = Math.max(1000, timeIntervalHours * 3600 * 1000 / BATCH_SIZE);

  // 기본 설정값 적용 (Rate Limiter용)
  if (endTime && endTime > startTime) {
    // 예약 발송 모드는 순차 발송
    BATCH_SIZE = 1;
    RATE_LIMIT_PER_SECOND = Math.max(1, Math.floor(1000 / emailInterval));
  } else {
    // 즉시 발송 모드는 사용자 설정 배치 크기 사용
    RATE_LIMIT_PER_SECOND = Math.max(1, BATCH_SIZE);
  }

  // Rate Limiter 재생성 (새 속도 적용)
  rateLimiter = new RateLimiter(RATE_LIMIT_PER_SECOND);

  log(`⚙️ 배치 설정 적용: 크기=${BATCH_SIZE}, 간격=${(MIN_BATCH_INTERVAL/1000).toFixed(1)}초, 속도=${RATE_LIMIT_PER_SECOND}/초`, 'info');

  await loadStats();

  // IndexedDB에서 공통 첨부파일 로드 (한 번만 읽고 캐시)
  try {
    log('📎 공통 첨부파일 로딩 중...', 'info');
    const dbAttachments = await getAllAttachments();

    // Blob을 Base64로 변환
    cachedAttachments = [];
    for (const attachment of dbAttachments) {
      try {
        const base64Data = await blobToBase64(attachment.blob);
        cachedAttachments.push({
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          data: base64Data,
          size: attachment.size
        });
      } catch (error) {
        log(`공통 첨부파일 변환 실패: ${attachment.filename}`, 'error');
      }
    }

    if (cachedAttachments.length > 0) {
      const totalSize = cachedAttachments.reduce((sum, att) => sum + att.size, 0);
      log(`✅ 공통 첨부파일 로드 완료: ${cachedAttachments.length}개 (${(totalSize / 1024).toFixed(2)}KB)`, 'success');
    } else {
      log('📎 공통 첨부파일 없음', 'info');
    }
  } catch (error) {
    log(`공통 첨부파일 로드 오류: ${error.message}`, 'error');
    cachedAttachments = [];
  }

  // chrome.storage에서 카테고리별 첨부파일 로드
  let categoryAttachments = [];
  try {
    log('📂 카테고리별 첨부파일 로딩 중...', 'info');
    const storageData = await chrome.storage.local.get(['categoryAttachments']);

    if (storageData.categoryAttachments && storageData.categoryAttachments.length > 0) {
      // Base64 → Blob 변환
      categoryAttachments = storageData.categoryAttachments.map(item => {
        const binaryString = atob(item.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: item.type });

        return {
          category: item.category,
          filename: item.filename,
          file: blob,
          type: item.type,
          size: item.size
        };
      });

      const totalSize = categoryAttachments.reduce((sum, att) => sum + att.size, 0);
      log(`✅ 카테고리별 첨부파일 로드 완료: ${categoryAttachments.length}개 (${(totalSize / 1024).toFixed(2)}KB)`, 'success');
    } else {
      log('📂 카테고리별 첨부파일 없음', 'info');
    }
  } catch (error) {
    log(`카테고리별 첨부파일 로드 오류: ${error.message}`, 'error');
    categoryAttachments = [];
  }

  // 각 이메일에 첨부파일 추가 (공통 + 카테고리별)
  for (const item of sendingQueue) {
    // 공통 첨부파일 추가
    item.attachments = [...cachedAttachments];

    // 카테고리별 첨부파일 추가
    if (item.category && item.category.trim()) {
      const categoryFile = categoryAttachments.find(att => att.category === item.category);

      if (categoryFile) {
        try {
          // Blob → Base64 변환
          const base64Data = await blobToBase64(categoryFile.file);

          // 파일명 중복 체크
          const isDuplicate = item.attachments.some(att => att.filename === categoryFile.filename);

          if (!isDuplicate) {
            item.attachments.push({
              filename: categoryFile.filename,
              mimeType: categoryFile.type,
              data: base64Data,
              size: categoryFile.size
            });

            log(`📎 카테고리 "${item.category}" 첨부파일 추가: ${categoryFile.filename} → ${item.email}`, 'info');
          } else {
            log(`⚠️ 중복 파일 제외: ${categoryFile.filename} (공통 첨부파일에 이미 존재)`, 'warning');
          }
        } catch (error) {
          log(`카테고리 첨부파일 변환 실패: ${categoryFile.filename}`, 'error');
        }
      }
    }
  }

  const estimatedMinutes = Math.ceil((emailInterval * emails.length) / 1000 / 60);
  log(`📧 대량 발송 시작: 총 ${emails.length}개 이메일`, 'info');
  log(`⏱️ 예상 소요 시간: 약 ${estimatedMinutes}분`, 'info');

  // ⭐ 예약 발송 큐 처리 (시간 기반)
  await processScheduledQueue(startTime, emailInterval);
}

// 발송 중지
function stopSending() {
  isSending = false;
  sendingQueue = [];
  cachedAttachments = null; // 캐시 정리 (메모리 최적화)

  // 진행률 타이머 정리 (메모리 누수 방지)
  if (progressTimerGlobal) {
    clearInterval(progressTimerGlobal);
    progressTimerGlobal = null;
  }

  log('발송이 중지되었습니다', 'info');
}

// 배치 처리 큐 (고속 최적화!)
async function processQueueBatch() {
  const totalEmails = sendingQueue.length;
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let currentBatchInterval = MIN_BATCH_INTERVAL; // 사용자 설정 간격

  // 진행률 업데이트 타이머 (2초마다) - 전역 변수로 저장
  progressTimerGlobal = setInterval(() => {
    if (isSending) {
      const progress = Math.floor((processedCount / totalEmails) * 100);
      log(`📊 진행률: ${progress}% (${processedCount}/${totalEmails}) | 성공: ${successCount}, 실패: ${failedCount}`, 'info');
    }
  }, PROGRESS_UPDATE_INTERVAL);

  const startTime = Date.now();

  try {
    // 배치 단위로 처리
    for (let i = 0; i < sendingQueue.length; i += BATCH_SIZE) {
      if (!isSending) {
        log('발송이 사용자에 의해 중지되었습니다', 'warning');
        break;
      }

      const batch = sendingQueue.slice(i, i + BATCH_SIZE);
      const batchStartTime = Date.now();

      // 병렬 처리 (Promise.allSettled로 모든 결과 수집)
      const results = await Promise.allSettled(
        batch.map(item => processSingleEmail(item))
      );

      // 결과 처리 (로그 최소화)
      let batchSuccess = 0;
      let batchFailed = 0;

      results.forEach(async (result, idx) => {
        const item = batch[idx];
        processedCount++;

        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
          batchSuccess++;
          // Stats 업데이트 (배치 단위로 처리, 중복 방지)
          stats.sent++;
          stats.today++;

          // sentEmails 배열에 추가
          const sentEmails = (await chrome.storage.local.get('sentEmails')).sentEmails || [];
          sentEmails.push({
            email: item.email,
            sentDate: new Date().toISOString()
          });
          await chrome.storage.local.set({ sentEmails });

          notifyPopup('updateStatus', { index: item.index, status: 'sent' });
          // 성공 로그는 배치 단위로만 표시 (성능 개선)
        } else {
          failedCount++;
          batchFailed++;
          // Stats 업데이트 (실패 카운트)
          stats.failed++;
          notifyPopup('updateStatus', { index: item.index, status: 'failed' });
          const errorMsg = result.reason?.message || '알 수 없는 오류';
          log(`❌ 실패: ${item.email} - ${errorMsg}`, 'error');

          // ⭐ 실패한 이메일 저장 (재시도 3회 초과)
          await saveFailedEmail({
            email: item.email,
            subject: item.subject,
            category: item.category || '',
            content: item.content,
            imageUrl: item.imageUrl || '',
            error: errorMsg,
            retryCount: MAX_RETRIES,
            lastAttempt: Date.now()
          });
        }
      });

      // 배치 단위로 stats 저장 (성능 최적화 - 10배 감소!)
      await saveStats();

      // 배치 완료 로그 (간소화)
      const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      log(`✅ 배치 완료: ${batchSuccess}개 성공, ${batchFailed}개 실패 (${batchTime}초)`, 'success');

      // 동적 간격 조정 (성공률 낮으면 간격 증가)
      if (processedCount > 0) { // 0 나누기 방지
        const successRate = successCount / processedCount;
        if (successRate < 0.85) {
          // 성공률이 낮으면 간격을 늘림 (Rate Limit 대응)
          currentBatchInterval = Math.min(currentBatchInterval * 1.5, MIN_BATCH_INTERVAL * 3);
          log(`⚠️ 성공률 낮음 (${(successRate*100).toFixed(1)}%) - 간격 증가: ${currentBatchInterval/1000}초`, 'warning');
        } else if (successRate > 0.98 && currentBatchInterval > MIN_BATCH_INTERVAL) {
          // 성공률이 매우 높으면 원래 설정으로 복구
          currentBatchInterval = MIN_BATCH_INTERVAL;
        }
      }

      // 배치 간 간격 대기
      if (i + BATCH_SIZE < sendingQueue.length && isSending) {
        await sleep(currentBatchInterval);
      }
    }

  } catch (error) {
    log(`❌ 배치 처리 오류: ${error.message}`, 'error');
  } finally {
    // 타이머 정리
    if (progressTimerGlobal) {
      clearInterval(progressTimerGlobal);
      progressTimerGlobal = null;
    }

    // 최종 결과
    if (isSending) {
      isSending = false;
      notifyPopup('sendingComplete', {});

      const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      log('='.repeat(50), 'info');
      log(`🎉 발송 완료! 총 ${totalEmails}개 중 성공 ${successCount}개, 실패 ${failedCount}개`, 'success');
      log(`⏱️ 소요 시간: ${totalTime}분`, 'info');
      log('='.repeat(50), 'info');
    }
  }
}

// ⭐ 한국 시간 근무 시간 체크 (9시-18시)
function isWithinBusinessHours(date = new Date()) {
  const kstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const hours = kstDate.getHours();
  return hours >= 9 && hours < 18; // 9시 ~ 17시 59분
}

// ⭐ 다음 근무 시작 시간 계산 (다음 날 9시)
function getNextBusinessStart(date = new Date()) {
  const kstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const nextDay = new Date(kstDate);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(9, 0, 0, 0);
  return nextDay;
}

// ⭐ 분할 발송 세션 저장
async function saveSendingSession(remainingEmails) {
  await chrome.storage.local.set({
    sendingSession: {
      remainingEmails: remainingEmails,
      savedAt: new Date().toISOString(),
      totalOriginal: sendingQueue.length + remainingEmails.length
    }
  });
  log(`💾 발송 세션 저장: ${remainingEmails.length}개 남음`, 'info');
}

// ⭐ 분할 발송 세션 로드
async function loadSendingSession() {
  const data = await chrome.storage.local.get(['sendingSession']);
  if (data.sendingSession && data.sendingSession.remainingEmails) {
    log(`📥 발송 세션 로드: ${data.sendingSession.remainingEmails.length}개 이메일`, 'info');
    return data.sendingSession.remainingEmails;
  }
  return null;
}

// ⭐ 분할 발송 세션 삭제
async function clearSendingSession() {
  await chrome.storage.local.remove(['sendingSession']);
  log(`🗑️ 발송 세션 삭제`, 'info');
}

// ⭐ 예약 발송 큐 처리 (시간 기반 + 분할 발송)
async function processScheduledQueue(startTime, emailInterval) {
  const totalEmails = sendingQueue.length;
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;

  const globalStartTime = Date.now();

  // ⭐ 분할 발송 설정 로드 (일일 제한만 필요, 배치 크기는 이미 startSending에서 설정됨)
  const splitSettings = await chrome.storage.local.get(['dailyLimit']);
  const dailyLimit = splitSettings.dailyLimit || 300;

  try {
    // 시작 시간까지 대기
    const now = new Date();
    const waitTime = startTime - now;

    if (waitTime > 0) {
      const waitMinutes = Math.ceil(waitTime / 1000 / 60);
      log(`⏳ 시작 시간까지 대기 중... (약 ${waitMinutes}분)`, 'info');
      await sleep(waitTime);
      log(`✅ 발송 시작 시간 도달! 이메일 발송을 시작합니다.`, 'success');
    }

    // 진행률 업데이트 타이머 (2초마다) - 실제 발송 시작 후에만 로그
    progressTimerGlobal = setInterval(() => {
      if (isSending && processedCount > 0) {
        const progress = Math.floor((processedCount / totalEmails) * 100);
        const remaining = totalEmails - processedCount;
        const estimatedMinutes = Math.ceil((remaining * emailInterval) / 1000 / 60);

        // ⭐ "남은 것" 통계 업데이트
        notifyPopup('updateRemaining', { remaining: remaining });

        log(`📊 진행률: ${progress}% (${processedCount}/${totalEmails}) | 성공: ${successCount}, 실패: ${failedCount} | 남은 것: ${remaining}개`, 'info');
      }
    }, PROGRESS_UPDATE_INTERVAL);

    // 순차 발송 (시간 기반 간격 + 근무 시간 제한)
    for (let i = 0; i < sendingQueue.length; i++) {
      if (!isSending) {
        log('발송이 사용자에 의해 중지되었습니다', 'warning');

        // ⭐ 남은 이메일 세션 저장
        const remainingEmails = sendingQueue.slice(i);
        await saveSendingSession(remainingEmails);
        break;
      }

      // ⭐ 근무 시간 체크 (9시-18시)
      if (!isWithinBusinessHours()) {
        const nextStart = getNextBusinessStart();
        log(`⏰ 근무 시간 종료 (18시). 다음 날 9시에 자동 재개: ${nextStart.toLocaleString('ko-KR')}`, 'warning');

        // ⭐ 남은 이메일 세션 저장
        const remainingEmails = sendingQueue.slice(i);
        await saveSendingSession(remainingEmails);

        // ⭐ 다음 날 9시까지 대기 후 재개
        const waitTime = nextStart - new Date();
        if (waitTime > 0) {
          await sleep(waitTime);
          log(`✅ 근무 시간 시작 (9시). 발송 재개합니다.`, 'success');
        }
      }

      // ⭐ 일일 제한 체크
      if (stats.today >= dailyLimit) {
        const nextStart = getNextBusinessStart();
        log(`📊 일일 제한 도달 (${dailyLimit}개). 다음 날 9시에 자동 재개: ${nextStart.toLocaleString('ko-KR')}`, 'warning');

        // ⭐ 남은 이메일 세션 저장
        const remainingEmails = sendingQueue.slice(i);
        await saveSendingSession(remainingEmails);

        // ⭐ 오늘 발송 카운트 초기화 및 다음 날까지 대기
        stats.today = 0;
        await saveStats();

        const waitTime = nextStart - new Date();
        if (waitTime > 0) {
          await sleep(waitTime);
          log(`✅ 다음 날 9시 도달. 발송 재개합니다.`, 'success');
        }
      }

      const item = sendingQueue[i];
      const emailStartTime = Date.now();

      try {
        // 단일 이메일 발송
        const result = await processSingleEmail(item);

        if (result.success) {
          successCount++;
          processedCount++;
          // Stats 업데이트
          stats.sent++;
          stats.today++;

          // sentEmails 배열에 추가
          const sentEmails = (await chrome.storage.local.get('sentEmails')).sentEmails || [];
          sentEmails.push({
            email: item.email,
            sentDate: new Date().toISOString()
          });
          await chrome.storage.local.set({ sentEmails });

          notifyPopup('updateStatus', { index: item.index, status: 'sent' });
        }

      } catch (error) {
        failedCount++;
        processedCount++;
        // Stats 업데이트 (실패 카운트)
        stats.failed++;
        notifyPopup('updateStatus', { index: item.index, status: 'failed' });
        const errorMsg = error?.message || '알 수 없는 오류';
        log(`❌ 실패: ${item.email} - ${errorMsg}`, 'error');
      }

      // Stats 저장 (주기적으로)
      if (processedCount % 10 === 0) {
        await saveStats();
      }

      // 다음 이메일까지 대기 (마지막 이메일은 대기 안 함)
      if (i < sendingQueue.length - 1 && isSending) {
        const elapsed = Date.now() - emailStartTime;
        const remainingWait = emailInterval - elapsed;

        if (remainingWait > 0) {
          await sleep(remainingWait);
        }
      }
    }

  } catch (error) {
    log(`❌ 예약 발송 처리 오류: ${error.message}`, 'error');
  } finally {
    // 타이머 정리
    if (progressTimerGlobal) {
      clearInterval(progressTimerGlobal);
      progressTimerGlobal = null;
    }

    // 최종 Stats 저장
    await saveStats();

    // 최종 결과
    if (isSending) {
      isSending = false;
      notifyPopup('sendingComplete', {});

      // ⭐ 세션 삭제 (모두 완료)
      await clearSendingSession();

      const totalTime = ((Date.now() - globalStartTime) / 1000 / 60).toFixed(1);
      log('='.repeat(50), 'info');
      log(`🎉 발송 완료! 총 ${totalEmails}개 중 성공 ${successCount}개, 실패 ${failedCount}개`, 'success');
      log(`⏱️ 소요 시간: ${totalTime}분`, 'info');
      log('='.repeat(50), 'info');
    }
  }
}

// 단일 이메일 처리 (재시도 포함)
async function processSingleEmail(item, retryCount = 0) {
  try {
    // 발송 중 상태
    notifyPopup('updateStatus', { index: item.index, status: 'sending' });

    // Rate Limiter를 통한 발송
    await rateLimiter.execute(async () => {
      await sendEmailUnified(
        item.email,
        item.subject,
        item.content,
        item.imageUrl,
        item.attachments || []
      );
    });

    // 성공 처리 (stats는 배치 레벨에서 처리하여 중복 방지!)
    return { success: true };

  } catch (error) {
    // 재시도 로직
    if (retryCount < MAX_RETRIES) {
      log(`🔄 재시도 ${retryCount + 1}/${MAX_RETRIES}: ${item.email}`, 'warning');
      await sleep(2000 * (retryCount + 1)); // 선형 백오프 (2초, 4초, 6초)
      return await processSingleEmail(item, retryCount + 1);
    }

    // 최종 실패 (stats는 배치 레벨에서 처리하여 중복 방지!)
    throw error;
  }
}

// MailerSend로 이메일 발송 (단일 함수)
async function sendEmailUnified(to, subject, content, imageUrl = '', attachments = [], retryCount = 0, campaignId = null) {
  // MailerSend로 발송
  try {
    // 발신 이메일 가져오기
    const { mailersendFromEmail } = await chrome.storage.local.get(['mailersendFromEmail']);

    if (!mailersendFromEmail) {
      throw new Error('MailerSend 발신 이메일이 설정되지 않았습니다');
    }

    // ⭐ 수신거부 버튼은 mailersend.js 내부에서 HTML 변환 후 추가됨
    console.log('📤 MailerSend로 발송:', to, 'from:', mailersendFromEmail, 'campaign:', campaignId);
    const result = await sendEmailWithMailerSend(mailersendFromEmail, to, subject, content, imageUrl, attachments, campaignId);
    await updateMailerSendStats();
    return result;
  } catch (error) {
    console.error('MailerSend 발송 실패:', error);
    throw error;
  }
}

// 팝업에 메시지 전송
function notifyPopup(action, data) {
  chrome.runtime.sendMessage({
    action: action,
    ...data
  }).catch(() => {
    // 팝업이 닫혀있으면 무시
  });
}

// 로그 전송
function log(text, type) {
  console.log(`[${type}] ${text}`);
  notifyPopup('log', { text, type });
}

// 대기
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 이미지 URL 추출 (popup.js와 동일한 로직)
function extractImageUrls(text) {
  if (!text || !text.trim()) {
    return [];
  }

  const trimmed = text.trim();
  const urls = [];

  // 전략: 콤마로 먼저 분리하고, 각 파트에서 URL 추출
  const delimiters = /[,|;\n]+/;
  const parts = trimmed.split(delimiters);

  console.log('📊 [background] 구분자로 분리된 파트 개수:', parts.length);

  parts.forEach((part, index) => {
    const cleaned = part.trim();
    if (!cleaned) return;

    // 방법 1: src 속성이 있는 경우 (따옴표 여부 무관)
    if (cleaned.toLowerCase().includes('src')) {
      const srcMatch = cleaned.match(/src\s*=\s*['"]([^'"]+)/i);
      if (srcMatch && srcMatch[1]) {
        const url = srcMatch[1].trim();
        console.log(`✅ [background] 파트 ${index + 1}: src 속성에서 URL 추출:`, url);
        urls.push(url);
        return;
      }
    }

    // 방법 2: 직접 URL인 경우
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      console.log(`✅ [background] 파트 ${index + 1}: 직접 URL:`, cleaned);
      urls.push(cleaned);
      return;
    }
  });

  console.log('✅ [background] 총 추출된 이미지 URL 개수:', urls.length);
  return urls;
}

// 통계 로드
async function loadStats() {
  const data = await chrome.storage.local.get(['stats', 'lastDate']);

  const today = new Date().toDateString();

  if (data.stats) {
    stats = data.stats;
  }

  if (data.lastDate !== today) {
    // 날짜가 바뀌면 오늘 카운트만 초기화
    stats.today = 0;
    await chrome.storage.local.set({ lastDate: today, stats });
  }
}

// 통계 저장
async function saveStats() {
  await chrome.storage.local.set({ stats });
}

// ========================================
// 실패한 이메일 저장 기능
// ========================================

/**
 * 실패한 이메일을 chrome.storage에 저장
 * @param {Object} failedEmail - 실패한 이메일 정보
 */
async function saveFailedEmail(failedEmail) {
  try {
    // 기존 실패 목록 가져오기
    const { failedEmails = [] } = await chrome.storage.local.get(['failedEmails']);

    // 중복 체크 (같은 이메일 주소가 이미 있으면 업데이트)
    const existingIndex = failedEmails.findIndex(item => item.email === failedEmail.email);

    if (existingIndex !== -1) {
      // 기존 항목 업데이트 (재시도 횟수와 마지막 시도 시간 갱신)
      failedEmails[existingIndex] = {
        ...failedEmails[existingIndex],
        retryCount: failedEmail.retryCount,
        lastAttempt: failedEmail.lastAttempt,
        error: failedEmail.error
      };
      console.log(`⚠️ 실패 이메일 업데이트: ${failedEmail.email}`);
    } else {
      // 새 항목 추가
      failedEmails.push(failedEmail);
      console.log(`❌ 실패 이메일 저장: ${failedEmail.email}`);
    }

    // 저장
    await chrome.storage.local.set({ failedEmails });

    // 팝업에 실패 카운트 업데이트 알림
    notifyPopup('failedEmailsUpdated', { count: failedEmails.length });

  } catch (error) {
    console.error('실패 이메일 저장 오류:', error);
  }
}

// 확장프로그램 설치 시
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Gmail Bulk Sender 설치 완료');
  await loadStats(); // 통계 초기화
});

// ⭐ Service Worker 시작 시 (재시작 포함)
chrome.runtime.onStartup.addListener(async () => {
  console.log('Service Worker 시작됨');
  await loadStats(); // 날짜 체크 및 통계 초기화
});

// ============ 확장 아이콘 클릭 시 독립 창 열기 ============

let mainWindowId = null;

// 창 닫힘 감지 (한 번만 등록)
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === mainWindowId) {
    mainWindowId = null;
    console.log('메인 창 닫힘');
  }
});

// 확장 아이콘 클릭 이벤트
chrome.action.onClicked.addListener(async () => {
  try {
    // 이미 열려있는 창이 있는지 확인
    if (mainWindowId) {
      try {
        const existingWindow = await chrome.windows.get(mainWindowId);
        // 창이 존재하면 focus
        await chrome.windows.update(mainWindowId, { focused: true });
        console.log('기존 창에 포커스');
        return;
      } catch (error) {
        // 창이 닫혔으면 mainWindowId 초기화
        mainWindowId = null;
      }
    }

    // 새 독립 창 열기
    const newWindow = await chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 620,
      height: 920,
      focused: true
    });

    mainWindowId = newWindow.id;
    console.log('메인 창 열림:', mainWindowId);

  } catch (error) {
    console.error('창 열기 오류:', error);
  }
});

