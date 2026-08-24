export const shortAddr = (a?: string | null) => a ? `${a.slice(0,6)}…${a.slice(-4)}` : "—";
export const fmtDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" }) : "—";
export const fmtDateTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";
export const timeLeft = (deadline?: string | Date | null) => {
  if (!deadline) return "—";
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000);
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
};
