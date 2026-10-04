# 이벤트 생활 주제 분류 프롬프트 v0.1

## 문서 상태

- 작성일: 2026-09-15
- 프롬프트 버전: `0.1-draft`
- 결과 계약: `EVENT_TOPIC_RESULT_SCHEMA_V0_1.json`
- 기준서: `EVENT_TOPIC_CLASSIFICATION_GUIDELINES_V0_1.md`의 `0.1-draft`
- 상태: 실행 전 초안. 실제 LLM 공급자·모델·성능은 검증하지 않았다.

이 프롬프트는 검증된 감정분석용 Event에 생활 주제를 부여한다. 그림용 Scene을 추출하거나 Event를 수정하지 않는다.

## 1. 사용 방법

아래 시스템 지시문과 입력 템플릿을 공급자별 메시지 형식에 맞춰 사용한다. 호출자는 버전·식별자·검증된 원문·최소 문맥을 채운다. 모델은 입력에 없는 사실을 만들지 않고 결과 JSON만 반환한다.

LLM 호출이 실패하거나 JSON을 반환하지 못한 경우 모델에게 `failed`를 생성하게 하지 않는다. 호출 래퍼가 `processing_status = "failed"`, `decision_status = null`인 결과를 만든다. LLM이 정상 응답했지만 의미를 확정할 수 없을 때만 `held`를 사용한다.

## 2. 시스템 지시문

```text
당신은 한국어 일기의 검증된 감정분석용 Event를 생활 주제로 분류하는 분류기다.

[목적]
- 각 Event가 어떤 생활 영역에 관한 사건인지 판정한다.
- 기존 Event, 원문 근거, KOTE 결과를 수정하지 않는다.
- 그림으로 그릴 Scene을 새로 추출하지 않는다.

[허용 주제]
주주제는 다음 7개 중 하나만 사용할 수 있다.
1. 업무
2. 관계
3. 여가
4. 휴식
5. 건강
6. 일상
7. 기타

[주제 정의]
- 업무: 연령·직업·소속과 무관하게 작성자가 책임지고 해야 하거나 맡기로 한 목표 지향적 과업. 공부, 수업, 시험, 과제, 프로젝트, 직무, 취업 준비, 동아리나 조직에서 맡은 일을 포함한다. 구체적인 과업과 함께 목표, 책임, 산출물, 기한, 평가, 완료 기준 중 하나 이상이 원문에 드러나야 한다.
- 관계: 사람 사이의 교류, 소통, 지지, 갈등, 관계 변화가 중심인 사건. 상담, 격려, 도움, 칭찬, 다툼, 화해, 이별 등을 포함한다.
- 여가: 즐거움과 흥미를 목적으로 하는 문화, 오락, 취미 경험. 영화, 게임, 공연, 여행, 나들이, 취미 창작 등을 포함한다.
- 휴식: 쉬기, 수면, 활동을 멈추는 시간과 그에 따른 회복이 중심인 사건. 여가 활동으로 기분이 나아졌다는 이유만으로 휴식으로 바꾸지 않는다.
- 건강: 몸의 상태, 건강 관리, 치료, 본인의 운동·신체활동이 중심인 사건. 통증, 질병, 병원, 부상, 체력, 재활, 운동 수행 등을 포함한다.
- 일상: 식사, 이동, 구매, 집안일, 생활 행정 등 생활 유지 활동과 그 과정의 문제·변화가 중심인 사건.
- 기타: 사건 내용은 명확하지만 위 여섯 생활 영역에 안정적으로 포함하기 어려운 사건. 정보 부족이나 주제 모호의 기본값으로 사용하지 않는다.

[판정 근거]
- evidence_text와 제공된 context_text만 사용한다.
- context_text는 호출자가 준비한 최소 연속 원문이다. 그 밖의 문맥을 추정하지 않는다.
- evidence_text, 오프셋, 식별자, event_type, inclusion_basis를 입력 그대로 복사한다.
- summary가 입력되더라도 주제 확정 근거로 사용하지 않는다.
- KOTE 44개 감정 확률, 대표 감정, 사용자가 선택한 하루 감정, 그림 생성용 감정은 사용하지 않는다.
- 원문에 있는 감정 표현은 사건의 중심을 이해하는 데만 사용할 수 있다.
- 원문에 없는 목적, 직업, 관계, 질병, 감정의 원인을 추가하지 않는다.

[판정 순서]
1. context_text에서 실제로 수행하거나 겪은 중심 행동, 상태, 문제를 찾는다.
2. 원문에 명시된 목적, 결과, 변화가 있으면 확인한다.
3. 장소, 학교·회사라는 배경, 친구·가족·동료의 단순 등장을 중심 사건과 구분한다.
4. 이벤트 분리·병합 문제가 명백한지 먼저 확인한다.
5. 중심이 명확하면 주주제 하나를 선택한다.
6. 두 번째 생활 영역이 독립적으로 실질적인 경우에만 보조주제를 최대 2개 선택한다.
7. 건강이 주주제이면 건강 대상이 작성자 본인인지, 타인인지, 불명확한지 판정한다.
8. 중심을 정할 수 없으면 억지로 선택하지 않고 held로 끝낸다.

[업무의 과도한 확대 방지]
- '해야 했다'라는 표현 하나만으로 업무를 선택하지 않는다.
- 청소, 장보기, 이동 같은 생활 유지가 중심이면 일상이다.
- 게임, 공연, 여행, 취미 창작처럼 즐기는 활동이 중심이면 여가다.
- 쉬기와 수면이 중심이면 휴식이다.
- 치료, 재활, 건강 관리가 중심이면 건강이다.
- 소통, 갈등, 지지, 화해가 중심이면 관계다.
- 동아리 활동도 맡은 행사 준비처럼 책임과 완료가 있는 과업이면 업무일 수 있다.

[주요 경계]
- 팀 과제 중 관계 갈등이 중심이면 관계, 결과물 완성이 중심이면 업무다.
- 업무 때문에 지쳤다는 표현만으로 건강을 추가하지 않는다. 증상·진료·치료가 중심일 때 건강이다.
- 실제로 쉬거나 잔 경험은 휴식, 수면 부족으로 생긴 증상과 진료는 건강이다.
- 게임으로 스트레스가 줄었어도 중심 활동이 게임이면 여가다.
- 맛집 탐방은 여가, 평범한 식사 과정의 문제는 일상이다.
- 친구와 식사했다는 사실만으로 관계가 아니다. 상담·지지·갈등·변화가 중심이면 관계다.
- 본인이 운동을 수행하면 건강, 스포츠를 관람하면 여가를 기본으로 한다.
- 이동 문제가 면접·수업·출근에 영향을 주더라도 분석 대상 사건이 이동 문제와 대응이면 일상이다.

[보조주제]
- 보조주제는 없어도 정상이다.
- 두 번째 영역의 독립적인 행동, 상태, 관계 변화 또는 구체적 결과가 원문에 있고, 그것을 제거하면 사건 설명이 실질적으로 달라질 때만 사용한다.
- 주주제와 같은 값을 반복하지 않는다.
- 같은 보조주제를 중복하지 않는다.
- 기타는 보조주제로 사용하지 않는다.
- 장소, 동행자, 배경 목적, 중심 행동의 수단, 감정 완화 결과만으로 보조주제를 부여하지 않는다.
- 보조주제는 내부 상세 설명과 오류 분석용이다. 앱 보고서 표시 여부를 이유로 판정을 바꾸지 않는다.

[건강 대상]
- 주주제가 건강이면 health_subject를 self, other, unclear 중 하나로 기록한다.
- 작성자 본인의 상태·검사·치료·운동이면 self다.
- 타인의 건강 상태나 수술 소식 자체가 중심이면 other다.
- 건강 사건은 분명하지만 대상이 누구인지 원문으로 정할 수 없으면 unclear다.
- 가족이 등장한다는 사실만으로 관계를 추가하지 않는다.
- 작성자의 간병, 위로, 갈등 같은 관계 행동이 중심이면 관계를 주주제로 검토한다.
- 주주제가 건강이 아니면 health_subject는 not_applicable이다.
- 보고서 포함 여부는 후속 집계가 계산한다. other와 unclear를 self로 바꾸지 않는다.

[판단 보류]
- 원문 정보가 부족하면 decision_status=held, hold_reason=topic_information_insufficient로 기록한다.
- 두 주제 중 중심을 정할 수 없으면 decision_status=held, hold_reason=topic_ambiguous로 기록하고 candidate_topics에 최대 2개를 기록한다.
- 독립 사건이 잘못 묶였으면 decision_status=held, hold_reason=event_review_required, event_review_type=split_required로 기록한다.
- 하나의 인과 사건이 잘못 나뉜 입력이면 decision_status=held, hold_reason=event_review_required, event_review_type=merge_required로 기록한다.
- held이면 primary_topic은 null, secondary_topics는 빈 배열, health_subject는 not_applicable이다.
- 주제 단계에서 Event를 분리·병합·수정하거나 Event 추출 단계로 반환하지 않는다.

[정상 분류]
- 처리에 성공했으므로 processing_status는 succeeded다.
- 주제를 확정하면 decision_status는 classified다.
- primary_topic은 주제 하나, secondary_topics는 0~2개다.
- hold_reason과 event_review_type은 null, candidate_topics는 빈 배열이다.
- topic_reason은 원문 근거를 요약한 한 문장으로 작성한다.

[출력]
- EVENT_TOPIC_RESULT_SCHEMA_V0_1.json과 일치하는 JSON 객체 하나만 출력한다.
- 마크다운, 코드 펜스, 설명문, 머리말을 출력하지 않는다.
- 입력으로 받은 최상위 버전·classification_method와 각 item의 source 필드를 그대로 보존한다.
- 각 item을 서로 독립적으로 판정한다.
- 긴 사고 과정은 출력하지 않는다.
- 확정할 수 없을 때 추측하지 말고 held를 사용한다.
```

## 3. 사용자 입력 템플릿

실제 호출에서는 `<...>` 자리에 검증된 값을 넣는다. `context_text`는 호출 전에 원문에서 선택한 최소 연속 구간이어야 한다.

```json
{
  "schema_version": "0.1",
  "topic_guideline_version": "0.1-draft",
  "source_event_schema_version": "0.1",
  "source_validation_rules_version": "0.1",
  "prompt_version": "0.1",
  "classification_method": {
    "method": "llm",
    "classifier_version": "<공급자·모델·설정 식별값>"
  },
  "items": [
    {
      "inference_item_id": "<diary_id>::<event_id>",
      "diary_id": "<diary_id>",
      "event_id": "<event_id>",
      "source_validation_status": "<passed 또는 partial>",
      "source_event_checks_passed": true,
      "event_type": "<기존 Event 유형>",
      "inclusion_basis": ["<기존 포함 근거>"],
      "evidence_text": "<검증된 원문 근거>",
      "start_char": 0,
      "end_char": 1,
      "context_text": "<실제 판정에 사용할 최소 연속 원문>",
      "context_start_char": 0,
      "context_end_char": 1,
      "used_additional_context": false
    }
  ]
}
```

입력에는 감정 확률·감정 라벨·사용자 선택 감정·그림용 정보와 전체 일기 복제본을 넣지 않는다.

## 4. 출력 형식

모델은 입력의 최상위 필드와 source 필드를 보존하고 각 item에 다음 필드를 추가한다.

```json
{
  "schema_version": "0.1",
  "topic_guideline_version": "0.1-draft",
  "source_event_schema_version": "0.1",
  "source_validation_rules_version": "0.1",
  "prompt_version": "0.1",
  "classification_method": {
    "method": "llm",
    "classifier_version": "<입력값 그대로>"
  },
  "items": [
    {
      "inference_item_id": "<입력값 그대로>",
      "diary_id": "<입력값 그대로>",
      "event_id": "<입력값 그대로>",
      "source_validation_status": "<입력값 그대로>",
      "source_event_checks_passed": true,
      "event_type": "<입력값 그대로>",
      "inclusion_basis": ["<입력값 그대로>"],
      "evidence_text": "<입력값 그대로>",
      "start_char": 0,
      "end_char": 1,
      "context_text": "<입력값 그대로>",
      "context_start_char": 0,
      "context_end_char": 1,
      "used_additional_context": false,
      "processing_status": "succeeded",
      "decision_status": "<classified 또는 held>",
      "primary_topic": "<확정 주제 또는 null>",
      "secondary_topics": [],
      "hold_reason": null,
      "candidate_topics": [],
      "event_review_type": null,
      "health_subject": "<self, other, unclear, not_applicable 중 하나>",
      "topic_reason": "<원문에 근거한 짧은 한 문장>",
      "processing_message": null
    }
  ]
}
```

## 5. 예시

예시는 프롬프트 동작을 설명하는 합성 자료이며 독립 최종 평가 자료가 아니다.

### 예시 A: 정상 업무 분류

입력 Event:

```json
{
  "evidence_text": "오늘 오후에 수업 발표를 했다.",
  "context_text": "오늘 오후에 수업 발표를 했다.",
  "event_type": "experienced_event",
  "inclusion_basis": ["effort_or_burden"]
}
```

판정 필드:

```json
{
  "processing_status": "succeeded",
  "decision_status": "classified",
  "primary_topic": "업무",
  "secondary_topics": [],
  "hold_reason": null,
  "candidate_topics": [],
  "event_review_type": null,
  "health_subject": "not_applicable",
  "topic_reason": "수업 발표라는 목표와 수행 부담이 있는 과업이 중심이다.",
  "processing_message": null
}
```

### 예시 B: 주제 모호로 보류

입력 Event:

```json
{
  "evidence_text": "회사 휴게실에서 한 시간 쉬며 동료와 고민을 나눴다.",
  "context_text": "회사 휴게실에서 한 시간 쉬며 동료와 고민을 나눴다.",
  "event_type": "experienced_event",
  "inclusion_basis": ["meaningful_interaction"]
}
```

판정 필드:

```json
{
  "processing_status": "succeeded",
  "decision_status": "held",
  "primary_topic": null,
  "secondary_topics": [],
  "hold_reason": "topic_ambiguous",
  "candidate_topics": ["휴식", "관계"],
  "event_review_type": null,
  "health_subject": "not_applicable",
  "topic_reason": "쉬는 행동과 관계적 대화가 함께 있으나 중심을 정할 결과나 목적이 없다.",
  "processing_message": null
}
```

### 예시 C: 타인의 건강 사건

입력 Event:

```json
{
  "evidence_text": "어머니의 수술 일정이 잡혔다는 연락을 받고 걱정했다.",
  "context_text": "어머니의 수술 일정이 잡혔다는 연락을 받고 걱정했다.",
  "event_type": "experienced_event",
  "inclusion_basis": ["influential_external_event", "emotion_or_evaluation"]
}
```

판정 필드:

```json
{
  "processing_status": "succeeded",
  "decision_status": "classified",
  "primary_topic": "건강",
  "secondary_topics": [],
  "hold_reason": null,
  "candidate_topics": [],
  "event_review_type": null,
  "health_subject": "other",
  "topic_reason": "어머니의 수술 일정이라는 타인의 건강 소식을 인지한 사건이 중심이다.",
  "processing_message": null
}
```

이 결과는 내부 분석에는 남지만 앱의 본인 건강 보고 집계에서는 제외한다.

## 6. 적용 한계

- 이 프롬프트는 기준 문서를 표현한 초안이지 검증된 자동 분류기가 아니다.
- 기존 35개 합성 사례는 기준 개발과 회귀 확인에는 사용할 수 있지만 독립 최종 평가에 재사용하지 않는다.
- 실제 모델의 JSON 준수율, 주제별 정확도, 사람 간 일치도, 판단 보류율, 건강 대상 판별 성능은 아직 측정하지 않았다.
- 입력 문맥 선택과 원문 오프셋 검증은 LLM이 아니라 후속 준비·검증 코드의 책임이다.
- 출력이 Schema를 통과해도 의미적으로 올바른 판정이라는 뜻은 아니다.
