# 배포 실패와 복구 검증

검증일: 2026년 10월 3일, Asia/Seoul

## 실제 Docker 실행 결과

Docker Desktop의 `linux/arm64` 환경에서 기본 이미지와 수정한 이미지를 각각 빌드하고 실제 컨테이너를 실행했다. 수정 이미지는 임시 Dockerfile로만 만들었으며, 이 프로젝트의 기본 Dockerfile에는 수정 사항을 적용하지 않았다.

| 항목 | 결과 |
| --- | --- |
| 기본 이미지 빌드 | 성공, `iris-demo-web:broken` |
| 기본 이미지 시작 | 종료 코드 1 |
| 실제 오류 | `ENOENT: no such file or directory, open '/app/data/tasks.json'` |
| 관련 소스 | `src/tasks.js:8`에서 시작 시 초기 데이터 읽기 |
| 수정 내용 | `COPY --chown=node:node data ./data` 한 줄 추가 |
| 수정 이미지 빌드와 기본 CMD 실행 | 성공, `iris-demo-web:fixed` |
| 수정 이미지의 웹 페이지 | HTTP 200 |
| 수정 이미지의 `/healthz` | HTTP 200, `status=ok` |
| 수정 이미지의 `/api/tasks` | HTTP 200, 초기 할 일 3개 |
| 수정 이미지의 추가·완료·삭제 API | 통과 |
| 수정 컨테이너 SIGTERM 종료 | 종료 코드 0 |
| 기본 Dockerfile 보존 | 확인. data 복사가 빠진 배포 실패 상태 |

검증 컨테이너는 종료·제거했다. 로컬 이미지 두 개는 남아 있다. 실제 IRIS 클러스터 배포, Linux amd64 실행, 진단 Agent의 유료 모델 호출은 이 검증에 포함하지 않았다.

## 자동 테스트

`npm test`의 5개 검사를 통과했다.

1. 로컬 정상 웹 응답과 상태 확인.
2. 할 일 추가·완료·삭제.
3. 잘못된 JSON·빈 제목 거절.
4. 기본 Dockerfile의 COPY 파일 구성에서 시작 실패와 종료 코드 1.
5. data 복사를 추가한 파일 구성에서 정상 API 응답.

4번과 5번은 Dockerfile의 파일 구성을 별도 임시 디렉터리에 복사한 자동 회귀 검사다. 위 표의 실제 Docker 컨테이너 검사와 구분한다.

## 근거 파일

- `examples/deployment-error.log`: 실제 기본 컨테이너의 stderr 로그.
- `examples/deployment-error.request.json`: 위 로그를 감싼 Agent 요청 예제. 배포 식별자는 가상 값.
- `examples/deployment-verification.json`: 검증 시각, 이미지 ID·플랫폼, 실패 및 복구 결과.

웹 화면은 로컬 정상 실행 또는 수정 후 상태를 보여준다. 배포 실패 여부는 기본 Dockerfile의 컨테이너 시작 결과로 확인해야 한다.
