---
id: SPEC-YOUTUBE-PERF-001
version: 1.0.0
status: draft
created: 2025-11-28
updated: 2025-11-28
author: Alfred
priority: high
---

# HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-28 | Alfred | Initial SPEC creation |

---

# SPEC-YOUTUBE-PERF-001: YouTube 동영상 로딩 성능 개선

## 1. 개요

### 1.1 목적
GD TRADE 웹사이트의 YouTube 동영상 로딩 성능을 개선하여 초기 페이지 로드 시간을 80% 단축하고 사용자 경험을 향상시킨다.

### 1.2 범위
- 파일: `website/index.html`
- 대상: YouTube iframe 및 YouTubePolicyCompliantPlayer 클래스
- 영향: About 섹션의 YouTube Shorts 동영상

### 1.3 현재 상태 분석
- **현재 로딩 방식**: `loading="eager"` (즉시 로딩)
- **타임아웃**: 10초 대기
- **추가 지연**: 로딩 인디케이터 3초 지연
- **총 대기 시간**: 약 13초
- **Autoplay**: 활성화 (불필요한 대역폭 소비)

---

## 2. 요구사항 (EARS 형식)

### 2.1 기능적 요구사항 (Functional Requirements)

#### FR-001: Lazy Loading 적용 (MUST)
**Ubiquitous**: 시스템은 YouTube iframe에 `loading="lazy"` 속성을 적용하여 뷰포트에 진입할 때만 동영상을 로드해야 한다.

```html
<!-- 변경 전 -->
<iframe loading="eager">

<!-- 변경 후 -->
<iframe loading="lazy">
```

#### FR-002: 타임아웃 단축 (MUST)
**Event-Driven**: WHEN YouTubePolicyCompliantPlayer가 초기화될 때, THEN 로딩 타임아웃은 5초 이하로 설정되어야 한다.

```javascript
// 변경 전
setTimeout(() => { }, 10000);

// 변경 후
setTimeout(() => { }, 5000);
```

#### FR-003: Autoplay 제거 및 클릭 재생 (MUST)
**Event-Driven**: WHEN 사용자가 동영상 영역을 클릭할 때, THEN 동영상이 재생되어야 한다.

```html
<!-- 변경 전 -->
src="...&autoplay=1&mute=1..."

<!-- 변경 후 -->
src="...&autoplay=0..."
```

#### FR-004: 로딩 지연 제거 (MUST)
**Unwanted**: IF 동영상이 로드 완료되면, THEN 3초 추가 지연 없이 즉시 로딩 인디케이터를 숨겨야 한다.

### 2.2 비기능적 요구사항 (Non-Functional Requirements)

#### NFR-001: 성능 목표 (SHOULD)
**State-Driven**: WHILE 페이지가 로드되는 동안, 시스템은 YouTube 동영상 준비 시간을 3초 이내로 유지해야 한다.

#### NFR-002: 대역폭 절감 (SHOULD)
**Ubiquitous**: 시스템은 초기 페이지 로드 시 동영상 관련 대역폭 사용량을 30% 이상 감소시켜야 한다.

#### NFR-003: 모바일 호환성 (SHOULD)
**Ubiquitous**: 시스템은 모바일 기기에서도 동일한 성능 개선 효과를 제공해야 한다.

### 2.3 인터페이스 요구사항 (Interface Requirements)

#### IR-001: 썸네일 플레이스홀더 (SHALL)
**Optional**: WHERE 동영상이 로드되기 전, 시스템은 YouTube 썸네일 이미지를 플레이스홀더로 표시할 수 있다.

#### IR-002: 재생 버튼 오버레이 (SHALL)
**Event-Driven**: WHEN 동영상이 일시정지 상태일 때, THEN 재생 버튼 오버레이를 표시해야 한다.

### 2.4 설계 제약사항 (Design Constraints)

#### DC-001: YouTube 정책 준수 (MUST)
**Ubiquitous**: 시스템은 YouTube의 임베드 정책 및 API 사용 가이드라인을 준수해야 한다.

#### DC-002: 기존 레이아웃 유지 (MUST)
**Ubiquitous**: 시스템은 기존 About 섹션의 레이아웃과 반응형 디자인을 유지해야 한다.

#### DC-003: 브라우저 호환성 (MUST)
**Ubiquitous**: 시스템은 Chrome, Firefox, Safari, Edge 최신 버전을 지원해야 한다.

---

## 3. 기술 사양

### 3.1 수정 대상 파일
- `website/index.html` (라인 1627-1665, 2026-2103)

### 3.2 의존성
- YouTube IFrame API
- 기존 CSS 스타일 (라인 1015-1160)

### 3.3 성능 지표

| 지표 | 현재 | 목표 | 개선율 |
|------|------|------|--------|
| 초기 로드 시간 | 13초 | 2-3초 | 80% |
| 대역폭 사용량 | 100% | 60-70% | 30-40% |
| 타임아웃 대기 | 10초 | 5초 | 50% |

---

## 4. 수용 기준 (Acceptance Criteria)

### AC-001: Lazy Loading 검증
**Given** 페이지가 로드될 때
**When** YouTube 동영상 섹션이 뷰포트 밖에 있으면
**Then** iframe이 로드되지 않아야 한다

### AC-002: 클릭 재생 검증
**Given** 동영상이 로드된 상태에서
**When** 사용자가 동영상 영역을 클릭하면
**Then** 동영상이 재생되어야 한다

### AC-003: 타임아웃 검증
**Given** 느린 네트워크 환경에서
**When** 동영상 로딩이 5초를 초과하면
**Then** 폴백 콘텐츠가 표시되어야 한다

### AC-004: 성능 측정
**Given** 성능 테스트 도구로 측정할 때
**When** 페이지 로드 완료 시
**Then** 동영상 준비 시간이 3초 이내여야 한다

---

## 5. 참고 자료

### 5.1 관련 파일
- `/website/youtube-video-test.js` - 기존 테스트 스크립트
- `/website/test-youtube-playwright.js` - Playwright 테스트

### 5.2 외부 문서
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [Web.dev Lazy Loading](https://web.dev/lazy-loading/)
