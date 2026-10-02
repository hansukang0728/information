# 아기 낱말카드

18개월 이상 아이를 위한 한국어 낱말카드 웹앱입니다. **안드로이드 앱(APK)** 으로 설치하거나, 브라우저에서 웹으로 쓸 수 있습니다. 인터넷 없이 동작합니다.

## 기능
- **카드 보기**: 큰 그림 + 낱말. 카드를 누르면 읽어주고(예: "강아지. 멍멍!") 통통 튑니다. 좌우로 밀거나 ◀ ▶ 버튼으로 넘깁니다.
- **찾기 놀이**: "사과 어디 있어?"라고 물어보고 그림 중에서 고르게 합니다. 맞히면 칭찬 효과, 틀리면 혼내지 않고 "이건 딸기야"라고 이름을 알려줍니다.
- **주제 7가지, 낱말 60개**: 동물, 과일, 먹을 것, 탈것, 몸, 물건, 자연 (+ 모두 섞기)
- **부모 설정**: 톱니바퀴를 1.5초 **길게 눌러야** 열립니다 (아이가 실수로 못 열게). 자동 읽기, 의성어, 글자 표시, 순서 섞기, 찾기 놀이 그림 수(2~4개), 읽는 속도.
- 아이 손에 맞춘 처리: 큰 버튼, 두 번 탭 확대·당겨서 새로고침·길게 눌러 메뉴 막기, 다크 모드, 움직임 줄이기 설정 존중.

## 안드로이드 앱

### APK 받기 (가장 쉬운 방법)
빌드는 GitHub Actions가 자동으로 합니다. 컴퓨터에 안드로이드 스튜디오가 없어도 됩니다.

1. `wordcards/` 폴더가 바뀌어 푸시되면 **Actions → 낱말카드 안드로이드 빌드** 가 실행됩니다.
2. 실행 결과 화면 아래 **Artifacts → wordcards-android** 를 받아 압축을 풀면 `wordcards-debug.apk` 가 있습니다.
3. 빌드가 끝나면 `package.json` 의 version 이름(예: `wordcards-v1.0.0`)으로 **Releases** 에 APK가 올라가서 폰 브라우저로 받을 수 있습니다. 새 버전을 내려면 `package.json` 의 `version` 을 올려 푸시하세요. (`wordcards-v*` 태그를 직접 푸시해도 됩니다.)
4. 폰에서 APK를 열고 "출처를 알 수 없는 앱 설치"를 허용하면 설치됩니다.
5. 새 버전은 그냥 덮어 설치하면 됩니다. 테스트용 서명 키(`android/keystore/debug.jks`)를 저장소에 고정해 두었기 때문입니다. 이 키를 바꾸면 기존 설치본 위에 설치가 안 되고("앱이 설치되지 않음") 지우고 다시 깔아야 합니다.

> 아이에게 줄 때는 안드로이드의 **앱 고정(화면 고정)** 기능을 켜 두면 아이가 앱 밖으로 나가지 못합니다. (설정 → 보안 → 앱 고정)

### 앱에서 달라지는 점
- 음성: 안드로이드 WebView는 브라우저 음성 기능을 지원하지 않아 **기기의 TTS 엔진**을 씁니다. 소리가 안 나면 설정 → 일반 → 텍스트 음성 변환에서 **Google 음성 엔진**과 **한국어 음성 데이터**를 설치하세요.
- 뒤로 가기 버튼: 설정창 닫기 → 홈으로 → 홈에서는 앱을 끄지 않고 뒤로 보내기만 합니다.
- 인터넷 권한이 없습니다. 모든 파일이 앱 안에 들어 있습니다.

### 직접 빌드하기 (안드로이드 스튜디오가 있을 때)
Node.js 22 이상, JDK 21, Android SDK 가 필요합니다.
```bash
cd wordcards
npm install
npx cap sync android     # www/ 의 웹 파일을 앱으로 복사
npx cap open android     # 안드로이드 스튜디오에서 열어 실행
# 또는 명령어로: npm run apk  → android/app/build/outputs/apk/debug/app-debug.apk
```
`www/` 를 고친 뒤에는 항상 `npx cap sync android` 를 다시 해야 앱에 반영됩니다.

### 사진
- 낱말 사진은 `www/photos/<이름>.jpg` 이고, 출처는 `www/photos/CREDITS.md` 와 앱의 부모 설정 → 사진 출처 보기에 있습니다. 모두 위키미디어 공용의 자유 라이선스(CC0·퍼블릭 도메인·CC BY·CC BY-SA) 사진입니다.
- 사진을 바꾸려면 같은 이름의 정사각형 JPG로 덮어쓰면 됩니다(640×640 권장). 사진 파일이 없으면 이모지로 보입니다.
- 위키미디어에서 다시 고르려면: `photos/queries.json` 의 검색어를 고치고 `photos/selection.json` 에서 그 낱말을 지운 뒤 푸시하면 **낱말카드 사진 가져오기** 워크플로우가 후보 미리보기를 `photos/candidates/` 에 커밋합니다. 고른 파일 제목을 `selection.json` 에 적고 다시 푸시하면 사진을 받아 `www/photos/` 에 넣습니다.

### 아이콘 바꾸기
`assets/` 의 PNG(icon-only, icon-foreground, icon-background, splash, splash-dark)를 바꾸고 `npm run icons` 를 실행하세요.

### 플레이 스토어에 올리려면
1. 서명 키를 한 번 만들고 **안전하게 보관**하세요 (잃어버리면 앱 업데이트 불가).
   ```bash
   keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias wordcards
   base64 -w0 release.jks   # 출력된 문자열을 복사
   ```
2. GitHub 저장소 Settings → Secrets and variables → Actions 에 `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`(wordcards), `KEY_PASSWORD` 를 등록하면 다음 빌드부터 `wordcards-release.aab` 가 함께 만들어집니다.
3. Google Play Console(등록비 25달러)에서 AAB를 올립니다. 아이 대상 앱은 **가족 정책**(타깃 연령 설정, 개인정보처리방침 URL 등) 심사가 있습니다. 이 앱은 광고·데이터 수집·인터넷 사용이 없어 심사에 유리합니다.

## 웹으로 실행
```bash
cd wordcards
python3 -m http.server 8080 -d www
# 브라우저에서 http://localhost:8080
```
GitHub Pages, Netlify 등에 `www/` 폴더를 올리면 웹으로도 쓸 수 있습니다. (음성·오프라인 기능은 https 또는 localhost 에서만 동작)

## 구조
```
www/                  웹 화면 (앱과 웹이 같이 씀)
  index.html          화면 (홈 / 카드 / 찾기 놀이 / 부모 설정)
  style.css           디자인
  app.js              동작 (음성, 넘기기, 퀴즈, 설정, 안드로이드 뒤로 가기)
  words.js            낱말 데이터 ← 낱말을 추가·수정하려면 여기만 고치면 됩니다
  sw.js               오프라인 저장 (웹 전용)
android/              안드로이드 프로젝트 (Capacitor 로 생성)
assets/               앱 아이콘·시작 화면 원본
capacitor.config.json 앱 이름·패키지 이름(com.hansukang.wordcards)
```

## 참고 / 다음 단계 아이디어
- 음성은 기기에 내장된 한국어 TTS를 씁니다. 기기마다 목소리가 다르고, 한국어 음성이 없는 기기에서는 소리가 나지 않을 수 있습니다. 더 자연스럽게 하려면 부모님 목소리 녹음 기능이나 미리 녹음한 mp3를 넣는 방법이 있습니다.
- 우리 아이 사진·가족 사진으로 "엄마", "아빠", 아이 이름 카드 만들기

