/* Structured announcement detail renderer. Raw source HTML is never rendered. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CyNewsDetailUI = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function safeUrl(value) {
    try {
      var url = new URL(String(value || ""), "https://invalid.local/");
      return url.protocol === "https:" && url.hostname !== "invalid.local" ? url.href : "";
    } catch (_) { return ""; }
  }
  function validDetailRef(value) {
    return /^data\/details\/(cysh|cygsh)\/[A-Za-z0-9._-]+\.json$/.test(String(value || ""));
  }
  function statusMessage(status) {
    return {
      pending: "完整內文正在排程整理。",
      empty: "官方頁面沒有可安全擷取的內文。",
      unsupported: "這種公告格式目前尚未支援。",
      temporary_error: "官方內文暫時無法取得，系統稍後會重試。",
      permanent_error: "官方內文目前無法解析。",
    }[String(status || "")] || "完整內文尚未完成整理。";
  }
  function renderLinks(links) {
    var valid = (Array.isArray(links) ? links : []).map(function (link) {
      var url = safeUrl(link && link.url);
      return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(link.text || "開啟連結") + '</a>' : "";
    }).filter(Boolean);
    return valid.length ? '<div class="detail-links">' + valid.join("") + '</div>' : "";
  }
  function renderBlock(block) {
    if (!block || typeof block !== "object") return "";
    if (block.type === "heading") {
      var level = Math.max(2, Math.min(6, Number(block.level) || 3));
      return "<h" + level + ' class="detail-heading">' + esc(block.text) + "</h" + level + ">";
    }
    if (block.type === "paragraph") return '<p class="detail-paragraph">' + esc(block.text) + "</p>" + renderLinks(block.links);
    if (block.type === "list") {
      var tag = block.ordered ? "ol" : "ul";
      var items = (Array.isArray(block.items) ? block.items : []).map(function (item) { return "<li>" + esc(item) + "</li>"; }).join("");
      return items ? "<" + tag + ' class="detail-list">' + items + "</" + tag + ">" : "";
    }
    if (block.type === "table") {
      var headerRows = Array.isArray(block.header_rows) ? block.header_rows : [];
      var rows = (Array.isArray(block.rows) ? block.rows : []).map(function (row, index) {
        var cellTag = headerRows.indexOf(index) !== -1 ? "th" : "td";
        return "<tr>" + (Array.isArray(row) ? row : []).map(function (cell) { return "<" + cellTag + ">" + esc(cell) + "</" + cellTag + ">"; }).join("") + "</tr>";
      }).join("");
      return rows ? '<div class="detail-table-wrap"><table class="detail-table"><tbody>' + rows + "</tbody></table></div>" : "";
    }
    return "";
  }
  function renderAttachments(rows, announcementId) {
    var attachments = (Array.isArray(rows) ? rows : []).filter(function (row) {
      return row && row.provenance === "official_attachment" &&
        (!announcementId || String(row.announcement_id) === String(announcementId)) && safeUrl(row.url);
    });
    if (!attachments.length) return "";
    return '<section class="detail-attachments"><h3>附件</h3><ul>' + attachments.map(function (row) {
      var meta = [row.extension, row.mime_type, row.size].filter(Boolean).join(" · ");
      return '<li><div><strong>' + esc(row.filename || "官方附件") + '</strong>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</div><a href="' + esc(safeUrl(row.url)) + '" target="_blank" rel="noopener noreferrer">開啟附件</a></li>';
    }).join("") + "</ul></section>";
  }
  function render(record) {
    if (!record || record.provenance !== "official_article") return '<p class="detail-state">無法驗證這份公告內文，請改看官方來源。</p>';
    var blocks = (Array.isArray(record.blocks) ? record.blocks : []).map(renderBlock).join("");
    var source = safeUrl(record.source_url);
    var sourceLink = source ? '<a class="detail-source" href="' + esc(source) + '" target="_blank" rel="noopener noreferrer">查看官方原始公告 ↗</a>' : "";
    if (record.parse_status !== "parsed" || !blocks) {
      return '<p class="detail-state">' + esc(statusMessage(record.parse_status)) + '</p>' + renderAttachments(record.attachments, record.announcement_id) + sourceLink;
    }
    return '<div class="detail-blocks">' + blocks + '</div>' + renderAttachments(record.attachments, record.announcement_id) + sourceLink;
  }
  return { escape: esc, safeUrl: safeUrl, validDetailRef: validDetailRef, statusMessage: statusMessage,
    renderBlock: renderBlock, renderAttachments: renderAttachments, render: render };
});
