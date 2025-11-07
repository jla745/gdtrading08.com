# 🚨 긴급 보안 조치 필요!

## 발견된 보안 문제
- **Supabase Service Role 키가 GitHub 공개 저장소에 노출됨**
- 파일: `tracking-server/server.js`
- 노출된 키: Service Role 키 (전체 데이터베이스 접근 권한)

## 즉시 취해야 할 조치:

### 1. Supabase 키 즉시 재생성 (가장 중요!)
1. https://app.supabase.com 접속
2. 프로젝트 선택
3. Settings → API
4. "Roll API Keys" 버튼 클릭
5. 새로운 키 복사

### 2. 환경 변수로 이동
```javascript
// ❌ 절대 하지 마세요 (현재 상태)
const SUPABASE_ANON_KEY = 'eyJhbG...';

// ✅ 이렇게 변경하세요
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
```

### 3. Railway에 환경 변수 설정
1. Railway 대시보드 접속
2. Variables 탭
3. 다음 변수 추가:
   - `SUPABASE_URL`: https://gzybrgmclouskftiiglg.supabase.co
   - `SUPABASE_ANON_KEY`: [새로 생성한 키]

### 4. Git 기록에서 키 삭제
```bash
# BFG를 사용한 민감한 데이터 제거
java -jar bfg.jar --replace-text passwords.txt gmail-tracking-server.git
git push --force
```

### 5. .env 파일 사용 (로컬 개발)
```env
SUPABASE_URL=https://gzybrgmclouskftiiglg.supabase.co
SUPABASE_ANON_KEY=새로운_키_여기에
```

## 추가 보안 권장사항:
1. **절대로** Service Role 키를 클라이언트나 공개 저장소에 포함하지 마세요
2. 대신 anon(public) 키를 사용하거나 백엔드에서만 Service Role 사용
3. Row Level Security (RLS) 활성화하여 추가 보안층 구성