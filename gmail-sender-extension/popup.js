// IndexedDB 함수 import
import {
  initDB,
  getAllAttachments,
  saveAttachment,
  deleteAttachment,
  migrateFromChromeStorage
} from './indexedDB.js';

// MailerSend 트래킹 API import
import { getTodayStats, getUnopenedEmails } from './mailersend-tracking.js';

let commonAttachments = []; // 공통 첨부파일
let categoryAttachments = []; // 카테고리별 첨부파일 (카테고리명 + 파일)
let categories = []; // 카테고리 목록 (텍스트만)
let currentService = 'mailersend'; // 현재 선택된 서비스 (MailerSend 고정)
let mailersendFromEmail = ''; // MailerSend 발신 이메일
let mailersendApiToken = ''; // MailerSend API 토큰
let mailersendDomainId = ''; // MailerSend Domain ID

// DOM 요소
const mailersendAuth = document.getElementById('mailersendAuth');
const mailersendApiTokenInput = document.getElementById('mailersendApiToken');
const mailersendDomainIdInput = document.getElementById('mailersendDomainId');
const mailersendFrom = document.getElementById('mailersendFrom');
const saveMailersendBtn = document.getElementById('saveMailersendBtn');
const mailersendStatus = document.getElementById('mailersendStatus');
const tableBody = document.getElementById('tableBody');
const clearBtn = document.getElementById('clearBtn');
const addRowBtn = document.getElementById('addRowBtn');
const uploadBtn = document.getElementById('uploadBtn');
const excelFile = document.getElementById('excelFile');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const targetCountInput = document.getElementById('targetCount');
const scheduleInfo = document.getElementById('scheduleInfo');
const emailsPerHourSpan = document.getElementById('emailsPerHour');
const estimatedDurationSpan = document.getElementById('estimatedDuration');
const completionTimeSpan = document.getElementById('completionTime');
const totalCount = document.getElementById('totalCount');
const sentCount = document.getElementById('sentCount');
const remainingCount = document.getElementById('remainingCount');
const failedCount = document.getElementById('failedCount');
const todayCount = document.getElementById('todayCount');
const logArea = document.getElementById('logArea');
const commonAttachBtn = document.getElementById('commonAttachBtn');
const commonAttachmentList = document.getElementById('commonAttachmentList');
const toggleScheduleBtn = document.getElementById('toggleScheduleBtn');
const scheduleFields = document.getElementById('scheduleFields');
// 분할 발송 관련 요소
const toggleSplitBtn = document.getElementById('toggleSplitBtn');
const splitFields = document.getElementById('splitFields');
const batchSizeInput = document.getElementById('batchSize');
const timeIntervalInput = document.getElementById('timeInterval');
const dailyLimitInput = document.getElementById('dailyLimit');
const splitInfo = document.getElementById('splitInfo');
const sendIntervalSpan = document.getElementById('sendInterval');
const splitDurationSpan = document.getElementById('splitDuration');
const requiredDaysSpan = document.getElementById('requiredDays');
// 미오픈 재발송 관련 요소 (MailerSend API 기반)
const toggleResendBtn = document.getElementById('toggleResendBtn');
const resendFields = document.getElementById('resendFields');
const resendStartDate = document.getElementById('resendStartDate');
const resendEndDate = document.getElementById('resendEndDate');
const executeResendBtn = document.getElementById('executeResendBtn');
// 카테고리 관리 관련 요소
const categoryName = document.getElementById('categoryName');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const categoryList = document.getElementById('categoryList');
// 카테고리별 첨부파일 관련 요소
const attachCategorySelect = document.getElementById('attachCategorySelect');
const categoryFile = document.getElementById('categoryFile');
const addAttachmentBtn = document.getElementById('addAttachmentBtn');
const attachmentList = document.getElementById('attachmentList');

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  // MailerSend 설정 로드
  const savedData = await chrome.storage.local.get(['mailersendFromEmail', 'mailersendApiToken', 'mailersendDomainId']);

  // MailerSend API 토큰 로드
  if (savedData.mailersendApiToken) {
    mailersendApiToken = savedData.mailersendApiToken;
    mailersendApiTokenInput.value = mailersendApiToken;
  }

  // MailerSend Domain ID 로드
  if (savedData.mailersendDomainId) {
    mailersendDomainId = savedData.mailersendDomainId;
    mailersendDomainIdInput.value = mailersendDomainId;
  }

  // MailerSend 발신 이메일 로드
  if (savedData.mailersendFromEmail) {
    mailersendFromEmail = savedData.mailersendFromEmail;
    mailersendFrom.value = mailersendFromEmail;
  }

  updateServiceUI();
  loadStats();
  loadSettings();

  // IndexedDB 마이그레이션 (최초 1회)
  await migrateFromChromeStorage();

  // 공통 첨부파일 로드
  await loadCommonAttachments();

  // ⭐ 카테고리 목록 로드
  await loadCategories();

  // ⭐ 카테고리별 첨부파일 로드
  await loadCategoryAttachments();

  // ⭐ 테이블 데이터 로드
  await loadTableData();

  // 미오픈 재발송 날짜 기본값 설정 (한 달 전 ~ 오늘)
  const today = new Date();
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setDate(today.getDate() - 30);

  resendStartDate.value = oneMonthAgo.toISOString().split('T')[0];
  resendEndDate.value = today.toISOString().split('T')[0];

  setupListeners();
});

// 통계 로드
async function loadStats() {
  const data = await chrome.storage.local.get(['stats', 'uploadedEmails', 'sentEmails']);

  // 통계 업데이트
  if (data.stats) {
    failedCount.textContent = data.stats.failed || 0;
  }

  // 업로드된 이메일과 전송된 이메일 기반으로 통계 계산
  const uploadedEmails = data.uploadedEmails || [];
  const sentEmailsList = data.sentEmails || [];

  // 실제 보낸 개수 계산
  sentCount.textContent = sentEmailsList.length;

  // 총 개수는 테이블 기반
  const totalRows = tableBody.querySelectorAll('tr').length;
  totalCount.textContent = totalRows;

  // 남은 것 계산 (총 개수 - 보낸 개수)
  const remaining = Math.max(0, totalRows - sentEmailsList.length);
  remainingCount.textContent = remaining;

  // 오늘 발송 계산
  const today = new Date().toISOString().split('T')[0];
  let todayCounter = 0;
  sentEmailsList.forEach(email => {
    if (email.sentDate && email.sentDate.startsWith(today)) {
      todayCounter++;
    }
  });
  todayCount.textContent = todayCounter;

  console.log('📊 통계 업데이트:', {
    total: totalRows,
    sent: sentEmailsList.length,
    remaining: remaining,
    failed: data.stats?.failed || 0,
    today: todayCounter
  });
}

// 설정 로드 (예약 발송) - datetime-local 형식
async function loadSettings() {
  const settings = await chrome.storage.local.get(['scheduleSettings']);
  if (settings.scheduleSettings) {
    // ISO 형식으로 저장되어 있음 (2024-01-20T14:30)
    if (settings.scheduleSettings.startTime) {
      startTimeInput.value = settings.scheduleSettings.startTime;
    }
    if (settings.scheduleSettings.endTime) {
      endTimeInput.value = settings.scheduleSettings.endTime;
    }

    // 저장된 값이 있으면 자동으로 펼치기
    if (settings.scheduleSettings.startTime || settings.scheduleSettings.endTime) {
      scheduleFields.style.display = 'block';
    }

    calculateSchedule(); // 로드 후 자동 계산
  }
}

// 설정 저장 (예약 발송) - datetime-local 형식
async function saveSettings() {
  const settings = {
    startTime: startTimeInput.value, // YYYY-MM-DDTHH:mm 형식
    endTime: endTimeInput.value,     // YYYY-MM-DDTHH:mm 형식
    targetCount: parseInt(targetCountInput.value)
  };
  await chrome.storage.local.set({ scheduleSettings: settings });
  log('✅ 예약 발송 설정이 저장되었습니다', 'success');
}

// 예약 발송 계산
function calculateSchedule() {
  const startTime = startTimeInput.value; // YYYY-MM-DDTHH:mm 형식
  const endTime = endTimeInput.value;     // YYYY-MM-DDTHH:mm 형식
  const emailCount = tableBody.querySelectorAll('tr').length;

  // 목표 수량 업데이트
  targetCountInput.value = emailCount;

  if (!startTime || !endTime) {
    scheduleInfo.style.display = 'none';
    return;
  }

  // datetime-local 값을 Date 객체로 변환
  const start = new Date(startTime);
  const end = new Date(endTime);

  // 시간 검증
  if (start >= end) {
    scheduleInfo.style.display = 'none';
    log('⚠️ 마감 시간이 시작 시간보다 이후여야 합니다', 'warning');
    return;
  }

  // 시간 차이 계산 (밀리초)
  const timeDiff = end - start;
  const hours = timeDiff / (1000 * 60 * 60);
  const minutes = Math.floor((timeDiff / (1000 * 60)) % 60);

  // 시간당 발송 속도
  const emailsPerHour = Math.ceil(emailCount / hours);

  // 표시
  scheduleInfo.style.display = 'block';
  emailsPerHourSpan.textContent = emailsPerHour.toFixed(1);
  estimatedDurationSpan.textContent = `${Math.floor(hours)}시간 ${minutes}분`;
  completionTimeSpan.textContent = end.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  log(`📊 예약 발송 계산: ${emailsPerHour.toFixed(1)}개/시간`, 'info');
}

// 서비스 UI 업데이트 (MailerSend 전용)
function updateServiceUI() {
  const mailersendMinimized = document.getElementById('mailersendMinimized');
  const mailersendExpanded = document.getElementById('mailersendExpanded');
  const mailersendStatusMinimized = document.getElementById('mailersendStatusMinimized');
  const mailersendInfo = document.getElementById('mailersendInfo');

  // 설정이 저장되어 있으면 최소화 뷰 표시
  if (mailersendApiToken && mailersendFromEmail) {
    mailersendExpanded.style.display = 'none';
    mailersendInfo.style.display = 'none';
    mailersendMinimized.style.display = 'flex';
    mailersendStatusMinimized.textContent = `✅ 설정 완료: ${mailersendFromEmail}`;

    mailersendStatus.textContent = `✅ 설정 완료: API 토큰 & 발신 이메일 (${mailersendFromEmail})`;
    mailersendStatus.style.color = 'green';
  } else {
    // 설정이 없으면 확장 뷰 표시
    mailersendMinimized.style.display = 'none';
    mailersendExpanded.style.display = 'block';
    mailersendInfo.style.display = 'block';

    if (mailersendApiToken) {
      mailersendStatus.textContent = '⚠️ 발신 이메일을 설정해주세요';
      mailersendStatus.style.color = 'orange';
    } else {
      mailersendStatus.textContent = '⚠️ API 토큰과 발신 이메일을 설정해주세요';
      mailersendStatus.style.color = 'orange';
    }
  }
}

// 리스너 설정
function setupListeners() {
  // MailerSend 설정 저장
  saveMailersendBtn.addEventListener('click', async () => {
    const apiToken = mailersendApiTokenInput.value.trim();
    const domainId = mailersendDomainIdInput.value.trim();
    const fromEmail = mailersendFrom.value.trim();

    // API 토큰 검증
    if (!apiToken) {
      mailersendStatus.textContent = '❌ API 토큰을 입력해주세요';
      mailersendStatus.style.color = 'red';
      log('❌ API 토큰을 입력해주세요', 'error');
      return;
    }

    // API 토큰 형식 검증 (mlsn.으로 시작)
    if (!apiToken.startsWith('mlsn.')) {
      mailersendStatus.textContent = '❌ 올바른 API 토큰 형식이 아닙니다 (mlsn.으로 시작해야 함)';
      mailersendStatus.style.color = 'red';
      log('❌ 올바른 API 토큰 형식이 아닙니다', 'error');
      return;
    }

    // Domain ID 검증
    if (!domainId) {
      mailersendStatus.textContent = '❌ Domain ID를 입력해주세요';
      mailersendStatus.style.color = 'red';
      log('❌ Domain ID를 입력해주세요', 'error');
      return;
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!fromEmail) {
      mailersendStatus.textContent = '❌ 발신 이메일을 입력해주세요';
      mailersendStatus.style.color = 'red';
      log('❌ 발신 이메일을 입력해주세요', 'error');
      return;
    }

    if (!emailRegex.test(fromEmail)) {
      mailersendStatus.textContent = '❌ 올바른 이메일 형식이 아닙니다';
      mailersendStatus.style.color = 'red';
      log('❌ 올바른 이메일 형식이 아닙니다', 'error');
      return;
    }

    // 저장
    mailersendApiToken = apiToken;
    mailersendDomainId = domainId;
    mailersendFromEmail = fromEmail;
    await chrome.storage.local.set({
      mailersendApiToken,
      mailersendDomainId,
      mailersendFromEmail
    });

    mailersendStatus.textContent = `✅ 저장 완료: API 토큰 & 발신 이메일 (${fromEmail})`;
    mailersendStatus.style.color = 'green';
    log(`✅ MailerSend 설정 저장 완료`, 'success');

    // ⭐ 저장 후 최소화 뷰로 전환
    const mailersendMinimized = document.getElementById('mailersendMinimized');
    const mailersendExpanded = document.getElementById('mailersendExpanded');
    const mailersendStatusMinimized = document.getElementById('mailersendStatusMinimized');
    const mailersendInfo = document.getElementById('mailersendInfo');

    mailersendExpanded.style.display = 'none';
    mailersendInfo.style.display = 'none';
    mailersendMinimized.style.display = 'flex';
    mailersendStatusMinimized.textContent = `✅ 설정 완료: ${fromEmail}`;
  });

  // ⭐ MailerSend 수정하기 버튼
  const editMailersendBtn = document.getElementById('editMailersendBtn');
  editMailersendBtn.addEventListener('click', () => {
    const mailersendMinimized = document.getElementById('mailersendMinimized');
    const mailersendExpanded = document.getElementById('mailersendExpanded');
    const mailersendInfo = document.getElementById('mailersendInfo');

    mailersendMinimized.style.display = 'none';
    mailersendExpanded.style.display = 'block';
    mailersendInfo.style.display = 'block';
    log('📝 MailerSend 설정 수정 모드', 'info');
  });

  // ⭐ 예약 발송 토글 버튼
  toggleScheduleBtn.addEventListener('click', () => {
    if (scheduleFields.style.display === 'none') {
      scheduleFields.style.display = 'block';
      log('⏰ 예약 발송 설정 열기', 'info');
    } else {
      scheduleFields.style.display = 'none';
      log('⏰ 예약 발송 설정 닫기', 'info');
    }
  });

  // ⭐ 분할 발송 토글 버튼
  toggleSplitBtn.addEventListener('click', () => {
    if (splitFields.style.display === 'none') {
      splitFields.style.display = 'block';
      calculateSplitInfo(); // 정보 계산
      log('⚙️ 분할 발송 설정 열기', 'info');
    } else {
      splitFields.style.display = 'none';
      log('⚙️ 분할 발송 설정 닫기', 'info');
    }
  });

  // ⭐ 분할 발송 설정 변경 시 정보 업데이트
  batchSizeInput.addEventListener('input', calculateSplitInfo);
  timeIntervalInput.addEventListener('input', calculateSplitInfo);
  dailyLimitInput.addEventListener('input', calculateSplitInfo);

  // ⭐ 미오픈 재발송 토글 버튼
  toggleResendBtn.addEventListener('click', () => {
    if (resendFields.style.display === 'none') {
      resendFields.style.display = 'block';
      log('📊 미오픈 재발송 설정 열기', 'info');
    } else {
      resendFields.style.display = 'none';
      log('📊 미오픈 재발송 설정 닫기', 'info');
    }
  });

  // ⭐ 날짜 입력 제한 설정 (오늘까지, 29일 전부터)
  const setDateLimits = () => {
    const today = new Date().toISOString().split('T')[0];
    const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    resendStartDate.min = twentyNineDaysAgo;
    resendStartDate.max = today;
    resendEndDate.max = today;

    log(`📅 날짜 입력 제한: ${twentyNineDaysAgo} ~ ${today}`, 'info');
  };
  setDateLimits();

  // ⭐ 미오픈 재발송 날짜 입력 시 자동 시간 설정
  resendStartDate.addEventListener('change', () => {
    if (resendStartDate.value) {
      log(`📅 시작 날짜: ${resendStartDate.value} 00:00:00 UTC`, 'info');
    }
  });

  resendEndDate.addEventListener('change', () => {
    if (resendEndDate.value) {
      log(`📅 종료 날짜: ${resendEndDate.value} 23:59:59 UTC (또는 현재 시간)`, 'info');
    }
  });

  // ⭐ 예약 발송 입력 필드 변경 시 자동 계산
  startTimeInput.addEventListener('change', () => {
    calculateSchedule();
    saveSettings();
  });

  endTimeInput.addEventListener('change', () => {
    calculateSchedule();
    saveSettings();
  });

  // 공통 첨부파일 버튼
  commonAttachBtn.addEventListener('click', handleCommonFileSelect);

  // 테이블 붙여넣기 처리
  tableBody.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    processPastedData(text);
  });

  // 붙여넣은 데이터 처리
  function processPastedData(text) {
    if (!text || !text.trim()) {
      log('붙여넣은 데이터가 없습니다', 'error');
      return;
    }

    // 디버그: 원본 텍스트 로그
    console.log('붙여넣은 원본 텍스트:', text);
    console.log('텍스트 길이:', text.length);

    const rows = text.trim().split('\n');
    log(`${rows.length}개 행 감지`, 'info');

    // 구분자 자동 감지
    const delimiter = detectDelimiter(text);
    log(`감지된 구분자: ${delimiter === '\t' ? '탭' : delimiter === ',' ? '쉼표' : delimiter === '|' ? '파이프' : '스페이스'}`, 'info');

    // 유효한 데이터 확인
    const validRows = [];
    const invalidRows = [];

    rows.forEach((row, index) => {
      // 빈 행 건너뛰기
      if (!row.trim()) {
        return;
      }

      const cols = row.split(delimiter);
      console.log(`행 ${index + 1} 컬럼:`, cols);

      // 최소 3개 컬럼 필요 (제목, 이메일, 내용)
      if (cols.length >= 3) {
        const subject = cols[0] ? cols[0].trim() : '';
        const email = cols[1] ? cols[1].trim() : '';
        const content = cols[2] ? cols[2].trim() : '';
        const imageHtml = cols[3] ? cols[3].trim() : '';

        // 제목, 이메일, 내용이 모두 있어야 유효
        if (subject && email && content) {
          const imageUrls = extractImageUrls(imageHtml);
          const imageUrlString = imageUrls.join(', '); // 배열을 문자열로 변환
          validRows.push({
            subject: subject,
            email: email,
            content: content,
            imageUrl: imageUrlString
          });
        } else {
          invalidRows.push({
            index: index + 1,
            reason: !subject ? '제목 없음' : !email ? '이메일 없음' : '내용 없음'
          });
        }
      } else {
        invalidRows.push({
          index: index + 1,
          reason: `컬럼 부족 (${cols.length}개, 최소 3개 필요)`,
          raw: row.substring(0, 50) // 처음 50자만
        });
      }
    });

    // 유효한 데이터가 있을 때만 테이블 업데이트
    if (validRows.length > 0) {
      tableBody.innerHTML = '';
      validRows.forEach(row => {
        addRow(row.category || '', row.subject, row.email, row.content, row.imageUrl);
      });
      updateTotalCount();
      log(`${validRows.length}개 행 붙여넣기 완료`, 'success');

      // 유효하지 않은 행이 있으면 경고
      if (invalidRows.length > 0) {
        log(`경고: ${invalidRows.length}개 행 제외됨`, 'warning');
        invalidRows.slice(0, 3).forEach(invalid => {
          log(`  행 ${invalid.index}: ${invalid.reason}`, 'warning');
          if (invalid.raw) {
            log(`    데이터: "${invalid.raw}..."`, 'warning');
          }
        });
        if (invalidRows.length > 3) {
          log(`  외 ${invalidRows.length - 3}개 행`, 'warning');
        }
      }
    } else {
      log('올바른 형식의 데이터가 없습니다', 'error');
      log('필수: 제목 | 이메일 | 내용 (이미지URL은 선택)', 'error');
      log('지원 구분자: 탭, 쉼표, 파이프(|), 스페이스', 'error');
      if (invalidRows.length > 0) {
        invalidRows.slice(0, 3).forEach(invalid => {
          log(`  행 ${invalid.index}: ${invalid.reason}`, 'error');
          if (invalid.raw) {
            log(`    데이터: "${invalid.raw}..."`, 'error');
          }
        });
      }
    }
  }

  // 목록 초기화
  clearBtn.addEventListener('click', async () => {
    if (confirm('모든 데이터를 삭제하시겠습니까?')) {
      tableBody.innerHTML = '';
      updateTotalCount();
      await saveTableData();
      log('목록 초기화 완료 (테이블 비움)', 'info');
    }
  });

  // 행 추가
  addRowBtn.addEventListener('click', async () => {
    const rowCount = parseInt(document.getElementById('rowCount').value) || 1;
    for (let i = 0; i < rowCount; i++) {
      addRow('', '', '', '', '');
    }
    updateTotalCount();
    await saveTableData();
    log(`${rowCount}개 행 추가 완료`, 'info');
  });

  // 엑셀 업로드 버튼
  uploadBtn.addEventListener('click', () => {
    excelFile.click();
  });

  // 엑셀 파일 처리
  excelFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      log('파일 읽는 중...', 'info');

      const result = await readExcelFile(file);

      if (result.valid.length > 0) {
        tableBody.innerHTML = '';
        result.valid.forEach(row => {
          addRow(row.category || '', row.subject, row.email, row.content, row.imageUrl);
        });
        updateTotalCount();
        await saveTableData();
        log(`${result.valid.length}개 행 업로드 완료`, 'success');

        // 유효하지 않은 행이 있으면 경고
        if (result.invalid.length > 0) {
          log(`경고: ${result.invalid.length}개 행 제외됨`, 'warning');
          result.invalid.slice(0, 3).forEach(invalid => {
            log(`  행 ${invalid.index}: ${invalid.reason}`, 'warning');
          });
          if (result.invalid.length > 3) {
            log(`  외 ${result.invalid.length - 3}개 행`, 'warning');
          }
        }
      } else {
        log('파일에 유효한 데이터가 없습니다', 'error');
        log('필수: 제목 | 이메일 | 내용 (이미지URL은 선택)', 'error');
        if (result.invalid.length > 0) {
          result.invalid.slice(0, 3).forEach(invalid => {
            log(`  행 ${invalid.index}: ${invalid.reason}`, 'error');
          });
        }
      }
    } catch (error) {
      log('파일 읽기 오류: ' + error.message, 'error');
    }

    // 파일 input 초기화
    e.target.value = '';
  });

  // 발송 시작
  startBtn.addEventListener('click', async () => {
    // MailerSend 설정 확인
    if (!mailersendApiToken || !mailersendFromEmail) {
      alert('먼저 MailerSend 설정을 완료해주세요.');
      return;
    }

    const emails = await getEmailList(); // async 함수로 변경
    if (emails.length === 0) {
      alert('발송할 이메일이 없습니다.');
      return;
    }

    await saveSettings();

    // ⭐ 예약 발송 설정 가져오기 (datetime-local 형식)
    let scheduleSettings = null;

    if (startTimeInput.value && endTimeInput.value) {
      // datetime-local 값을 Date 객체로 변환 (YYYY-MM-DDTHH:mm)
      const startDate = new Date(startTimeInput.value);
      const endDate = new Date(endTimeInput.value);

      // 시간 검증
      if (startDate >= endDate) {
        alert('⚠️ 마감 시간이 시작 시간보다 이후여야 합니다.');
        return;
      }

      scheduleSettings = {
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        targetCount: parseInt(targetCountInput.value)
      };

      // 예상 시간 계산
      const totalDuration = endDate - startDate;
      const emailInterval = totalDuration / emails.length;
      const estimatedMinutes = Math.ceil(totalDuration / 1000 / 60);

      // 대량 발송 확인
      if (emails.length > 50) {
        const confirmed = confirm(
          `⚠️ 예약 발송 알림\n\n` +
          `총 ${emails.length}개 이메일을 발송합니다.\n` +
          `시작: ${startDate.toLocaleString('ko-KR')}\n` +
          `마감: ${endDate.toLocaleString('ko-KR')}\n` +
          `발송 간격: ${(emailInterval / 1000).toFixed(1)}초\n` +
          `예상 소요 시간: 약 ${estimatedMinutes}분\n\n` +
          `계속하시겠습니까?`
        );
        if (!confirmed) return;
      }
    } else {
      // 즉시 발송 모드
      if (emails.length > 50) {
        const confirmed = confirm(
          `⚠️ 즉시 발송 알림\n\n` +
          `총 ${emails.length}개 이메일을 즉시 발송합니다.\n` +
          `(예약 시간이 설정되지 않았습니다)\n\n` +
          `계속하시겠습니까?`
        );
        if (!confirmed) return;
      }
    }

    // ⭐ 분할 발송 설정 저장
    await chrome.storage.local.set({
      batchSize: parseInt(batchSizeInput.value) || 50,
      timeInterval: parseFloat(timeIntervalInput.value) || 1,
      dailyLimit: parseInt(dailyLimitInput.value) || 300
    });

    const settings = {
      scheduleSettings: scheduleSettings
    };

    // ⭐ "남은 것" 초기화
    remainingCount.textContent = emails.length;

    // 백그라운드로 전송
    chrome.runtime.sendMessage({
      action: 'startSending',
      emails: emails,
      settings: settings
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('메시지 전송 오류:', chrome.runtime.lastError);
      }
    });

    startBtn.disabled = true;
    stopBtn.disabled = false;

    log('='.repeat(50), 'info');
    log(`📧 대량 발송 시작: ${emails.length}개`, 'info');
    if (scheduleSettings && scheduleSettings.startTime && scheduleSettings.endTime) {
      log(`📅 예약 발송 모드 (오늘)`, 'info');
      log(`⏰ 시작: ${new Date(scheduleSettings.startTime).toLocaleString('ko-KR')}`, 'info');
      log(`🎯 마감: ${new Date(scheduleSettings.endTime).toLocaleString('ko-KR')}`, 'info');
    } else {
      log(`🚀 즉시 발송 모드`, 'info');
    }
    log('='.repeat(50), 'info');
  });

  // 발송 중지
  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopSending' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('메시지 전송 오류:', chrome.runtime.lastError);
      }
    });
    startBtn.disabled = false;
    stopBtn.disabled = true;
    log('발송 중지', 'info');
  });

  // 백그라운드 메시지 수신
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateStatus') {
      updateRowStatus(message.index, message.status);
      loadStats();
    } else if (message.action === 'log') {
      log(message.text, message.type);
    } else if (message.action === 'sendingComplete') {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      log('모든 발송 완료', 'success');
    } else if (message.action === 'updateRemaining') {
      // ⭐ "남은 것" 통계 업데이트
      remainingCount.textContent = message.remaining;
    } else if (message.action === 'failedEmailsUpdated') {
      // ⭐ 실패한 이메일 카운트 업데이트
      failedCount.textContent = message.count || 0;
      log(`⚠️ 실패한 이메일: ${message.count}개`, 'warning');
    }
  });

  // ⭐ 미오픈 재발송 실행 버튼 (MailerSend API 기반)
  executeResendBtn.addEventListener('click', async () => {
    await handleResendUnopened();
  });
}

// 구분자 자동 감지 함수
function detectDelimiter(text) {
  // 첫 줄을 기준으로 구분자 감지
  const firstLine = text.trim().split('\n')[0];

  // 가능한 구분자들
  const delimiters = [
    { char: '\t', name: '탭' },
    { char: ',', name: '쉼표' },
    { char: '|', name: '파이프' },
    { char: '  ', name: '더블스페이스' }, // 2개 이상의 연속된 스페이스
  ];

  // 각 구분자의 출현 빈도 계산
  const counts = delimiters.map(d => ({
    char: d.char,
    name: d.name,
    count: (firstLine.match(new RegExp(d.char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  }));

  console.log('구분자 빈도:', counts);

  // 가장 많이 나타나는 구분자 선택
  const bestDelimiter = counts.reduce((best, current) =>
    current.count > best.count ? current : best
  );

  // 구분자가 하나도 없으면 탭을 기본값으로
  if (bestDelimiter.count === 0) {
    console.log('구분자를 찾을 수 없음. 탭을 기본값으로 사용');
    return '\t';
  }

  console.log('선택된 구분자:', bestDelimiter.name, '(', bestDelimiter.count, '개)');
  return bestDelimiter.char;
}

// 테이블 행 추가
function addRow(category, subject, email, content, imageUrl = '') {
  const tr = document.createElement('tr');

  // 카테고리
  const td0 = document.createElement('td');
  td0.contentEditable = 'true';
  td0.textContent = category || '';
  td0.addEventListener('blur', () => saveTableData());

  // 제목
  const td1 = document.createElement('td');
  td1.contentEditable = 'true';
  td1.textContent = subject;
  td1.addEventListener('blur', () => saveTableData());

  // 이메일
  const td2 = document.createElement('td');
  td2.contentEditable = 'true';
  td2.textContent = email;
  td2.addEventListener('blur', () => saveTableData());

  // 내용
  const td3 = document.createElement('td');
  td3.contentEditable = 'true';
  td3.textContent = content;
  td3.addEventListener('blur', () => saveTableData());

  // 이미지 URL (썸네일 + 텍스트)
  const td4 = document.createElement('td');
  td4.className = 'image-url-cell';

  // 이미지 URL이 있으면 썸네일 생성
  if (imageUrl && imageUrl.trim()) {
    const imageUrls = extractImageUrls(imageUrl);

    if (imageUrls.length > 0) {
      // 썸네일 컨테이너
      const thumbnailsDiv = document.createElement('div');
      thumbnailsDiv.className = 'image-thumbnails';

      imageUrls.forEach((url, index) => {
        const img = document.createElement('img');
        img.src = url;
        img.alt = `Image ${index + 1}`;
        img.title = url;
        img.onerror = function() {
          // 이미지 로드 실패 시 대체 텍스트
          this.style.display = 'none';
        };
        thumbnailsDiv.appendChild(img);
      });

      td4.appendChild(thumbnailsDiv);
    }
  }

  // URL 텍스트 (편집 가능)
  const urlTextDiv = document.createElement('div');
  urlTextDiv.className = 'url-text';
  urlTextDiv.contentEditable = 'true';
  urlTextDiv.textContent = imageUrl || '';

  // 텍스트 변경 시 썸네일 업데이트 및 저장
  urlTextDiv.addEventListener('blur', function() {
    updateThumbnails(td4, this.textContent);
    saveTableData();
  });

  td4.appendChild(urlTextDiv);

  // 상태
  const td5 = document.createElement('td');
  td5.className = 'status-pending';
  td5.textContent = '대기';

  tr.appendChild(td0);
  tr.appendChild(td1);
  tr.appendChild(td2);
  tr.appendChild(td3);
  tr.appendChild(td4);
  tr.appendChild(td5);

  tableBody.appendChild(tr);
}

// 썸네일 업데이트 함수
function updateThumbnails(cell, urlText) {
  // 기존 썸네일 제거
  const existingThumbnails = cell.querySelector('.image-thumbnails');
  if (existingThumbnails) {
    existingThumbnails.remove();
  }

  // 새 썸네일 생성
  if (urlText && urlText.trim()) {
    const imageUrls = extractImageUrls(urlText);

    if (imageUrls.length > 0) {
      const thumbnailsDiv = document.createElement('div');
      thumbnailsDiv.className = 'image-thumbnails';

      imageUrls.forEach((url, index) => {
        const img = document.createElement('img');
        img.src = url;
        img.alt = `Image ${index + 1}`;
        img.title = url;
        img.onerror = function() {
          this.style.display = 'none';
        };
        thumbnailsDiv.appendChild(img);
      });

      // url-text 앞에 삽입
      const urlTextDiv = cell.querySelector('.url-text');
      cell.insertBefore(thumbnailsDiv, urlTextDiv);
    }
  }
}

// 이미지 URL 추출 (여러 이미지 지원 - 배열 반환)
function extractImageUrls(text) {
  if (!text || !text.trim()) {
    console.log('❌ 빈 텍스트');
    return [];
  }

  const trimmed = text.trim();
  const urls = [];

  console.log('🔍 원본 텍스트:', trimmed);
  console.log('🔍 텍스트 길이:', trimmed.length);

  // 전략: 콤마로 먼저 분리하고, 각 파트에서 URL 추출
  const delimiters = /[,|;\n]+/;
  const parts = trimmed.split(delimiters);

  console.log('📊 구분자로 분리된 파트 개수:', parts.length);

  parts.forEach((part, index) => {
    const cleaned = part.trim();
    console.log(`🔍 파트 ${index + 1}:`, cleaned.substring(0, 80) + (cleaned.length > 80 ? '...' : ''));

    if (!cleaned) {
      console.log(`⏭️  파트 ${index + 1}: 빈 문자열, 스킵`);
      return;
    }

    // 방법 1: src 속성이 있는 경우 (따옴표 여부 무관)
    if (cleaned.toLowerCase().includes('src')) {
      // src='url' 또는 src="url" 또는 src='url (닫는 따옴표 없음)
      const srcMatch = cleaned.match(/src\s*=\s*['"]([^'"]+)/i);
      if (srcMatch && srcMatch[1]) {
        const url = srcMatch[1].trim();
        console.log(`✅ 파트 ${index + 1}: src 속성에서 URL 추출:`, url);
        urls.push(url);
        return;
      }
    }

    // 방법 2: 직접 URL인 경우
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      console.log(`✅ 파트 ${index + 1}: 직접 URL:`, cleaned);
      urls.push(cleaned);
      return;
    }

    console.log(`⚠️  파트 ${index + 1}: URL 추출 실패`);
  });

  console.log('✅ 총 추출된 이미지 URL 개수:', urls.length);
  urls.forEach((url, index) => {
    console.log(`  ${index + 1}. ${url}`);
  });

  return urls;
}

// 이메일 목록 가져오기 (첨부파일 제외 - 크기 제한 회피)
async function getEmailList() {
  const rows = tableBody.querySelectorAll('tr');
  const emails = [];

  rows.forEach((row, index) => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 6) {
      const category = cells[0].textContent.trim();
      const subject = cells[1].textContent.trim();
      const email = cells[2].textContent.trim();
      const content = cells[3].textContent.trim();

      // 이미지 URL 셀에서 .url-text 요소 찾기
      const urlTextElement = cells[4].querySelector('.url-text');
      const imageUrl = urlTextElement ? urlTextElement.textContent.trim() : cells[4].textContent.trim();

      if (subject && email && content) {
        // 첨부파일은 background.js에서 IndexedDB에서 직접 읽도록 변경 (메시지 크기 제한 회피)
        emails.push({ category, subject, email, content, imageUrl, index });
      }
    }
  });

  return emails;
}

// 행 상태 업데이트
function updateRowStatus(index, status) {
  const rows = tableBody.querySelectorAll('tr');
  if (rows[index]) {
    const statusCell = rows[index].querySelector('td:last-child');
    statusCell.className = `status-${status}`;

    switch(status) {
      case 'sending':
        statusCell.textContent = '발송 중';
        break;
      case 'sent':
        statusCell.textContent = '완료';
        break;
      case 'failed':
        statusCell.textContent = '실패';
        break;
    }
  }
}

// 총 개수 업데이트
function updateTotalCount() {
  const rows = tableBody.querySelectorAll('tr');
  totalCount.textContent = rows.length;

  // ⭐ 예약 발송 정보도 자동 업데이트
  calculateSchedule();
}

// 테이블 데이터 저장
async function saveTableData() {
  try {
    const emails = await getEmailList();
    await chrome.storage.local.set({ emailTableData: emails });
    console.log('✅ 테이블 데이터 저장 완료:', emails.length, '개');
  } catch (error) {
    console.error('❌ 테이블 저장 오류:', error);
  }
}

// 테이블 데이터 로드
async function loadTableData() {
  try {
    const data = await chrome.storage.local.get(['emailTableData']);
    if (data.emailTableData && data.emailTableData.length > 0) {
      console.log('📥 테이블 데이터 로드:', data.emailTableData.length, '개');
      tableBody.innerHTML = '';
      data.emailTableData.forEach(row => {
        addRow(row.category || '', row.subject, row.email, row.content, row.imageUrl);
      });
      updateTotalCount();
      log(`✅ ${data.emailTableData.length}개 이메일 로드 완료`, 'success');
    } else {
      console.log('ℹ️ 저장된 테이블 데이터 없음');
    }
  } catch (error) {
    console.error('❌ 테이블 로드 오류:', error);
  }
}

// 로그 추가
function log(text, type = 'info') {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = time;

  const textSpan = document.createElement('span');
  textSpan.className = `log-${type}`;
  textSpan.textContent = text;

  entry.appendChild(timeSpan);
  entry.appendChild(textSpan);

  logArea.insertBefore(entry, logArea.firstChild);

  // 최대 50개까지만 유지
  while (logArea.children.length > 50) {
    logArea.removeChild(logArea.lastChild);
  }
}

// 공통 파일 선택 처리 (IndexedDB 사용)
async function handleCommonFileSelect() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  // accept 속성 제거 - 모든 파일 형식 자동 허용

  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    log(`${files.length}개 파일 선택됨, 업로드 시작...`, 'info');

    try {
      let completed = 0;
      let failed = 0;

      for (const file of files) {
        try {
          // 파일 크기 체크 (25MB 제한)
          if (file.size > 25 * 1024 * 1024) {
            log(`파일이 너무 큽니다: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`, 'error');
            failed++;
            continue;
          }

          log(`파일 저장 중: ${file.name}`, 'info');

          // IndexedDB에 저장 (Blob 직접 저장!)
          await saveAttachment(file);

          completed++;
          log(`공통 파일 추가됨: ${file.name} (${(file.size / 1024).toFixed(2)}KB) [${completed}/${files.length}]`, 'success');

        } catch (error) {
          failed++;
          log(`파일 저장 실패: ${file.name} - ${error.message}`, 'error');
        }
      }

      // IndexedDB에서 다시 로드
      await loadCommonAttachments();

      // 최종 결과
      if (completed > 0) {
        log(`✅ 업로드 완료: 성공 ${completed}개, 실패 ${failed}개`, 'success');
      } else {
        log(`❌ 모든 파일 업로드 실패`, 'error');
      }

    } catch (error) {
      log(`파일 업로드 실패: ${error.message}`, 'error');
    }
  };

  input.click();
}

// 공통 첨부파일 로드 (IndexedDB에서)
async function loadCommonAttachments() {
  try {
    commonAttachments = await getAllAttachments();

    // 파일 개수와 관계없이 항상 UI 업데이트 (0개일 때도 빈 목록 표시)
    updateCommonAttachmentList();

    if (commonAttachments.length > 0) {
      log(`${commonAttachments.length}개 공통 파일 로드됨`, 'success');
    } else {
      log('공통 첨부파일이 없습니다', 'info');
    }
  } catch (error) {
    log(`공통 파일 로드 실패: ${error.message}`, 'error');
  }
}

// 공통 첨부파일 목록 UI 업데이트
function updateCommonAttachmentList() {
  commonAttachmentList.innerHTML = '';

  if (commonAttachments.length === 0) {
    return;
  }

  commonAttachments.forEach((attachment) => {
    const item = document.createElement('div');
    item.className = 'attachment-item';

    const icon = document.createElement('span');
    icon.textContent = '📄';

    const name = document.createElement('span');
    name.textContent = `${attachment.filename} (${(attachment.size / 1024).toFixed(1)}KB)`;
    name.title = attachment.filename;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.className = 'btn-remove';
    removeBtn.onclick = async (e) => {
      e.preventDefault();
      try {
        // IndexedDB에서 제거
        await deleteAttachment(attachment.id);
        // 목록 다시 로드
        await loadCommonAttachments();
        log(`공통 파일 제거됨: ${attachment.filename}`, 'info');
      } catch (error) {
        log(`파일 제거 실패: ${error.message}`, 'error');
      }
    };

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(removeBtn);
    commonAttachmentList.appendChild(item);
  });
}

// 파일을 Base64로 변환
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      // data:image/png;base64,... 형식에서 base64 부분만 추출
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('파일 읽기 실패'));
    };

    reader.readAsDataURL(file);
  });
}

// 엑셀 파일 읽기
async function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // 첫 번째 시트 읽기
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        // 데이터 변환 (첫 번째 행은 헤더로 가정)
        const validRows = [];
        const invalidRows = [];

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];

          // 빈 행 건너뛰기
          if (!row || row.length === 0) {
            continue;
          }

          // 최소 4개 컬럼 필요 (카테고리, 제목, 이메일, 내용)
          if (row.length >= 4) {
            const category = String(row[0] || '').trim();
            const subject = String(row[1] || '').trim();
            const email = String(row[2] || '').trim();
            const content = String(row[3] || '').trim();
            const imageHtmlOrUrl = String(row[4] || '').trim();

            // 이미지 URL 추출 (여러 이미지 지원)
            const imageUrls = extractImageUrls(imageHtmlOrUrl);
            const imageUrlString = imageUrls.join(', '); // 배열을 문자열로 변환

            // 제목, 이메일, 내용이 모두 있어야 유효
            if (subject && email && content) {
              validRows.push({
                category: category,
                subject: subject,
                email: email,
                content: content,
                imageUrl: imageUrlString
              });
            } else {
              invalidRows.push({
                index: i + 1, // 엑셀 행 번호 (헤더 포함)
                reason: !subject ? '제목 없음' : !email ? '이메일 없음' : '내용 없음'
              });
            }
          } else {
            invalidRows.push({
              index: i + 1,
              reason: `컬럼 부족 (${row.length}개, 최소 4개 필요: 카테고리|제목|이메일|내용)`
            });
          }
        }

        // ⭐ 카테고리별 중복 이메일 제거
        const seen = new Set();
        const filteredRows = validRows.filter(item => {
          const category = item.category || '';
          const email = item.email.toLowerCase(); // 대소문자 구분 없이
          const key = `${category}|${email}`;

          if (seen.has(key)) {
            log(`⚠️ 중복 제거: ${item.email} (카테고리: "${item.category}")`, 'warning');
            return false; // 중복
          }

          seen.add(key);
          return true;
        });

        const duplicateCount = validRows.length - filteredRows.length;
        if (duplicateCount > 0) {
          log(`📊 카테고리별 중복 제거: ${duplicateCount}개`, 'info');
        }

        // ⭐ 수신거부 목록 필터링
        log('🔍 수신거부 목록 확인 중...', 'info');

        filterUnsubscribedEmails(filteredRows)
          .then(checkedRows => {
            // 수신거부된 이메일 제외
            const finalRows = checkedRows.filter(item => !item.isUnsubscribed);
            const unsubscribedCount = checkedRows.length - finalRows.length;

            if (unsubscribedCount > 0) {
              log(`🚫 수신거부 목록 필터링: ${unsubscribedCount}개 제외`, 'warning');
            } else {
              log(`✅ 수신거부 목록 확인 완료 (제외 없음)`, 'info');
            }

            resolve({
              valid: finalRows,
              invalid: invalidRows
            });
          })
          .catch(error => {
            log(`⚠️ 수신거부 목록 확인 실패 (필터링 없이 계속): ${error.message}`, 'warning');
            // 오류 발생 시에도 원본 데이터로 계속 진행
            resolve({
              valid: filteredRows,
              invalid: invalidRows
            });
          });
      } catch (error) {
        reject(new Error('엑셀 파일 파싱 실패: ' + error.message));
      }
    };

    reader.onerror = () => {
      reject(new Error('파일 읽기 실패'));
    };

    reader.readAsArrayBuffer(file);
  });
}

// ⭐ 미오픈 재발송 핸들러
async function handleResendUnopened() {
  try {
    // 날짜 범위 입력 필드에서 가져오기
    const startDate = resendStartDate.value;
    const endDate = resendEndDate.value;

    if (!startDate || !endDate) {
      alert('⚠️ 조회 시작 날짜와 종료 날짜를 모두 입력해주세요.');
      log('❌ 날짜가 입력되지 않았습니다', 'warning');
      return;
    }

    log(`🔍 MailerSend API로 미오픈 이메일 조회 중... (${startDate} ~ ${endDate})`, 'info');

    // MailerSend API로 미오픈 이메일 목록 조회
    const unopenedEmailsFromAPI = await getUnopenedEmails(startDate, endDate);

    log(`✅ 조회 완료: ${unopenedEmailsFromAPI.length}개 미오픈 이메일 발견`, 'success');

    if (unopenedEmailsFromAPI.length === 0) {
      alert('✅ 모든 이메일이 오픈되었습니다!');
      log('✅ 미오픈 이메일 없음', 'success');
      return;
    }

    // 재발송 확인
    const confirmed = confirm(
      `📊 미오픈 이메일 재발송\n\n` +
      `MailerSend 미오픈: ${unopenedEmailsFromAPI.length}개\n\n` +
      `${unopenedEmailsFromAPI.length}개 이메일을 테이블에 추가하고 재발송하시겠습니까?`
    );

    if (!confirmed) {
      log('❌ 재발송 취소됨', 'info');
      return;
    }

    // 테이블 초기화
    tableBody.innerHTML = '';

    // MailerSend에서 가져온 미오픈 이메일을 테이블에 추가
    log(`📧 ${unopenedEmailsFromAPI.length}개 미오픈 이메일을 테이블에 추가 중...`, 'info');

    unopenedEmailsFromAPI.forEach(item => {
      addRow(
        '', // 카테고리 없음
        item.subject || '(제목 없음)',
        item.email,
        '미오픈 재발송', // 기본 내용
        '' // 이미지 URL 없음
      );
    });

    updateTotalCount();
    await saveTableData();

    log(`✅ ${unopenedEmailsFromAPI.length}개 이메일 테이블 추가 완료`, 'success');

    // 재발송 시작
    await saveSettings();

    // 테이블에서 모든 이메일 가져오기
    const emailsToResend = await getEmailList();

    if (emailsToResend.length === 0) {
      alert('재발송할 이메일이 없습니다.');
      log('❌ 재발송 이메일 없음', 'error');
      return;
    }

    // ⭐ 예약 발송 설정 가져오기 (datetime-local 형식)
    let scheduleSettings = null;

    if (startTimeInput.value && endTimeInput.value) {
      const startDateTime = new Date(startTimeInput.value);
      const endDateTime = new Date(endTimeInput.value);

      scheduleSettings = {
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        targetCount: emailsToResend.length
      };
    }

    const settings = {
      scheduleSettings: scheduleSettings
    };

    // 백그라운드로 전송
    chrome.runtime.sendMessage({
      action: 'startSending',
      emails: emailsToResend,
      settings: settings
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('메시지 전송 오류:', chrome.runtime.lastError);
      }
    });

    startBtn.disabled = true;
    stopBtn.disabled = false;

    log('='.repeat(50), 'info');
    log(`📧 미오픈 재발송 시작: ${emailsToResend.length}개`, 'info');
    if (scheduleSettings && scheduleSettings.startTime && scheduleSettings.endTime) {
      log(`📅 예약 발송 모드`, 'info');
    } else {
      log(`🚀 즉시 발송 모드`, 'info');
    }
    log('='.repeat(50), 'info');

  } catch (error) {
    log(`❌ 미오픈 조회 오류: ${error.message}`, 'error');
    alert(`미오픈 조회 실패:\n${error.message}\n\n트래킹 서버 URL과 날짜 형식을 확인해주세요.`);
  }
}

// 대기 함수
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// MailerSend 트래킹 통계 조회
const refreshTrackingBtn = document.getElementById('refreshTrackingBtn');
const trackingStats = document.getElementById('trackingStats');
const openRateSpan = document.getElementById('openRate');
const clickRateSpan = document.getElementById('clickRate');
const openStatsBtn = document.getElementById('openStatsBtn');

refreshTrackingBtn?.addEventListener('click', async () => {
  try {
    refreshTrackingBtn.disabled = true;
    refreshTrackingBtn.textContent = '조회 중...';

    // 오늘 날짜
    const today = new Date().toISOString().split('T')[0];

    // API로 통계 가져오기
    const stats = await getTodayStats();

    // 통계 표시
    trackingStats.style.display = 'block';
    openRateSpan.textContent = stats.open_rate || '0';
    clickRateSpan.textContent = stats.click_rate || '0';

    log(`📊 트래킹 통계: 오픈율 ${stats.open_rate}%, 클릭율 ${stats.click_rate}%`, 'info');

  } catch (error) {
    console.error('트래킹 통계 조회 오류:', error);
    alert('트래킹 통계 조회 실패. API 토큰을 확인해주세요.');
  } finally {
    refreshTrackingBtn.disabled = false;
    refreshTrackingBtn.textContent = '통계 새로고침';
  }
});

// 상세 통계 페이지 열기
openStatsBtn?.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('stats.html')
  });
  log('📊 상세 통계 페이지 열림', 'info');
});

// ========================================
// 실패한 이메일 관리 기능
// ========================================

const viewFailedBtn = document.getElementById('viewFailedBtn');
const retryFailedBtn = document.getElementById('retryFailedBtn');
const clearFailedBtn = document.getElementById('clearFailedBtn');
const failedEmailsContainer = document.getElementById('failedEmailsContainer');
const failedEmailsTableBody = document.getElementById('failedEmailsTableBody');

// 실패 목록 보기/숨기기
viewFailedBtn?.addEventListener('click', async () => {
  if (failedEmailsContainer.style.display === 'none') {
    await loadFailedEmails();
    failedEmailsContainer.style.display = 'block';
    viewFailedBtn.textContent = '📋 목록 숨기기';
  } else {
    failedEmailsContainer.style.display = 'none';
    viewFailedBtn.textContent = '📋 실패 목록 보기';
  }
});

// 실패한 이메일 목록 로드
async function loadFailedEmails() {
  try {
    const data = await chrome.storage.local.get(['failedEmails']);
    const failedEmails = data.failedEmails || [];

    failedEmailsTableBody.innerHTML = '';

    if (failedEmails.length === 0) {
      failedEmailsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">실패한 이메일이 없습니다</td></tr>';
      log('✅ 실패한 이메일 없음', 'success');
      return;
    }

    failedEmails.forEach(item => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #dee2e6';

      // 이메일
      const td1 = document.createElement('td');
      td1.style.padding = '8px';
      td1.textContent = item.email || '-';
      tr.appendChild(td1);

      // 제목
      const td2 = document.createElement('td');
      td2.style.padding = '8px';
      td2.textContent = (item.subject || '-').substring(0, 30) + (item.subject?.length > 30 ? '...' : '');
      tr.appendChild(td2);

      // 에러 원인
      const td3 = document.createElement('td');
      td3.style.padding = '8px';
      td3.style.color = '#dc3545';
      td3.textContent = getErrorCategory(item.error || '-');
      td3.title = item.error || '-'; // 전체 에러 메시지 툴팁
      tr.appendChild(td3);

      // 재시도 횟수
      const td4 = document.createElement('td');
      td4.style.padding = '8px';
      td4.style.textAlign = 'center';
      td4.innerHTML = `<span style="background: #dc3545; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">${item.retryCount || 0}/3</span>`;
      tr.appendChild(td4);

      // 마지막 시도
      const td5 = document.createElement('td');
      td5.style.padding = '8px';
      td5.style.fontSize = '11px';
      td5.style.color = '#6c757d';
      const lastAttempt = item.lastAttempt ? new Date(item.lastAttempt).toLocaleString('ko-KR') : '-';
      td5.textContent = lastAttempt;
      tr.appendChild(td5);

      failedEmailsTableBody.appendChild(tr);
    });

    log(`⚠️ 실패한 이메일: ${failedEmails.length}개`, 'warning');
  } catch (error) {
    console.error('실패 목록 로드 오류:', error);
    log('실패 목록 로드 실패', 'error');
  }
}

// 에러 카테고리 분류
function getErrorCategory(errorMessage) {
  if (!errorMessage || errorMessage === '-') return '알 수 없음';

  const msg = errorMessage.toLowerCase();

  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch')) {
    return '🌐 네트워크 오류';
  }
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('auth')) {
    return '🔐 인증 오류';
  }
  if (msg.includes('403') || msg.includes('forbidden')) {
    return '🚫 권한 오류';
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return '❓ 리소스 없음';
  }
  if (msg.includes('429') || msg.includes('rate limit')) {
    return '⏱️ 요청 제한 초과';
  }
  if (msg.includes('500') || msg.includes('internal server')) {
    return '🔥 서버 오류';
  }
  if (msg.includes('invalid email') || msg.includes('malformed')) {
    return '📧 잘못된 이메일';
  }
  if (msg.includes('quota') || msg.includes('limit exceeded')) {
    return '📊 할당량 초과';
  }
  if (msg.includes('attachment') || msg.includes('size')) {
    return '📎 첨부파일 오류';
  }

  return '⚠️ ' + errorMessage.substring(0, 20) + (errorMessage.length > 20 ? '...' : '');
}

// 실패 재발송
retryFailedBtn?.addEventListener('click', async () => {
  try {
    const data = await chrome.storage.local.get(['failedEmails']);
    const failedEmails = data.failedEmails || [];

    if (failedEmails.length === 0) {
      alert('재발송할 실패 이메일이 없습니다.');
      return;
    }

    const confirmed = confirm(
      `⚠️ 실패한 이메일 재발송\n\n` +
      `총 ${failedEmails.length}개의 실패한 이메일을 재발송하시겠습니까?\n\n` +
      `재발송 전에 에러 원인을 먼저 확인하는 것을 권장합니다.`
    );

    if (!confirmed) return;

    log(`🔄 실패 이메일 재발송 시작: ${failedEmails.length}개`, 'info');

    // 테이블에 추가
    tableBody.innerHTML = '';
    failedEmails.forEach(item => {
      addRow(item.category || '', item.subject, item.email, item.content, item.imageUrl || '');
    });

    updateTotalCount();
    await saveTableData();

    // 실패 목록 초기화
    await chrome.storage.local.set({ failedEmails: [] });
    await loadFailedEmails();

    log('✅ 실패 이메일이 테이블에 추가되었습니다. "발송 시작" 버튼을 클릭하세요.', 'success');

  } catch (error) {
    console.error('재발송 오류:', error);
    log('재발송 실패: ' + error.message, 'error');
  }
});

// 실패 목록 초기화
clearFailedBtn?.addEventListener('click', async () => {
  try {
    const data = await chrome.storage.local.get(['failedEmails']);
    const failedEmails = data.failedEmails || [];

    if (failedEmails.length === 0) {
      alert('삭제할 실패 이메일이 없습니다.');
      return;
    }

    const confirmed = confirm(
      `⚠️ 실패 목록 초기화\n\n` +
      `${failedEmails.length}개의 실패 기록을 모두 삭제하시겠습니까?\n\n` +
      `이 작업은 되돌릴 수 없습니다.`
    );

    if (!confirmed) return;

    await chrome.storage.local.set({ failedEmails: [] });
    await loadFailedEmails();

    log('🗑️ 실패 목록이 초기화되었습니다', 'info');

  } catch (error) {
    console.error('목록 초기화 오류:', error);
    log('초기화 실패: ' + error.message, 'error');
  }
});

// ========================================
// 카테고리 관리 기능
// ========================================

// 카테고리 추가 버튼 클릭
addCategoryBtn.addEventListener('click', async () => {
  const name = categoryName.value.trim();
  if (!name) {
    alert('카테고리 이름을 입력해주세요.');
    return;
  }

  // 중복 체크
  if (categories.includes(name)) {
    alert('이미 존재하는 카테고리입니다.');
    return;
  }

  categories.push(name);
  await saveCategories();
  renderCategoryList();
  categoryName.value = '';
  log(`✅ 카테고리 추가: ${name}`, 'success');
});

// 카테고리 목록 저장
async function saveCategories() {
  await chrome.storage.local.set({ categories });
  console.log('✅ 카테고리 저장:', categories);
}

// 카테고리 목록 로드
async function loadCategories() {
  const data = await chrome.storage.local.get(['categories']);
  if (data.categories) {
    categories = data.categories;
    console.log('📥 카테고리 로드:', categories);
    renderCategoryList();
  }
}

// 카테고리 목록 렌더링
function renderCategoryList() {
  categoryList.innerHTML = '';

  if (categories.length === 0) {
    categoryList.innerHTML = '<p style="color: #999; font-size: 12px; padding: 10px;">등록된 카테고리가 없습니다.</p>';
    return;
  }

  categories.forEach((name, index) => {
    const div = document.createElement('div');
    div.className = 'category-item';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';
    div.style.padding = '8px 12px';
    div.style.marginBottom = '8px';
    div.style.background = '#f8f9fa';
    div.style.borderRadius = '4px';
    div.style.border = '1px solid #dee2e6';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `📁 ${name}`;
    nameSpan.style.fontWeight = '500';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger';
    removeBtn.textContent = '삭제';
    removeBtn.style.fontSize = '12px';
    removeBtn.style.padding = '4px 10px';
    removeBtn.onclick = async () => {
      if (confirm(`카테고리 "${name}"을(를) 삭제하시겠습니까?`)) {
        categories.splice(index, 1);
        await saveCategories();
        renderCategoryList();
        log(`❌ 카테고리 삭제: ${name}`, 'warning');
      }
    };

    div.appendChild(nameSpan);
    div.appendChild(removeBtn);
    categoryList.appendChild(div);
  });
}

// ========================================
// 카테고리별 첨부파일 기능
// ========================================

// 파일 첨부 버튼 클릭
addAttachmentBtn.addEventListener('click', () => {
  if (categories.length === 0) {
    alert('먼저 카테고리를 추가해주세요.');
    return;
  }
  categoryFile.click();
});

// 파일명에서 카테고리 자동 매칭
function findCategoryFromFilename(filename) {
  // 파일명에서 확장자 제거
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;

  // 등록된 카테고리 중에서 파일명에 포함된 것 찾기
  for (const category of categories) {
    if (nameWithoutExt.includes(category)) {
      return category;
    }
  }

  return null; // 매칭 안됨
}

// 파일 선택 (여러 파일 업로드)
categoryFile.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  let successCount = 0;
  let failedCount = 0;
  const failedFiles = [];

  log(`📂 ${files.length}개 파일 처리 중...`, 'info');

  for (const file of files) {
    try {
      // 파일명에서 카테고리 자동 찾기
      const category = findCategoryFromFilename(file.name);

      if (!category) {
        failedFiles.push({ name: file.name, reason: '카테고리 매칭 실패' });
        failedCount++;
        continue;
      }

      // 파일을 ArrayBuffer로 읽기
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: file.type });

      // 카테고리 첨부파일 추가
      const categoryItem = {
        category: category,
        filename: file.name,
        file: blob,
        type: file.type,
        size: file.size
      };

      categoryAttachments.push(categoryItem);
      successCount++;
      log(`✅ "${category}" ← ${file.name}`, 'success');

    } catch (error) {
      console.error('파일 추가 오류:', file.name, error);
      failedFiles.push({ name: file.name, reason: error.message });
      failedCount++;
    }
  }

  // chrome.storage에 저장
  if (successCount > 0) {
    await saveCategoryAttachments();
    renderAttachmentList();
  }

  // 결과 요약
  log(`📊 업로드 완료: 성공 ${successCount}개, 실패 ${failedCount}개`, successCount > 0 ? 'success' : 'warning');

  if (failedFiles.length > 0) {
    log('⚠️ 실패한 파일:', 'warning');
    failedFiles.slice(0, 5).forEach(f => {
      log(`  - ${f.name}: ${f.reason}`, 'warning');
    });
    if (failedFiles.length > 5) {
      log(`  외 ${failedFiles.length - 5}개...`, 'warning');
    }
  }

  // 입력 초기화
  e.target.value = '';
});

// 카테고리 첨부파일 저장
async function saveCategoryAttachments() {
  try {
    // Blob을 Base64로 변환하여 저장
    const serializedAttachments = await Promise.all(
      categoryAttachments.map(async (item) => {
        const arrayBuffer = await item.file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        return {
          category: item.category,
          filename: item.filename,
          type: item.type,
          size: item.size,
          data: base64
        };
      })
    );

    await chrome.storage.local.set({ categoryAttachments: serializedAttachments });
    console.log('✅ 카테고리 첨부파일 저장 완료:', serializedAttachments.length, '개');
  } catch (error) {
    console.error('❌ 카테고리 첨부파일 저장 오류:', error);
  }
}

// 카테고리 첨부파일 로드
async function loadCategoryAttachments() {
  try {
    const data = await chrome.storage.local.get(['categoryAttachments']);
    if (data.categoryAttachments && data.categoryAttachments.length > 0) {
      // Base64를 Blob으로 복원
      categoryAttachments = data.categoryAttachments.map(item => {
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

      console.log('📥 카테고리 첨부파일 로드:', categoryAttachments.length, '개');
      renderAttachmentList();
    }
  } catch (error) {
    console.error('❌ 카테고리 첨부파일 로드 오류:', error);
  }
}

// 첨부파일 목록 렌더링
function renderAttachmentList() {
  attachmentList.innerHTML = '';

  if (categoryAttachments.length === 0) {
    attachmentList.innerHTML = '<p style="color: #999; font-size: 12px; padding: 10px;">첨부된 파일이 없습니다.</p>';
    return;
  }

  categoryAttachments.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'attachment-item';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';
    div.style.padding = '8px 12px';
    div.style.marginBottom = '8px';
    div.style.background = '#fff';
    div.style.borderRadius = '4px';
    div.style.border = '1px solid #dee2e6';

    const infoDiv = document.createElement('div');

    const categorySpan = document.createElement('div');
    categorySpan.textContent = `📁 ${item.category}`;
    categorySpan.style.fontWeight = '500';
    categorySpan.style.color = '#495057';
    categorySpan.style.marginBottom = '4px';

    const filenameSpan = document.createElement('div');
    filenameSpan.textContent = `📎 ${item.filename} (${(item.size / 1024).toFixed(1)} KB)`;
    filenameSpan.style.fontSize = '12px';
    filenameSpan.style.color = '#6c757d';

    infoDiv.appendChild(categorySpan);
    infoDiv.appendChild(filenameSpan);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger';
    removeBtn.textContent = '삭제';
    removeBtn.style.fontSize = '12px';
    removeBtn.style.padding = '4px 10px';
    removeBtn.onclick = async () => {
      if (confirm(`"${item.category}" 카테고리의 "${item.filename}"을(를) 삭제하시겠습니까?`)) {
        categoryAttachments.splice(index, 1);
        await saveCategoryAttachments();
        renderAttachmentList();
        log(`❌ 첨부파일 삭제: ${item.category} - ${item.filename}`, 'warning');
      }
    };

    div.appendChild(infoDiv);
    div.appendChild(removeBtn);
    attachmentList.appendChild(div);
  });
}

// ⭐ 분할 발송 정보 계산
function calculateSplitInfo() {
  const batchSize = parseInt(batchSizeInput.value) || 50;
  const timeIntervalHours = parseFloat(timeIntervalInput.value) || 1;
  const dailyLimit = parseInt(dailyLimitInput.value) || 300;
  const totalEmails = tableBody.querySelectorAll('tr').length;

  if (totalEmails === 0) {
    splitInfo.style.display = 'none';
    return;
  }

  // 시간 간격 (초)
  const timeIntervalSeconds = timeIntervalHours * 3600;
  const intervalPerEmail = Math.floor(timeIntervalSeconds / batchSize);

  // 예상 소요 시간 (시간)
  const totalDurationHours = (totalEmails * intervalPerEmail) / 3600;
  const durationText = totalDurationHours >= 1
    ? `${totalDurationHours.toFixed(1)}시간`
    : `${Math.ceil(totalDurationHours * 60)}분`;

  // 필요 일수 (9시-18시 = 9시간)
  const workingHoursPerDay = 9;
  const emailsPerDay = Math.min(dailyLimit, Math.floor((workingHoursPerDay * 3600) / intervalPerEmail));
  const requiredDays = Math.ceil(totalEmails / emailsPerDay);

  // UI 업데이트
  sendIntervalSpan.textContent = intervalPerEmail;
  splitDurationSpan.textContent = durationText;
  requiredDaysSpan.textContent = requiredDays;
  splitInfo.style.display = 'block';

  log(`📊 분할 발송 계산: ${totalEmails}개 이메일, ${intervalPerEmail}초 간격, ${requiredDays}일 필요`, 'info');
}

