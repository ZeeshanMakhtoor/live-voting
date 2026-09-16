/**
 * Minimal structured logging to stderr/stdout — Vercel captures
 * console output as function logs automatically, so this needs no
 * external service to be useful. Deliberately never logs voter_id,
 * passwords, or any other credential/PII: every call site below is
 * scoped to exactly the fields needed to diagnose the failure.
 */
type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "error" | "warn", event: string, fields: LogFields) {
  const entry = { level, event, ...fields, ts: new Date().toISOString() };
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(entry));
}

export const logger = {
  voteFailed(fields: { participantId: string; rating: number; code: string | undefined }) {
    emit("warn", "vote_failed", {
      participant_id: fields.participantId,
      rating: fields.rating,
      code: fields.code ?? "unknown",
    });
  },
  adminActionFailed(fields: { action: string; code: string | undefined }) {
    emit("warn", "admin_action_failed", {
      action: fields.action,
      code: fields.code ?? "unknown",
    });
  },
  realtimeStatus(fields: { app: "audience" | "admin"; status: string }) {
    emit("warn", "realtime_status", { app: fields.app, status: fields.status });
  },
  pageError(fields: { surface: "audience" | "admin"; code: string | undefined }) {
    emit("error", "page_error", { surface: fields.surface, code: fields.code ?? "unknown" });
  },
  loginFailed() {
    // Deliberately no email/password — just that an attempt failed.
    emit("warn", "admin_login_failed", {});
  },
};
