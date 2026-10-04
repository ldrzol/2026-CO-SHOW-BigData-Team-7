import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

initializeApp({ storageBucket: "jbproject7-0705-c1d9.firebasestorage.app" });

export const ping = onRequest((req, res) => {
  res.json({ ok: true });
});

const DEAD_TOKEN = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];

// 매일 밤 9시(한국 시간)에 알림을 켠 사용자에게 일기 알림을 보내요
export const dailyReminder = onSchedule({ schedule: "0 21 * * *", timeZone: "Asia/Seoul" }, async () => {
  const { docs } = await getFirestore().collection("pushTokens").get();
  for (let i = 0; i < docs.length; i += 500) { // sendEach는 한 번에 최대 500개
    const chunk = docs.slice(i, i + 500);
    const res = await getMessaging().sendEach(
      chunk.map((d) => ({
        token: d.get("token"),
        notification: { title: "삐뚤", body: "오늘 하루는 어땠나요? 일기를 남겨보세요 ✏️" },
      })),
    );
    // 앱을 지웠거나 만료된 토큰은 정리해요
    await Promise.all(
      res.responses.map((r, j) => (DEAD_TOKEN.includes(r.error?.code ?? "") ? chunk[j].ref.delete() : null)),
    );
  }
});

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
// 404 가 나면 "gemini-2.5-flash-image" 로 바꿔주세요 (더 싸고 빠르지만 한글 글씨가 약해요)
const MODEL = "gemini-3-pro-image-preview";

const PROMPT = `유치원생이 직접 쓴 그림일기 한 장을 만들어줘.

참조 이미지
1번: 그림일기 양식(틀). 칸 구성·비율·선을 그대로 유지해.
2번: 그림체. 선 밖으로 색이 삐져나오고, 어리숙하고 엉성한 크레파스 느낌.
3번: 주인공 외형. 외형(머리·옷·색)은 그대로 유지하고 표정만 아래 일기의 감정에 맞게 바꿔.

규칙
- 글씨는 삐뚤빼뚤한 어린아이 손글씨로, 틀의 칸 안에 맞춰서 써.
- 날짜 칸에는 아래 날짜를, 제목 칸에는 아래 제목을 써. 제목이 비어 있으면 네가 짧게 지어줘.
- 날씨·기분 칸은 해당하는 단어에 동그라미만 쳐. 칸에 없는 단어를 새로 적지 마.
- 아래 '일기'를 원고지 칸에 한 글자씩 그대로 써. 글 안에 날씨나 기분은 넣지 마.
- 그림 칸 안에는 글씨를 넣지 마.
- 도장·스티커·서명·워터마크는 넣지 마.
- 그림 칸에는 아래 '그릴 장면'을 그려.

날짜: {date}
날씨: {weather}
기분: {emotion}
제목: {title}
일기: {summary}
그릴 장면: {scene}`;

const TEXT_MODEL = "gemini-2.5-flash";

const COMMENT_PROMPT = `아래 일기를 읽고 공감하는 한 줄 코멘트를 써줘.
- 40자 이내 한 문장, 존댓말, 다정하고 담백하게.
- 조언·훈계·질문은 하지 말고 마음을 알아주는 말만 해.
- 따옴표나 이모지는 쓰지 마.`;

// 코멘트는 실패해도 빈 문자열로 넘겨요 — 그림은 이미 나왔는데 일기를 막을 이유가 없어요
// 생각 예산 0 — 안 끄면 짧은 답이 생각에 다 먹혀서 빈 텍스트가 와요
async function askText(prompt: string, maxOutputTokens: number): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_KEY.value()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );
  const json: any = await res.json();
  return (json.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

const SCENE_PROMPT = `아래 일기를 유치원생 그림일기로 옮길 거야. 다른 말 없이 딱 두 줄로 답해.
1번째 줄: 일기를 아이 말투로 60자 이내 요약 (날씨·기분은 넣지 마)
2번째 줄: 그림으로 그릴 가장 중요한 장면 한 문장

술·담배·폭력·사고처럼 아이 그림에 담을 수 없는 소재는 빼고, 다 같이 밥 먹는 모습처럼 무난한 장면으로 바꿔 써.`;

// 긴 일기를 그대로 이미지 모델에 넣으면 길이·안전필터(IMAGE_SAFETY)에 걸려요. 먼저 60자로 줄이고 그릴 장면을 정해요
async function scenePlan(diary: any): Promise<{ summary: string; scene: string }> {
  const body: string = diary.body ?? "";
  try {
    const lines = (await askText(`${SCENE_PROMPT}

일기: ${body.slice(0, 1200)}`, 300))
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*\d+[.)]?\s*/, "").trim())
      .filter(Boolean);
    if (lines[0]) return { summary: lines[0].slice(0, 60), scene: lines[1] ?? "" };
  } catch (e) {
    logger.error("scene", e);
  }
  return { summary: body.slice(0, 60), scene: "" }; // 요약이 안 돼도 그림은 그려봐요
}

// 코멘트는 실패해도 빈 문자열로 넘겨요 — 그림은 이미 나왔는데 일기를 막을 이유가 없어요
async function oneLineComment(diary: any): Promise<string> {
  try {
    return (await askText(`${COMMENT_PROMPT}

기분: ${diary.userEmotion ?? ""}\n일기: ${diary.body ?? ""}`, 80)).slice(0, 60);
  } catch (e) {
    logger.error("comment", e);
    return "";
  }
}

// backend/assets 에 양식(frame.png)·그림체(style.png) 참조 이미지를 넣어두세요
const refPart = async (name: string) => ({
  inline_data: {
    mime_type: "image/png",
    data: (await readFile(new URL(`../assets/${name}`, import.meta.url))).toString("base64"),
  },
});

export const generateDiaryImage = onCall(
  { secrets: [GEMINI_KEY], timeoutSeconds: 300, memory: "512MiB" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요해요");
    const { diaryDate, character } = req.data as { diaryDate?: string; character?: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(diaryDate ?? "") || typeof character !== "string" || character.length > 4_000_000) {
      throw new HttpsError("invalid-argument", "요청이 올바르지 않아요");
    }

    // 일기 본문은 클라이언트 말을 믿지 않고 저장된 문서에서 읽어요
    const ref = getFirestore().doc(`users/${uid}/diaries/${diaryDate}`);
    const diary = (await ref.get()).data();
    if (!diary) throw new HttpsError("not-found", "일기를 찾을 수 없어요");

    // 요약과 코멘트는 서로 상관없으니 같이 돌려요
    const [{ summary, scene }, aiComment] = await Promise.all([scenePlan(diary), oneLineComment(diary)]);

    const prompt = PROMPT
      .replace("{date}", diaryDate!)
      .replace("{weather}", diary.weather ?? "")
      .replace("{emotion}", diary.userEmotion ?? "")
      .replace("{title}", diary.title || "")
      .replace("{summary}", summary)
      .replace("{scene}", scene);

    const body = JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          await refPart("frame.png"),   // 1번
          await refPart("style.png"),   // 2번
          { inline_data: { mime_type: "image/png", data: character } }, // 3번
        ],
      }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY.value()}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
    );

    const json: any = await res.json();
    const b64 = json.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!b64) {
      logger.error("gemini", JSON.stringify(json).slice(0, 2000));
      if (json.candidates?.[0]?.finishReason === "IMAGE_SAFETY") {
        throw new HttpsError("failed-precondition", "그림으로 그리기 어려운 내용이 있어요. 일기를 조금 바꿔서 다시 시도해주세요.");
      }
      throw new HttpsError("internal", "그림을 만들지 못했어요");
    }

    // ponytail: 토큰 붙은 URL 이라 Storage 규칙 없이 바로 <img> 로 보여줄 수 있어요. 더 조여야 하면 규칙 + getDownloadURL 로
    const token = randomUUID();
    const bucket = getStorage().bucket();
    const file = bucket.file(`diaries/${uid}/${diaryDate}.png`);
    await file.save(Buffer.from(b64, "base64"), {
      contentType: "image/png",
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;

    await ref.set({ imageUrl, aiComment, imageUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { imageUrl, aiComment };
  },
);
export { analyzeDiary } from "./analyze.js";
