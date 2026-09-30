# 주변 찾기 (카카오맵 안드로이드 앱)

내 위치 주변의 가게를 업종별로 찾아 지도와 목록으로 보여주는 안드로이드 앱입니다.

- 카카오맵 SDK v2로 지도 표시
- 카카오 로컬 API로 업종(카테고리) 검색과 키워드 검색 (거리순, 최대 45곳)
- 검색 결과를 지도 마커 + 목록으로 표시, 마커/목록을 누르면 서로 연동
- 지도를 옮기면 "이 지역에서 다시 검색" 버튼 표시
- 목록에서 전화 걸기, 카카오맵 상세 페이지 열기

## 준비물
- Android Studio (최신 버전)
- 카카오 개발자 계정 (https://developers.kakao.com)
- 안드로이드 폰 (에뮬레이터도 되지만 위치는 폰이 편합니다)

## 1. 카카오 개발자 콘솔 설정
1. **내 애플리케이션 → 애플리케이션 추가하기**로 앱을 만듭니다.
2. **앱 키** 화면에서 **네이티브 앱 키**와 **REST API 키**를 복사해 둡니다.
3. **플랫폼 → Android 플랫폼 등록**
   - 패키지명: `kr.nearby.app`
   - 키 해시: 아래 "키 해시 확인" 참고
4. **카카오맵 → 사용 설정 ON** (제품 설정 메뉴 안에 있습니다. 이걸 켜지 않으면 지도가 안 뜨고 검색은 403 오류가 납니다)

## 2. 프로젝트 열기와 키 넣기
1. Android Studio에서 **Open**으로 이 폴더(`kakao-map-app`)를 엽니다.
2. `local.properties.example`을 복사해 `local.properties`를 만들고 키를 채웁니다.
   ```
   KAKAO_NATIVE_APP_KEY=네이티브_앱_키
   KAKAO_REST_API_KEY=REST_API_키
   ```
   (Android Studio가 `sdk.dir=...` 줄을 자동으로 추가해 줍니다. 그대로 두면 됩니다.)
3. Gradle 동기화가 끝나면 폰을 연결하고 ▶ 실행합니다.

`local.properties`는 `.gitignore`에 들어 있어 git에 올라가지 않습니다.

## 3. 키 해시 확인
앱을 한 번 실행하면 Logcat에 `키 해시: xxxx=` 형식으로 출력됩니다 (태그 `Nearby`).
지도가 안 뜰 때 나오는 오류 창에도 표시됩니다. 그 값을 카카오 콘솔의 Android 플랫폼에 등록하세요.

디버그 빌드와 릴리스 빌드는 키 해시가 다르니, 출시할 때는 릴리스 키 해시도 등록해야 합니다.

## Android Studio 없이 GitHub에서 빌드하기
저장소의 **Actions** 탭에서 APK를 만들어 폰에 바로 설치할 수 있습니다.

1. **"1. 서명 키 만들기"** 워크플로를 한 번 실행합니다. 실행 결과 Summary에 나오는 안내대로
   Secrets 4개(`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KAKAO_NATIVE_APP_KEY`, `KAKAO_REST_API_KEY`)를 등록하고,
   거기에 나오는 **키 해시**를 카카오 콘솔의 Android 플랫폼에 등록합니다.
2. **"2. APK 빌드·배포"** 워크플로를 실행하면 Artifacts에 `nearby-apk`가 생깁니다.
   `v1.0.0` 같은 태그를 push하면 **Releases** 페이지에 APK가 올라갑니다.
3. 폰에서 Releases 페이지를 열어 `nearby.apk`를 내려받고 설치합니다.
   ("출처를 알 수 없는 앱" 허용이 필요합니다.)

## 구조
```
app/src/main/java/kr/nearby/app/
  App.kt             카카오맵 SDK 초기화
  MainActivity.kt    지도, 검색, 위치, 목록 연동
  KakaoLocalApi.kt   카카오 로컬 API 호출 (카테고리/키워드, 3페이지 합치기)
  Place.kt           데이터 모델, 업종 코드 목록
  PlaceAdapter.kt    결과 목록
  MarkerBitmaps.kt   마커 이미지를 코드로 그림
app/src/main/res/layout/
  activity_main.xml  검색창 + 업종 칩 + 지도 + 목록
  item_place.xml     목록 한 줄
```

업종을 추가하려면 `Place.kt`의 `CATEGORIES`에 코드를 넣으면 됩니다. 카카오가 제공하는 카테고리 코드 목록은
https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-category-request-category-group-code 에 있습니다.

## 자주 생기는 문제
| 증상 | 원인 |
|---|---|
| 지도가 회색/빈 화면, 오류 창 | 네이티브 앱 키 오류, 키 해시·패키지명 미등록, 카카오맵 사용 설정 OFF |
| 검색 오류 401 | REST API 키 오류 |
| 검색 오류 403 (`OPEN_MAP_AND_LOCAL`) | 카카오맵 사용 설정 OFF |
| 검색 오류 429 | 하루 호출 한도 초과 |
| 서울시청 기준으로 검색됨 | 위치 권한 거부 또는 GPS 꺼짐 |

## 주의
- REST API 키가 앱 안에 들어가므로 APK를 분해하면 키가 보입니다. 개인용·테스트용으로는 괜찮지만,
  스토어에 출시한다면 서버를 하나 두고 서버가 카카오 API를 대신 호출하도록 바꾸는 것이 안전합니다.
- 이 프로젝트는 인터넷이 막힌 환경에서 작성되어 실제 빌드를 거치지 않았습니다. Android Studio에서 처음 열 때
  카카오맵 SDK 버전(`app/build.gradle.kts`의 `com.kakao.maps.open:android`)이 오래됐다는 안내가 나오면
  https://apis.map.kakao.com/android_v2/ 의 최신 버전으로 올리세요. 컴파일 오류가 나면 오류 메시지를 그대로 알려주시면 고쳐 드립니다.
