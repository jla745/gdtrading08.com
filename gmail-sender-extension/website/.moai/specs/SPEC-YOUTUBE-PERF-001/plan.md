# SPEC-YOUTUBE-PERF-001 구현 계획

## 1. 구현 개요

### 1.1 목표
YouTube 동영상 로딩 성능을 80% 개선하여 13초 → 2-3초로 단축

### 1.2 수정 파일
- `website/index.html` (1개 파일)

### 1.3 예상 작업 시간
- 구현: 30분
- 테스트: 15분
- 총: 45분

---

## 2. 구현 단계

### Phase 1: iframe 속성 수정 (10분)

#### Task 1.1: Lazy Loading 적용
**위치**: `index.html:1637`

```html
<!-- 변경 전 -->
loading="eager"

<!-- 변경 후 -->
loading="lazy"
```

#### Task 1.2: Autoplay 제거
**위치**: `index.html:1633`

```html
<!-- 변경 전 -->
src="https://www.youtube.com/embed/_MxIiCA3cRs?rel=0&modestbranding=1&autohide=1&showinfo=0&controls=1&fs=1&autoplay=1&mute=1&loop=1&playlist=_MxIiCA3cRs"

<!-- 변경 후 -->
src="https://www.youtube.com/embed/_MxIiCA3cRs?rel=0&modestbranding=1&autohide=1&showinfo=0&controls=1&fs=1&loop=1&playlist=_MxIiCA3cRs"
```

---

### Phase 2: JavaScript 타임아웃 수정 (10분)

#### Task 2.1: 메인 타임아웃 단축
**위치**: `index.html:2071` (YouTubePolicyCompliantPlayer 클래스)

```javascript
// 변경 전
this.loadingTimeout = setTimeout(() => {
    // ...
}, 10000);

// 변경 후
this.loadingTimeout = setTimeout(() => {
    // ...
}, 5000);
```

#### Task 2.2: 로딩 인디케이터 지연 제거
**위치**: YouTubePolicyCompliantPlayer 클래스 내

```javascript
// 변경 전
setTimeout(() => this.hideLoading(), 3000);

// 변경 후 (즉시 실행)
this.hideLoading();
```

---

### Phase 3: 플레이 버튼 오버레이 추가 (10분)

#### Task 3.1: CSS 스타일 추가
```css
.youtube-play-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 68px;
    height: 48px;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.3s;
}

.youtube-play-overlay:hover {
    background: #ff0000;
}

.youtube-play-overlay::after {
    content: '';
    border-left: 18px solid white;
    border-top: 10px solid transparent;
    border-bottom: 10px solid transparent;
    margin-left: 4px;
}
```

#### Task 3.2: JavaScript 이벤트 핸들러
```javascript
// 클릭 시 동영상 재생
document.querySelector('.youtube-play-overlay').addEventListener('click', function() {
    const iframe = document.getElementById('youtube-iframe');
    const src = iframe.src;
    iframe.src = src + '&autoplay=1';
    this.style.display = 'none';
});
```

---

## 3. 테스트 계획

### 3.1 단위 테스트
- [ ] Lazy loading 속성 확인
- [ ] 타임아웃 값 검증 (5초)
- [ ] Autoplay 파라미터 제거 확인

### 3.2 통합 테스트
- [ ] 페이지 로드 후 동영상 섹션 스크롤 시 로딩 시작
- [ ] 재생 버튼 클릭 시 동영상 재생
- [ ] 느린 네트워크에서 5초 후 폴백 표시

### 3.3 성능 테스트
- [ ] Lighthouse 성능 점수 측정
- [ ] 초기 로드 시간 측정 (목표: 3초 이내)
- [ ] 대역폭 사용량 비교

### 3.4 브라우저 테스트
- [ ] Chrome (Desktop/Mobile)
- [ ] Firefox
- [ ] Safari
- [ ] Edge

---

## 4. 롤백 계획

### 4.1 롤백 조건
- 동영상이 전혀 로드되지 않는 경우
- 성능이 오히려 저하되는 경우
- 심각한 레이아웃 깨짐 발생 시

### 4.2 롤백 절차
```bash
git revert HEAD
# 또는
git checkout HEAD~1 -- website/index.html
```

---

## 5. 기술 의존성

### 5.1 브라우저 지원
| 기능 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|------|
| loading="lazy" | 77+ | 75+ | 15.4+ | 79+ |
| IntersectionObserver | 51+ | 55+ | 12.1+ | 15+ |

### 5.2 폴리필 (필요시)
```javascript
// Safari 15.4 미만 대응
if ('loading' in HTMLIFrameElement.prototype) {
    // 네이티브 지원
} else {
    // IntersectionObserver 폴백
}
```

---

## 6. 체크리스트

### 구현 전
- [ ] 현재 index.html 백업
- [ ] 기존 성능 측정 (베이스라인)

### 구현 중
- [ ] Phase 1 완료
- [ ] Phase 2 완료
- [ ] Phase 3 완료

### 구현 후
- [ ] 로컬 테스트 완료
- [ ] 성능 측정 비교
- [ ] 코드 리뷰
- [ ] 배포

---

## 7. 커밋 메시지 템플릿

```
perf(youtube): Improve video loading performance by 80%

- Apply lazy loading to YouTube iframe
- Reduce timeout from 10s to 5s
- Remove autoplay, add click-to-play
- Remove 3s loading indicator delay

SPEC: SPEC-YOUTUBE-PERF-001
```
