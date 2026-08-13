# bill-watch-feed

`bill-watch` 미니앱이 읽는 데이터 저장소. **사람이 직접 커밋하지 않는다** — GitHub
Actions(`.github/workflows/poll.yml`)가 열린국회정보 Open API를 6시간마다 조회해
여기에 커밋한다. 공개 저장소인 이유: 미니앱은 서버가 없는 정적 번들이라, 클라이언트가
인증 없이 `raw.githubusercontent.com` 으로 직접 fetch 해야 한다.

## 상태 (2026-08-13)

**실제 API 연동 완료, 로컬 실행으로 검증됨.** 열린국회정보 "의안정보 통합 API"
(서비스ID `nzmimeepazxkubdpn`)를 실제 인증키로 호출해 50건을 받아왔다 — 아래 스키마는
추측이 아니라 실물 응답으로 확정했다. 남은 건 **GitHub Actions 시크릿 등록**뿐이다.

## 스키마

### `bills/<의안ID>.json` — 의안 하나 = 파일 하나

같은 의안에 새 단계(위원회 심사 → 법사위 → 본회의 의결)가 생기면 **파일을 새로 만들지
않고 `events` 배열에 이어붙인다.**

```json
{
  "billId": "PRC_...",
  "title": "소득세법 일부개정법률안",
  "committee": "재정경제기획위원회",
  "proposer": "정성국의원 등 11인",
  "assemblyTerm": 22,
  "events": [
    { "date": "2026-08-10", "stage": "발의", "detail": "정성국의원 등 11인 발의", "sourceUrl": "http://likms..." }
  ]
}
```

`stage` 는 6단계: `발의` · `위원회상정` · `위원회심사` · `법사위상정` · `법사위심사` ·
`본회의의결`. 값이 없는 단계는 아직 안 지난 것 — "예정"으로 지어내지 않는다.
매핑 로직은 [`lib/stages.mjs`](./lib/stages.mjs), 실물 API 필드 대조표도 그 파일 주석에 있다.

### `index.json` — 최신 이벤트 피드 (미니앱 홈 화면용)

폴러가 매 실행마다 전체 이벤트를 다시 펼쳐서 최신순 100건으로 자른다.

## 폴링 전략

1. **최신 50건 조회** — 새로 발의된 의안을 잡는다 (최신순 정렬 확인됨)
2. **본회의 의결 전인 추적 중 의안을 `BILL_ID`로 재조회** — 안 그러면 "최신 50건" 창을
   벗어난 의안은 위원회 심사·법사위·본회의 단계를 영영 못 본다

## 개발

```bash
npm test          # lib/stages.mjs 순수함수 5케이스 (node:test, 의존성 없음)
npm run mock       # 목데이터로 index.json/bills/*.json 생성 (오프라인)
ASSEMBLY_API_KEY=xxx npm run poll   # 실제 API 호출
```

## 아직 안 된 것

- [ ] **GitHub Actions 시크릿 `ASSEMBLY_API_KEY` 등록** — 저장소 Settings → Secrets
      → Actions. 등록 전까지 `poll.yml`은 6시간마다 실패만 한다(빈 시크릿으로 종료코드 1).
- [ ] 커밋된 첫 데이터 push — 지금 `bills/`·`index.json`은 로컬 실행 결과만 있고
      아직 원격에 없다.
- [ ] 위원회 회부 단계(`COMMITTEE_DT`)는 API 응답에서 항상 null 이었다 — 실제로
      쓰이는 필드인지, 아니면 다른 필드로 위원회 회부를 잡아야 하는지 더 지켜봐야 한다.
