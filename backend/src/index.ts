import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

initializeApp({ storageBucket: "jbproject7-0705-c1d9.firebasestorage.app" });

export const ping = onRequest((req, res) => {
  res.json({ ok: true });
});

// 이메일로 친구 찾기 — 전체 사용자 목록을 클라이언트에 열지 않으려고 서버에서만 조회해요.
// 찾은 사람의 닉네임과 캐릭터만 돌려주고 이메일은 돌려주지 않아요
export const findFriend = onCall(async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "로그인이 필요해요");
  const email = String(req.data?.email ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes("@")) {
    throw new HttpsError("invalid-argument", "이메일 주소를 다시 확인해주세요");
  }
  const snap = await getFirestore().collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty) return { found: false };
  const found = snap.docs[0];
  return {
    found: true,
    id: found.id,
    nickname: found.get("nickname") ?? "",
    character: found.get("character") ?? null,
    isMe: found.id === req.auth.uid,
  };
});

// 회원탈퇴 — 되돌릴 수 없어요. 내 데이터와 남의 글에 남긴 흔적까지 지우고 계정을 없애요
export const deleteAccount = onCall({ timeoutSeconds: 540 }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요해요");
  const fs = getFirestore();

  // 친구 목록은 지우기 전에 먼저 읽어둬요
  const friends = (await fs.collection(`users/${uid}/friends`).get()).docs.map((d) => d.id);

  for (const friendId of friends) {
    // 상대방 친구 목록에서 나를 빼요
    await fs.doc(`users/${friendId}/friends/${uid}`).delete().catch(() => {});
    // 친구 일기에 남긴 내 공감과 댓글도 지워요 (규칙상 공감·댓글은 친구 글에만 달 수 있어요)
    const diaries = await fs.collection(`users/${friendId}/diaries`).listDocuments();
    for (const diary of diaries) {
      await diary.collection("likes").doc(uid).delete().catch(() => {});
      const mine = await diary.collection("comments").where("uid", "==", uid).get();
      await Promise.all(mine.docs.map((c) => c.ref.delete().catch(() => {})));
    }
  }

  // 주고받은 친구 요청
  for (const field of ["from", "to"]) {
    const reqs = await fs.collection("friendRequests").where(field, "==", uid).get();
    await Promise.all(reqs.docs.map((d) => d.ref.delete().catch(() => {})));
  }

  await fs.doc(`pushTokens/${uid}`).delete().catch(() => {});

  // 그림일기 이미지
  await getStorage().bucket().deleteFiles({ prefix: `diaries/${uid}/` }).catch((e) => {
    logger.error("storage", e);
  });

  // 내 문서와 하위 컬렉션(일기·분석·친구) 전부
  await fs.recursiveDelete(fs.doc(`users/${uid}`));

  // 마지막으로 계정 자체를 지워요
  await getAuth().deleteUser(uid);
  logger.info("deleted account", uid);
  return { ok: true };
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

// 일기 주인에게 알림 한 건을 보내요. 토큰이 없으면(알림을 끈 사람) 조용히 넘어가요
async function notifyOwner(uid: string, actor: string, body: string) {
  if (actor === uid) return; // 내 일기에 내가 누른 건 알릴 필요가 없어요
  const token = (await getFirestore().doc(`pushTokens/${uid}`).get()).get("token");
  if (!token) return;
  const name = (await getFirestore().doc(`users/${actor}`).get()).get("nickname") ?? "친구";
  try {
    await getMessaging().send({ token, notification: { title: "삐뚤", body: `${name}님이 ${body}` } });
  } catch (e) {
    logger.error("notify", e);
  }
}

export const onDiaryLike = onDocumentCreated("users/{uid}/diaries/{date}/likes/{liker}", (event) =>
  notifyOwner(event.params.uid, event.params.liker, `${event.params.date} 일기에 공감했어요 💛`),
);

export const onDiaryComment = onDocumentCreated("users/{uid}/diaries/{date}/comments/{cid}", (event) =>
  notifyOwner(event.params.uid, event.data?.get("uid") ?? "", `${event.params.date} 일기에 댓글을 남겼어요 💬`),
);

// 양식(frame.png)의 글 칸 — make_frame.py 의 COLS/ROWS 와 같아야 해요
const GRID_COLS = 12;
const GRID_ROWS = 5;
const CELLS = GRID_COLS * GRID_ROWS; // 60칸
// 띄어쓰기·마침표도 한 칸을 먹어서, 60자를 꽉 채우면 칸이 모자라요. 여유를 둬요
const SUMMARY_MAX = 48;

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
// 404 가 나면 "gemini-2.5-flash-image" 로 바꿔주세요 (더 싸고 빠르지만 한글 글씨가 약해요)
const MODEL = "gemini-3-pro-image-preview";

const PROMPT = `유치원생이 직접 쓴 그림일기 한 장을 만들어줘.

참조 이미지
1번: 그림일기 양식(틀). 칸 구성·비율·선을 그대로 유지해. 종이는 A4 비율(세로가 더 긴 1:1.414)이야.
2번: 그림체. 선 밖으로 색이 삐져나오고, 어리숙하고 엉성한 크레파스 느낌.
3번: 주인공 외형. 외형(머리·옷·색)은 그대로 유지하고 표정만 아래 일기의 감정에 맞게 바꿔.

규칙
- 글씨는 삐뚤빼뚤한 어린아이 손글씨로, 틀의 칸 안에 맞춰서 써.
- 날짜 칸에는 아래 날짜를, 제목 칸에는 아래 제목을 써. 제목이 비어 있으면 네가 짧게 지어줘.
- 날씨·기분 칸은 해당하는 단어에 동그라미만 쳐. 칸에 없는 단어를 새로 적지 마.
- 맨 아래 원고지는 가로 ${GRID_COLS}칸 x 세로 ${GRID_ROWS}줄이야. 아래 '원고지'의 각 줄을 그 줄 번호 그대로 옮겨 써.
- 한 칸에는 반드시 글자 하나만 써. '집에서'처럼 두 글자 이상을 한 칸에 몰아 넣거나 한 글자를 두 칸에 걸쳐 쓰면 안 돼.
- 각 줄은 맨 왼쪽 칸부터 시작해서 왼쪽에서 오른쪽으로 한 칸씩 차례대로 채워.
- 띄어쓰기도 한 칸을 차지해. 그 칸은 아무것도 안 쓰고 그냥 지나가.
- 글자가 없는 칸에는 절대 아무것도 그리지 마. 네모(□)·점·동그라미·빗금 전부 금지야. 하얀 빈 칸이어야 해.
- 마침표와 물음표도 각각 한 칸을 차지해. 글 안에 날씨나 기분은 넣지 마.
- 글자는 칸을 꽉 채우지 말고 칸 높이의 3분의 2 정도 크기로 조금 작게 써. 글자 둘레에 여백이 보여야 해.
- 그림 칸 안에는 글씨를 넣지 마.
- 도장·스티커·서명·워터마크는 넣지 마.
- 그림 칸에는 아래 '그릴 장면'만 그려. 거기 없는 사람·장소·물건은 그리지 마.
- 종이 바탕은 미색이 아니라 순수한 흰색이어야 해.

날짜: {date}
날씨: {weather}
기분: {emotion}
제목: {title}
원고지:
{summary}
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

// 예시 장면을 적어두면 모델이 그 예시를 그대로 그려버려요. 일기에 적힌 사건에만 붙들어 둬요
const SCENE_PROMPT = `아래 일기에서 실제로 있었던 일을 뽑아내는 게 네 일이야. 다른 말 없이 딱 두 줄로 답해.

1번째 줄: 일기를 아이 말투로 ${SUMMARY_MAX}자 이내 요약 (날씨·기분은 넣지 마)
2번째 줄: 일기에서 가장 중심이 되는 사건 하나를 골라, 누가 어디서 무엇을 하는 모습인지 한 문장

두 줄 모두 아래 규칙을 지켜.
- 일기에 적힌 내용만 써. 일기에 없는 사람·장소·물건·행동을 새로 지어내지 마.
- 일기에 쓰인 말을 비슷한 다른 말로 바꾸지 마. 적힌 단어를 그대로 살려.
- 일기가 여러 날이나 여러 일을 말하면, 그중 가장 많이 이야기한 일 하나만 골라.
- 일기가 '무엇을 하지 않았다'거나 '집에 있었다'는 내용이면, 그 모습을 그대로 장면으로 써. 억지로 활동적인 장면을 만들지 마.
- 술·담배·폭력·사고처럼 아이 그림에 담기 어려운 소재만 순하게 바꾸고, 나머지는 일기 그대로 둬.`;

// 긴 일기를 그대로 이미지 모델에 넣으면 길이·안전필터(IMAGE_SAFETY)에 걸려요. 먼저 60자로 줄이고 그릴 장면을 정해요
// 원고지 배치를 모델이 세게 하면 '집에서'를 한 칸에 몰아 써요. 줄별로 미리 잘라서 넘겨요
function gridLines(text: string): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    for (let w = word; w; w = w.slice(GRID_COLS)) {
      const part = w.slice(0, GRID_COLS);
      const next = line ? `${line} ${part}` : part;
      if (next.length <= GRID_COLS) line = next;
      else { lines.push(line); line = part; }
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, GRID_ROWS).map((l, i) => `${i + 1}줄: ${l}`).join("\n");
}

// 사용자가 쓴 원문을 그대로 넣으면 줄바꿈·기호·영문이 섞여 원고지 칸이 흐트러져요. 항상 한 줄 요약만 넣어요
async function scenePlan(diary: any): Promise<{ summary: string; scene: string }> {
  const body: string = diary.body ?? "";
  try {
    const lines = (await askText(`${SCENE_PROMPT}

일기: ${body.slice(0, 1200)}`, 300))
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*\d+[.)]?\s*/, "").trim())
      .filter(Boolean);
    // 장면 줄이 없으면 요약을 넘겨요. 비워 보내면 모델이 엉뚱한 장면을 지어내요
    if (lines[0]) return { summary: lines[0].slice(0, CELLS), scene: lines[1] || lines[0] };
  } catch (e) {
    logger.error("scene", e);
  }
  return { summary: body.slice(0, CELLS), scene: body.slice(0, 120) }; // 요약이 안 돼도 일기 내용으로 그려봐요
}

// 모델이 빈 답을 주거나 끊겨도 한 줄은 꼭 띄워요
const FALLBACK_COMMENT: Record<string, string> = {
  행복: "좋은 하루였네요. 이 기분 오래 기억해요.",
  피곤함: "오늘도 애썼어요. 푹 쉬어요.",
  슬픔: "속상했겠어요. 그 마음 그대로 둬도 괜찮아요.",
  화남: "화날 만했어요. 천천히 숨 고르고 가요.",
  불안함: "마음이 조마조마했겠어요. 곁에 있을게요.",
};

async function oneLineComment(diary: any): Promise<string> {
  const emotion: string = diary.userEmotion ?? "";
  const fallback = FALLBACK_COMMENT[emotion] ?? "오늘 하루도 잘 지나갔어요.";
  try {
    const text = (await askText(`${COMMENT_PROMPT}

기분: ${emotion}\n일기: ${diary.body ?? ""}`, 200)).replace(/["'\n]/g, " ").trim();
    return text ? text.slice(0, 60) : fallback;
  } catch (e) {
    logger.error("comment", e);
    return fallback;
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
      .replace("{summary}", gridLines(summary))
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
      // 참조 이미지로는 비율이 안 따라와요. 모델이 받는 비율 중 A4(1:1.414)에 가장 가까운 게 3:4 예요
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "3:4" } },
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
