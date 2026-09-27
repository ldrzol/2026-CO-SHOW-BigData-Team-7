import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();

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