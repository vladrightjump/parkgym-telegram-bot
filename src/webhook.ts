import { createAdminClient } from "./lib/supabase.js";
import { answerCallbackQuery, sendMessage } from "./lib/telegram.js";

// ── Telegram update payload (only the fields we use) ──────────────────────────
interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TgChat {
  id: number;
  type: string; // "private" | "group" | "supergroup" | "channel"
}

export interface TgUpdate {
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
  };
  message?: {
    from?: TgUser;
    chat: TgChat;
    text?: string;
  };
}

// Process a single Telegram update. Never throws to the caller — errors are
// logged so the webhook can always answer 2xx and avoid Telegram retry loops.
export async function handleUpdate(update: TgUpdate): Promise<void> {
  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    // Never surface an error to Telegram — that would trigger a retry loop.
    console.error("[telegram/webhook] handler error:", err);
  }
}

async function handleCallbackQuery(
  cb: NonNullable<TgUpdate["callback_query"]>,
) {
  const data = cb.data ?? "";
  // Expected: "att:yes:<session_id>" / "att:no:<session_id>"
  const match = /^att:(yes|no):(.+)$/.exec(data);
  if (!match) {
    await answerCallbackQuery(cb.id);
    return;
  }
  const response = match[1] as "yes" | "no";
  const sessionId = match[2];

  const supabase = createAdminClient();
  const from = cb.from;

  const member = await resolveMember(supabase, from);

  if (!member) {
    // Unknown Telegram account — park it for an admin to link later.
    await supabase.from("telegram_unmatched").upsert(
      {
        telegram_user_id: from.id,
        username: from.username ?? null,
        first_name: from.first_name ?? null,
        last_name: from.last_name ?? null,
      },
      { onConflict: "telegram_user_id" },
    );
    await answerCallbackQuery(
      cb.id,
      "Te-am notat, un admin te va lega de profil",
    );
    return;
  }

  // First training = member has never confirmed a 'yes' before (any earlier
  // session). Only meaningful for a positive answer.
  let isFirstTraining = false;
  if (response === "yes") {
    const { count } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("member_id", member.id)
      .eq("response", "yes")
      .neq("session_id", sessionId);
    isFirstTraining = (count ?? 0) === 0;
  }

  // Upsert on (session_id, member_id) — changing one's mind is allowed.
  await supabase.from("attendance").upsert(
    {
      session_id: sessionId,
      member_id: member.id,
      response,
      is_first_training: isFirstTraining,
      responded_at: new Date().toISOString(),
    },
    { onConflict: "session_id,member_id" },
  );

  await answerCallbackQuery(cb.id, response === "yes" ? "Notat ✅" : "Notat ❌");
}

// Resolve a Telegram user to a member. Primary key is telegram_user_id; falls
// back to a case-insensitive telegram_username match, persisting the numeric id
// on the member for next time.
async function resolveMember(
  supabase: ReturnType<typeof createAdminClient>,
  from: TgUser,
): Promise<{ id: string } | null> {
  const byId = await supabase
    .from("members")
    .select("id")
    .eq("telegram_user_id", from.id)
    .maybeSingle();
  if (byId.data) return byId.data as { id: string };

  if (from.username) {
    const byUsername = await supabase
      .from("members")
      .select("id")
      .ilike("telegram_username", from.username)
      .is("telegram_user_id", null)
      .maybeSingle();
    if (byUsername.data) {
      const m = byUsername.data as { id: string };
      // Remember the numeric id so future lookups hit the primary path.
      await supabase
        .from("members")
        .update({ telegram_user_id: from.id })
        .eq("id", m.id);
      return m;
    }
  }

  return null;
}

async function handleMessage(msg: NonNullable<TgUpdate["message"]>) {
  const text = (msg.text ?? "").trim();
  if (msg.chat.type !== "private") return;
  if (!(text === "/start" || text.startsWith("/start"))) return;
  if (!msg.from) return;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("telegram_user_id", msg.from.id)
    .maybeSingle();

  if (!data) {
    // Not a known member — stay quiet, an admin links them from the backoffice.
    return;
  }

  const member = data as { id: string; full_name: string };
  await supabase
    .from("members")
    .update({ bot_dm_enabled: true })
    .eq("id", member.id);

  const firstName = member.full_name.split(/\s+/)[0] || member.full_name;
  await sendMessage(
    msg.chat.id,
    `Salut, ${firstName}! 👋 Ești conectat. Îți voi trimite aici mesaje despre antrenamente.`,
  );
}
