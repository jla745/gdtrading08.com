# SPEC-YOUTUBE-PERF-001 수용 기준 (Acceptance Criteria)

## 1. 테스트 시나리오

### Scenario 1: Lazy Loading 동작 검증

**Given** 사용자가 GD TRADE 웹사이트에 접속할 때
**When** About 섹션이 뷰포트 밖에 위치해 있으면
**Then** YouTube iframe은 로드되지 않아야 한다
**And** 네트워크 탭에서 youtube.com 요청이 없어야 한다

```javascript
// 테스트 코드
test('YouTube iframe should not load when out of viewport', async () => {
    await page.goto('http://localhost:3000');

    // 스크롤 전 YouTube 요청 확인
    const youtubeRequests = [];
    page.on('request', req => {
        if (req.url().includes('youtube.com')) {
            youtubeRequests.push(req.url());
        }
    });

    await page.waitForTimeout(2000);
    expect(youtubeRequests.length).toBe(0);
});
```

---

### Scenario 2: 스크롤 시 로딩 시작 검증

**Given** 페이지가 로드된 상태에서
**When** 사용자가 About 섹션으로 스크롤하면
**Then** YouTube iframe이 로드되기 시작해야 한다
**And** 로딩 인디케이터가 표시되어야 한다

```javascript
// 테스트 코드
test('YouTube iframe should load when scrolled into viewport', async () => {
    await page.goto('http://localhost:3000');

    // About 섹션으로 스크롤
    await page.evaluate(() => {
        document.querySelector('#about').scrollIntoView();
    });

    // YouTube 요청 대기
    await page.waitForRequest(req => req.url().includes('youtube.com'));

    const iframe = await page.$('#youtube-iframe');
    expect(iframe).not.toBeNull();
});
```

---

### Scenario 3: 클릭 재생 검증

**Given** YouTube 동영상이 로드된 상태에서
**When** 사용자가 동영상 영역을 클릭하면
**Then** 동영상이 재생되어야 한다
**And** 재생 버튼 오버레이가 사라져야 한다

```javascript
// 테스트 코드
test('Video should play when clicked', async () => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        document.querySelector('#about').scrollIntoView();
    });

    await page.waitForSelector('#youtube-iframe');

    // 재생 버튼 클릭 (있는 경우)
    const playButton = await page.$('.youtube-play-overlay');
    if (playButton) {
        await playButton.click();
        await page.waitForTimeout(1000);

        // 오버레이 숨김 확인
        const isHidden = await page.$eval('.youtube-play-overlay',
            el => el.style.display === 'none');
        expect(isHidden).toBe(true);
    }
});
```

---

### Scenario 4: 타임아웃 폴백 검증

**Given** 느린 네트워크 환경에서
**When** YouTube 동영상 로딩이 5초를 초과하면
**Then** 폴백 콘텐츠가 표시되어야 한다
**And** 에러 메시지가 친절하게 안내되어야 한다

```javascript
// 테스트 코드
test('Fallback should show after 5s timeout', async () => {
    // 네트워크 지연 시뮬레이션
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (req.url().includes('youtube.com')) {
            // 요청 지연
            setTimeout(() => req.abort(), 6000);
        } else {
            req.continue();
        }
    });

    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        document.querySelector('#about').scrollIntoView();
    });

    // 5초 대기 후 폴백 확인
    await page.waitForTimeout(6000);

    const fallback = await page.$('.youtube-fallback');
    expect(fallback).not.toBeNull();
});
```

---

### Scenario 5: 성능 개선 검증

**Given** 성능 측정 도구로 테스트할 때
**When** 페이지 로드가 완료되면
**Then** YouTube 동영상 준비 시간이 3초 이내여야 한다
**And** 초기 페이지 로드에 YouTube가 영향을 주지 않아야 한다

```javascript
// 테스트 코드
test('Video ready time should be under 3 seconds', async () => {
    const startTime = Date.now();

    await page.goto('http://localhost:3000');

    // 페이지 로드 완료
    await page.waitForLoadState('domcontentloaded');
    const pageLoadTime = Date.now() - startTime;

    // About 섹션으로 스크롤
    await page.evaluate(() => {
        document.querySelector('#about').scrollIntoView();
    });

    const scrollTime = Date.now();

    // iframe 로드 대기
    await page.waitForSelector('#youtube-iframe[src*="youtube.com"]');
    const videoReadyTime = Date.now() - scrollTime;

    console.log(`Page load: ${pageLoadTime}ms, Video ready: ${videoReadyTime}ms`);

    expect(videoReadyTime).toBeLessThan(3000);
});
```

---

### Scenario 6: 모바일 반응형 검증

**Given** 모바일 기기에서 접속할 때
**When** About 섹션의 YouTube 동영상이 표시되면
**Then** 동영상이 화면 너비에 맞게 조절되어야 한다
**And** 터치로 재생이 가능해야 한다

```javascript
// 테스트 코드
test('Video should be responsive on mobile', async () => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('http://localhost:3000');

    await page.evaluate(() => {
        document.querySelector('#about').scrollIntoView();
    });

    await page.waitForSelector('#youtube-iframe');

    const iframeBox = await page.$eval('#youtube-iframe', el => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    });

    // 화면 너비의 90% 이내인지 확인
    expect(iframeBox.width).toBeLessThanOrEqual(375 * 0.9);
});
```

---

## 2. 수동 테스트 체크리스트

### 기능 테스트
- [ ] 페이지 로드 시 동영상이 자동 로드되지 않음
- [ ] About 섹션 스크롤 시 동영상 로드 시작
- [ ] 클릭/터치로 동영상 재생 가능
- [ ] 5초 타임아웃 후 폴백 표시
- [ ] 로딩 인디케이터가 즉시 사라짐

### 성능 테스트
- [ ] 초기 페이지 로드 시간 3초 이내
- [ ] 동영상 준비 시간 3초 이내
- [ ] Lighthouse 성능 점수 90 이상

### 호환성 테스트
- [ ] Chrome Desktop 정상 동작
- [ ] Chrome Mobile 정상 동작
- [ ] Firefox 정상 동작
- [ ] Safari 정상 동작
- [ ] Edge 정상 동작

### 접근성 테스트
- [ ] 키보드로 동영상 제어 가능
- [ ] 스크린 리더 호환성

---

## 3. 성능 메트릭 기준

| 메트릭 | 기준 | 측정 방법 |
|--------|------|-----------|
| 초기 로드 시간 | < 3초 | Lighthouse FCP |
| 동영상 준비 시간 | < 3초 | 스크롤 후 iframe 로드 완료 |
| 대역폭 절감 | > 30% | 네트워크 탭 비교 |
| 타임아웃 | 5초 | 코드 검사 |

---

## 4. 합격/불합격 기준

### 합격 조건 (모두 충족)
- 모든 자동화 테스트 통과
- 수동 테스트 체크리스트 100% 완료
- 성능 메트릭 모두 기준 충족
- 크로스 브라우저 테스트 통과

### 불합격 조건 (하나라도 해당)
- 동영상이 로드되지 않음
- 성능이 기존보다 저하됨
- 레이아웃 깨짐 발생
- 심각한 브라우저 호환성 문제
