// Pure logic for the announcement email digest. No network or env access here,
// so the same file runs in the Edge Function (Deno) and in Node tests.

export const DEFAULTS = Object.freeze({
  schools: ["cysh", "cygsh"],
  lookbackHours: 72,
  maxItems: 20,
  dailyHourTaipei: 7,
  instantMinGapMinutes: 50,
  dailyMinGapHours: 20,
})

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

function time(value) {
  const parsed = Date.parse(String(value || ""))
  return Number.isNaN(parsed) ? NaN : parsed
}

export function taipeiHour(now) {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).getUTCHours()
}

// Decide whether this run should send to a recipient at all.
export function isDue(recipient, now, options = {}) {
  const opts = { ...DEFAULTS, ...options }
  const last = time(recipient.last_sent_at)
  const sinceLast = Number.isNaN(last) ? Infinity : now.getTime() - last
  if (recipient.frequency === "instant") {
    return sinceLast >= opts.instantMinGapMinutes * 60 * 1000
  }
  return taipeiHour(now) === opts.dailyHourTaipei &&
    sinceLast >= opts.dailyMinGapHours * 60 * 60 * 1000
}

export function normalizeKeywords(value) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(value) ? value : []) {
    const keyword = String(raw || "").trim().toLowerCase()
    if (!keyword || keyword.length > 40 || seen.has(keyword)) continue
    seen.add(keyword)
    out.push(keyword)
    if (out.length >= 60) break
  }
  return out
}

function itemText(item) {
  return [item.title, item.category, item.source_category]
    .map((part) => String(part || "")).join(" ").toLowerCase()
}

// Pick the new announcements that match one recipient's keywords.
export function selectItems(items, recipient, now, options = {}) {
  const opts = { ...DEFAULTS, ...options }
  const keywords = normalizeKeywords(recipient.keywords)
  if (!keywords.length) return []
  const schools = new Set(opts.schools)
  const sent = new Set(Array.isArray(recipient.sent_ids) ? recipient.sent_ids : [])
  const enabledAt = time(recipient.enabled_at)
  const floor = Math.max(
    Number.isNaN(enabledAt) ? now.getTime() : enabledAt,
    now.getTime() - opts.lookbackHours * 60 * 60 * 1000,
  )
  const seen = new Set()
  const picked = []
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.id !== "string" || !item.id || seen.has(item.id) || sent.has(item.id)) continue
    if (!schools.has(item.school)) continue
    const firstSeen = time(item.first_seen)
    if (Number.isNaN(firstSeen) || firstSeen <= floor || firstSeen > now.getTime() + 60 * 1000) continue
    const text = itemText(item)
    const matched = keywords.filter((keyword) => text.includes(keyword))
    if (!matched.length) continue
    seen.add(item.id)
    picked.push({ item, matched, firstSeen })
  }
  picked.sort((a, b) => b.firstSeen - a.firstSeen)
  return picked.slice(0, opts.maxItems)
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character])
}

function safeUrl(value, fallback) {
  try {
    const url = new URL(String(value || ""))
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : fallback
  } catch {
    return fallback
  }
}

export function buildEmail(picked, { siteUrl, unsubscribeUrl, frequency, schoolNames = {} }) {
  const count = picked.length
  const first = picked[0]?.item?.title || ""
  const subject = count === 1
    ? `嘉校快訊：${String(first).slice(0, 60)}`
    : `嘉校快訊：${count} 則符合追蹤的新公告`
  const rows = picked.map(({ item, matched }) => {
    const link = safeUrl(item.url, siteUrl)
    const school = schoolNames[item.school] || item.school_name || item.school
    return `<li style="margin:0 0 14px"><a href="${escapeHtml(link)}" style="color:#0f6b5c;font-weight:600">${escapeHtml(item.title)}</a>` +
      `<br><span style="color:#667b76;font-size:13px">${escapeHtml(school)} · ${escapeHtml(item.date || "")} · 關鍵字：${escapeHtml(matched.join("、"))}</span></li>`
  }).join("")
  const cadence = frequency === "instant" ? "有新公告時寄送" : "每日摘要"
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#17332d;max-width:560px">` +
    `<h2 style="font-size:18px">${escapeHtml(subject)}</h2><ul style="padding-left:18px">${rows}</ul>` +
    `<p><a href="${escapeHtml(siteUrl)}">開啟嘉校快訊</a></p>` +
    `<p style="color:#667b76;font-size:12px">你在嘉校快訊開啟了 Email 通知（${cadence}）。` +
    `可在網站「我的 → 關鍵字追蹤」調整，或 <a href="${escapeHtml(unsubscribeUrl)}">一鍵取消 Email 通知</a>。</p></div>`
  const text = picked.map(({ item }) => `• ${item.title}\n  ${safeUrl(item.url, siteUrl)}`).join("\n") +
    `\n\n取消 Email 通知：${unsubscribeUrl}`
  return { subject, html, text }
}

// HMAC-SHA256 unsubscribe token bound to the user ID.
export async function unsubscribeToken(secret, userId) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`unsubscribe:${userId}`))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function verifyUnsubscribeToken(secret, userId, token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || "")) || !/^[0-9a-f]{64}$/.test(String(token || ""))) return false
  const expected = await unsubscribeToken(secret, userId)
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ token.charCodeAt(index)
  return diff === 0
}
