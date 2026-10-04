# 작은 완료 배포 실패 테스트

IRIS 오류 진단 Agent에 **실제 배포 실패 로그와 배포한 소스**를 전달하기 위한 작은 할 일 웹 앱입니다. 현재 제공하는 프로젝트에는 Docker 이미지 패키징 오류가 남아 있습니다. 별도 오류 옵션 없이 **기본 Dockerfile로 빌드한 컨테이너가 시작 직후 실패**합니다.

## 재현할 상황

| 단계 | 예상 결과 |
| --- | --- |
| 로컬에서 `npm start` | 정상 실행. 저장소에 초기 데이터 파일이 있음 |
| 기본 Dockerfile로 이미지 빌드 | 성공. JavaScript와 화면 파일 복사 완료 |
| 해당 이미지로 컨테이너 시작 | 실패. 초기 데이터 파일을 찾지 못해 종료 코드 1 |
| 서버 상태 확인 | 서버가 열리기 전에 종료되어 `/healthz`에 응답할 수 없음 |
| 진단 후 파일 복사 설정을 수정하고 재배포 | 정상 기동과 할 일 목록 확인 |

이는 **이미지 빌드 성공 후 발생하는 런타임 시작 실패** 시나리오입니다. 로그의 대표 메시지는 다음과 같습니다.

```text
[startup-error] Error: ENOENT: no such file or directory, open '/app/data/tasks.json'
```

오류를 만들기 위한 환경변수·수동 throw·별도 실패 실행기는 없습니다. 앱은 실제로 `data/tasks.json`을 읽어 초기 할 일을 만듭니다. 코드 파일과 데이터 파일은 저장소에 모두 있지만, 기본 Dockerfile이 데이터 디렉터리를 이미지에 복사하지 않아 실패합니다.

## IRIS에 배포하는 방법

1. 이 폴더의 내용을 프로젝트 저장소 **루트**에 올립니다. `Dockerfile`, `package.json`, `src/`, `public/`, `data/`가 같은 루트에 있어야 합니다.
2. IRIS에서 이 저장소의 **기존 Dockerfile을 사용하는 빌드 경로**를 선택합니다.
3. 프로젝트 루트는 `.`, 서비스 포트는 `3000`, 상태 확인 경로는 `/healthz`입니다.
4. 별도 오류 환경변수 없이 그대로 배포합니다.
5. 컨테이너가 시작에 실패하면 실제 배포 로그와 해당 배포 소스를 오류 진단 Agent에 전달합니다.

**Dockerfile을 무시하고 전체 저장소를 자동으로 복사하는 빌더를 사용하면 이 오류가 재현되지 않을 수 있습니다.** 로컬 `npm start` 역시 배포 실패를 재현하는 명령이 아닙니다. IRIS에서 최종 상태를 FAILED 등으로 바꾸는 시점은 플랫폼의 재시도·상태 확인 정책에 따라 달라집니다.

## 로컬 Docker에서 같은 실패 확인

프로젝트 루트에서 Docker 엔진이 실행 중인 상태로 실행합니다.

```bash
docker build -t iris-demo-web:broken .
docker run --rm iris-demo-web:broken
```

첫 명령은 성공하고 두 번째 명령은 ENOENT 로그와 함께 종료 코드 1을 반환해야 합니다. macOS/Linux에서는 직후 `echo $?`로 확인할 수 있습니다. 서버가 열리기 전에 실패하므로 포트를 공개할 필요가 없습니다.

`npm run fixtures`는 위에서 빌드한 `iris-demo-web:broken` 컨테이너를 한 번 실행하여 실제 로그와 Agent 요청 예제를 갱신합니다. 외부 모델은 호출하지 않습니다.

```bash
npm run fixtures
```

## 진단에서 확인할 근거

- 로그: `/app/data/tasks.json`을 열 수 없다는 ENOENT와 `src/tasks.js` 호출 위치.
- 소스: `src/tasks.js`는 시작 시 `../data/tasks.json`을 실제로 읽음.
- 저장소: `data/tasks.json`이 존재하고 정상 JSON 배열을 포함함.
- 빌드 설정: Dockerfile의 COPY에는 package.json, src, public만 있고 data가 없음.

로그만으로는 “실행 환경에 필요한 파일이 없다”는 범위를 확인할 수 있습니다. Dockerfile의 복사 누락을 특정하려면 소스·이미지 구성을 함께 확인해야 합니다.

## 수정 후 재배포

**시연 전에는 이 수정 사항을 기본 Dockerfile에 적용하지 않습니다.** 실패를 진단한 뒤 Dockerfile의 기존 COPY 줄들 아래에 다음 한 줄을 추가합니다.

```dockerfile
COPY --chown=node:node data ./data
```

수정한 이미지로 다시 빌드하고 실행합니다.

```bash
docker build -t iris-demo-web:fixed .
docker run --rm -p 127.0.0.1:3101:3000 iris-demo-web:fixed
```

다른 터미널에서 확인합니다.

```bash
curl http://127.0.0.1:3101/healthz
curl http://127.0.0.1:3101/api/tasks
```

복구 기준은 `/healthz`의 HTTP 200·status=ok, `/api/tasks`의 HTTP 200·초기 할 일 3개, 웹 화면에서 할 일 추가·완료·삭제가 가능한 상태입니다. IRIS에서는 같은 소스 수정을 커밋한 뒤 새 배포를 실행해 확인합니다. Agent가 수정이나 재배포를 자동 실행하는 것은 아닙니다.

## Agent 요청 예제

`examples/deployment-error.log`는 기본 이미지에서 수집한 Docker 시작 실패 로그입니다. `examples/deployment-error.request.json`은 이 로그를 백엔드의 `success/message/data` 규격으로 감싼 예제입니다. 배포 식별자는 가상 값이고, 로그의 `failedStage`는 `runtime`입니다.

Agent API가 별도로 실행 중이면 다음과 같이 호출할 수 있습니다. 실제 LLM 사용량이 발생할 수 있으며, 서비스 키와 주소는 Agent 환경에 맞춥니다.

```bash
curl -X POST 'http://127.0.0.1:8001/diagnose' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: REPLACE_WITH_AGENT_API_KEY' \
  --data-binary '@examples/deployment-error.request.json'
```

요청 예제의 `source`는 null이므로 기본은 로그 전용입니다. 코드까지 분석하려면 아래 소스 압축을 S3에 올리고 실제 presigned URL을 `data.source`에 연결합니다. `rootDirectory`는 `.`이며, 아직 Git 커밋이 없다면 `commitSha`는 생략합니다.

```bash
tar -czf ../iris-demo-web-source.tar.gz package.json Dockerfile .dockerignore src public data
```

**소스 압축에는 data 파일을 포함해야 합니다.** 저장소에는 파일이 있지만 이미지에는 누락된 차이를 진단하는 사례이기 때문입니다. 설명서와 테스트의 정답을 모델에 직접 전달하지 않도록 소스 압축은 앱과 빌드 설정만 포함합니다.

## 로컬 웹 개발

Node.js 22 이상에서 외부 패키지 설치나 DB 없이 실행할 수 있습니다.

```bash
npm start
```

주소는 `http://localhost:3000`입니다. 할 일 추가·완료·삭제, 상태 필터, 완료율 표시와 모바일 화면을 제공합니다. 데이터는 메모리에 저장되어 서버 재시작 시 초기 할 일 3개로 돌아갑니다.

| 환경변수 | 기본값 | 용도 |
| --- | --- | --- |
| `PORT` | 3000 | HTTP 포트 |
| `HOST` | 0.0.0.0 | 바인딩 주소 |
| `APP_TITLE` | 작은 완료 | 앱 제목 |

.env 파일을 자동으로 읽지 않습니다. 환경변수는 셸 또는 배포 플랫폼에서 주입합니다.

## 파일 구성과 검증

```text
Dockerfile                배포 이미지에 data 복사가 누락된 상태
data/tasks.json           시작 시 필요한 초기 데이터
src/tasks.js              초기 데이터 파일 읽기
src/app.js                HTTP API와 정적 파일 응답
src/server.js             기동과 실제 오류 로그
public/                   웹 화면
examples/                 Docker 실패 로그와 Agent 요청
test/                     정상 API와 배포 파일 구성의 회귀 검사
scripts/runtime-snapshot.js  Dockerfile의 COPY 구성을 재현하는 테스트 도우미
scripts/fixtures.js       실제 Docker 컨테이너 로그 수집
```

`npm test`는 정상 API, 기본 Dockerfile의 파일 구성에서 발생하는 ENOENT, data 복사 추가 후 정상 응답을 확인합니다. 파일 구성 테스트는 실제 Docker 엔진 실행과 별개이며, 실제 이미지 검증 결과는 `VERIFICATION.md`에 기록합니다.

제공하는 **기본 Dockerfile은 실패 상태로 유지**합니다. 자동 테스트가 통과한다는 것은 이 실패와 복구 조건이 기대대로 재현된다는 의미입니다.
