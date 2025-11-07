# 환경변수 설정 가이드

## 1. Supabase 키 재생성 (긴급!)

### 1.1 키 재생성
1. https://app.supabase.com 접속
2. 프로젝트 선택
3. **Settings → API** 이동
4. **"Roll API Keys"** 버튼 클릭
5. **anon (public)** 키 복사 (service_role 키는 사용하지 마세요!)

### 1.2 키 종류 구분
- **anon (public) key**: 클라이언트에서 사용 가능 (RLS 필요)
- **service_role key**: 서버에서만 사용 (전체 권한, 매우 위험!)

## 2. Railway 환경변수 설정

### 2.1 Railway 대시보드 접속
1. https://railway.app 로그인
2. 프로젝트 선택 (gdtrading08com)
3. **Variables** 탭 클릭

### 2.2 환경변수 추가
다음 변수들을 추가하세요:

```env
# Supabase 설정 (필수)
SUPABASE_URL=https://gzybrgmclouskftiiglg.supabase.co
SUPABASE_ANON_KEY=[새로 생성한 anon key 여기에 붙여넣기]

# Vercel 수신거부 페이지 URL (Vercel 배포 후 설정)
UNSUBSCRIBE_URL=https://[your-project].vercel.app/unsubscribe.html

# 서버 설정 (선택사항)
NODE_ENV=production
PORT=3000
```

### 2.3 변수 저장
1. 각 변수를 입력 후 **Add** 클릭
2. 모든 변수 추가 완료 후 자동으로 재배포됨

## 3. Vercel 배포 설정

### 3.1 Vercel 프로젝트 생성
1. https://vercel.com 접속
2. **New Project** 클릭
3. GitHub 저장소 Import: `jla745/gmail-tracking-server`
4. **Root Directory**: `gmail-sender-extension/website` 설정
5. **Framework Preset**: Other (정적 HTML)
6. **Deploy** 클릭

### 3.2 배포 URL 확인
- 배포 완료 후 URL 확인 (예: `gmail-tracking-xxx.vercel.app`)
- 이 URL을 Railway의 `UNSUBSCRIBE_URL` 환경변수에 설정

## 4. 로컬 개발 환경 설정

### 4.1 .env 파일 생성
`tracking-server/.env` 파일 생성:

```env
# 로컬 개발용 환경변수
SUPABASE_URL=https://gzybrgmclouskftiiglg.supabase.co
SUPABASE_ANON_KEY=your_new_anon_key_here
UNSUBSCRIBE_URL=https://your-project.vercel.app/unsubscribe.html
NODE_ENV=development
PORT=3000
```

### 4.2 .gitignore에 추가
```gitignore
.env
.env.local
*.env
```

## 5. 보안 체크리스트

### ✅ 필수 확인 사항
- [ ] Supabase 키 재생성 완료
- [ ] Railway 환경변수 설정 완료
- [ ] Vercel 배포 완료
- [ ] .env 파일이 .gitignore에 포함됨
- [ ] 소스 코드에 하드코딩된 키 없음
- [ ] Git 히스토리 정리 (필요시)

### ⚠️ 주의사항
1. **절대** service_role 키를 클라이언트나 공개 저장소에 포함하지 마세요
2. 환경변수는 Railway 대시보드에서만 설정하세요
3. 로컬 .env 파일은 절대 commit하지 마세요

## 6. 테스트

### 6.1 수신거부 페이지 테스트
```bash
# Vercel URL 직접 테스트
curl https://your-project.vercel.app/unsubscribe.html?email=test@example.com

# Railway 서버 리다이렉트 테스트
curl -I https://gdtrading08com-production.up.railway.app/unsubscribe?email=test@example.com
```

### 6.2 API 테스트
```bash
# 수신거부 API 테스트
curl -X POST https://gdtrading08com-production.up.railway.app/api/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## 7. 문제 해결

### Railway 서버가 시작되지 않는 경우
- Variables 탭에서 환경변수가 올바르게 설정되었는지 확인
- Logs 탭에서 에러 메시지 확인

### Vercel 배포 실패하는 경우
- Root Directory가 `gmail-sender-extension/website`로 설정되었는지 확인
- Build 설정이 비어있는지 확인 (정적 HTML은 빌드 불필요)

### 수신거부가 작동하지 않는 경우
- Supabase 대시보드에서 unsubscribed 테이블 확인
- Railway 로그에서 API 호출 확인