import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
const MODEL = "gemini-2.5-flash";
const KOTE_ENDPOINT = defineSecret("KOTE_ENDPOINT"); // 44개 점수를 돌려주는 Cloud Run 서비스

// lib/ 에서 빌드되니까 한 단계 위의 prompts 를 봐요
const PROMPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");
const EVENT_RULES = readFileSync(join(PROMPTS, "EVENT_DEFINITION_V0_1.md"), "utf8");
const TOPIC_PROMPT = readFileSync(join(PROMPTS, "EVENT_TOPIC_CLASSIFICATION_PROMPT_V0_1.md"), "utf8");

// 연결된 KOTE 라벨 ID. frontend/src/lib/emotion.js 와 같은 표를 씁니다
// 공식 v0.3: 10 안타까움/실망, 14 편안/쾌적, 43 안심/신뢰는 제외해요
const APP5: Record<string, number[]> = {
  행복: [13, 32, 40, 42, 28],
  피곤함: [27],
  슬픔: [5, 19, 36],
  화남: [0, 6, 22],
  불안함: [18, 41],
};
const ORDER = ["행복", "피곤함", "슬픔", "화남", "불안함"];

// 추출·매칭 로직이 바뀌면 올려요 (frontend/src/lib/aiReport.js 와 같은 값)
const PIPELINE_VERSION = "v2";

// S1 >= 0.7 이고 S1 - S2 >= 0.2 이며 1위 동점이 없을 때만 부여. 나머지는 보류
function assign(p44: number[]) {
  const scores5 = Object.fromEntries(ORDER.map((e) => [e, Math.max(...APP5[e].map((i) => p44[i] ?? 0))]));
  const sorted = ORDER.map((e) => ({ e, s: scores5[e] })).sort((a, b) => b.s - a.s);
  const tied = sorted.filter((x) => x.s === sorted[0].s).length > 1;
  const ok = !tied && sorted[0].s >= 0.7 && sorted[0].s - sorted[1].s >= 0.2 - 1e-12;
  return {
    scores5,
    emotionDecisionStatus: ok ? "assigned" : "withheld",
    representativeEmotion: ok ? sorted[0].e : null,
  };
}

// 추출·분류는 형식이 빡빡해서 responseMimeType 으로 JSON 만 받게 묶어요
async function askJson(system: string, user: string, responseSchema?: object) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY.value()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192, ...(responseSchema ? { responseSchema } : {}) },
      }),
    },
  );
  if (!res.ok) throw new HttpsError("internal", `LLM ${res.status}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpsError("internal", "LLM 응답이 JSON 이 아니에요");
  }
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          summary: { type: "string" },
          evidence_text: { type: "string" },
          event_type: {
            type: "string",
            enum: ["experienced_event", "ongoing_situation", "future_task", "anticipated_event"],
          },
        },
        required: ["event_id", "summary", "evidence_text", "event_type"],
      },
    },
  },
  required: ["events"],
};

// 근거 문구의 위치를 본문에서 직접 찾아요. 띄어쓰기만 다른 경우도 한 번 더 봐요
function locate(body: string, text: string) {
  const at = body.indexOf(text);
  if (at >= 0) return { start: at, end: at + text.length };

  const map: number[] = [];
  let squashed = "";
  for (let i = 0; i < body.length; i++) {
    if (/\s/.test(body[i])) continue;
    map.push(i);
    squashed += body[i];
  }
  const needle = text.replace(/\s+/g, "");
  if (!needle) return null;
  const j = squashed.indexOf(needle);
  if (j < 0) return null;
  return { start: map[j], end: map[j + needle.length - 1] + 1 };
}

export const analyzeDiary = onCall(
  { secrets: [GEMINI_KEY, KOTE_ENDPOINT], timeoutSeconds: 300, memory: "512MiB" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요해요");
    const diaryDate = String(req.data?.diaryDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(diaryDate)) throw new HttpsError("invalid-argument", "diaryDate");

    const db = getFirestore();
    const snap = await db.doc(`users/${uid}/diaries/${diaryDate}`).get();
    const diary = snap.data();
    if (!diary || diary.isDeleted) throw new HttpsError("not-found", "일기가 없어요");
    const body: string = diary.body ?? "";
    if (!body.trim()) return { accepted: 0, reason: "empty_body" };

    // 같은 본문을 다시 분석하지 않아요. 사건이 0건으로 끝난 일기도 표시가 남습니다
    const contentVersion = diary.contentVersion ?? 1;
    if (diary.analyzedContentVersion === contentVersion && diary.analyzedPipeline === PIPELINE_VERSION)
      return { accepted: 0, reason: "already_analyzed" };

    // 1. 사건 추출
    const extracted = await askJson(
      `${EVENT_RULES}

위 기준을 만족하는 사건만 뽑는다. evidence_text 는 일기 본문의 연속 구간을 띄어쓰기·문장부호까지 **한 글자도 바꾸지 말고 그대로 복사**한다. 요약하거나 다듬지 않는다. 기준에 맞는 사건이 없으면 events 를 빈 배열로 둔다.`,
      `일기 날짜: ${diaryDate}
본문:
${body}`,
      EXTRACTION_SCHEMA,
    );

    // 2. 원문 검증 — 근거 문구가 본문에 실제로 있는지 보고, 저장은 본문 원문 그대로 해요
    type Raw = { event_id?: string; evidence_text?: string; [k: string]: unknown };
    const accepted = ((extracted.events ?? []) as Raw[]).flatMap((e) => {
      const text = typeof e.evidence_text === "string" ? e.evidence_text.trim() : "";
      const found = e.event_id && text ? locate(body, text) : null;
      if (!found) return [];
      return [{ ...e, evidence_text: body.slice(found.start, found.end), start_char: found.start, end_char: found.end }];
    });
    logger.info("analyzeDiary", {
      diaryDate,
      extracted: (extracted.events ?? []).length,
      accepted: accepted.length,
    });
    if (accepted.length === 0) {
      await snap.ref.update({ analyzedContentVersion: contentVersion, analyzedPipeline: PIPELINE_VERSION });
      return { accepted: 0, reason: "no_valid_event" };
    }

    // 3. 주제 분류
    const topics = await askJson(
      TOPIC_PROMPT,
      JSON.stringify({ diary_id: diaryDate, diary_text: body, events: accepted }),
    );
    const topicOf = (id: string) =>
      (topics.items ?? []).find((t: { event_id: string }) => t.event_id === id);
    logger.info("analyzeDiary topics", { diaryDate, items: (topics.items ?? []).length });

    // 4. KOTE — 사건의 evidence_text 를 그대로 넣습니다. 요약이나 일기 전체로 바꾸지 않아요
    const audience = KOTE_ENDPOINT.value();
    // Cloud Run 이 비공개라 메타데이터 서버에서 ID 토큰을 받아 붙여요
    const idToken = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${audience}`,
      { headers: { "Metadata-Flavor": "Google" } },
    ).then((r) => r.text());

    const koteRes = await fetch(audience, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ texts: accepted.map((e: { evidence_text: string }) => e.evidence_text) }),
    });
    if (!koteRes.ok) throw new HttpsError("internal", `KOTE ${koteRes.status}`);
    const { probabilities } = (await koteRes.json()) as { probabilities: number[][] };
    if (probabilities.length !== accepted.length) throw new HttpsError("internal", "KOTE 응답 개수가 안 맞아요");

    // 5. 저장
    const batch = db.batch();
    accepted.forEach((e: Record<string, unknown>, i: number) => {
      const topic = topicOf(e.event_id as string);
      const eventId = `${diaryDate}__${e.event_id}`;
      batch.set(db.doc(`users/${uid}/events/${eventId}`), {
        eventId,
        diaryId: diaryDate,
        diaryDate,
        evidenceText: e.evidence_text,
        startChar: e.start_char,
        endChar: e.end_char,
        summary: e.summary,
        eventType: e.event_type,
        primaryTopic: topic?.primary_topic ?? null,
        topicDecisionStatus: topic?.decision_status ?? null,
        healthSubject: topic?.health_subject ?? "not_applicable",
        probabilities44: probabilities[i],
        ...assign(probabilities[i]),
        versions: {
          extraction: "0.1",
          topic: "0.1-draft",
          mapping: "kote44-to-app5-basic-max-v0.3",
          assignment: "kote-app5-report-assignment-v0.1",
        },
        sourceContentVersion: contentVersion,
        createdAt: new Date(),
      });
    });
    await batch.commit();
    await snap.ref.update({ analyzedContentVersion: contentVersion, analyzedPipeline: PIPELINE_VERSION });
    return { accepted: accepted.length };
  },
);
