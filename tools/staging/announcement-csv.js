/* Lossless source-text CSV projection; shared by the Preview UI and tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CyNewsAnnouncementCSV = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var columns = ["id", "school", "title", "url", "published_at", "published_at_basis", "source_index_date", "content_updated_at", "body_content", "body_status", "parse_status", "attachment_content", "attachment_status", "detail_json", "source_hash", "exported_at", "data_source", "csv_escaped_columns"];
  function blockText(block) {
    if (!block || typeof block !== "object") return "";
    if (block.type === "paragraph" || block.type === "heading") return typeof block.text === "string" ? block.text : "";
    if (block.type === "list") return (block.items || []).map(function (item) { return typeof item === "string" ? item : ""; }).join("\n");
    if (block.type === "table") return (block.rows || []).map(function (row) { return Array.isArray(row) ? row.join("\t") : ""; }).join("\n");
    return "";
  }
  function textOf(detail) {
    if (typeof detail === "string") return detail;
    if (!detail || typeof detail !== "object") return "";
    if (Array.isArray(detail.blocks)) return detail.blocks.map(blockText).filter(function (v) { return v !== ""; }).join("\n\n");
    return typeof detail.body_content === "string" ? detail.body_content : "";
  }
  function project(record, exportedAt) {
    var item = record.metadata || {}, detail = record.detail;
    var object = detail && typeof detail === "object" ? detail : {};
    var body = textOf(detail), attachments = Array.isArray(object.attachments) ? object.attachments : [];
    var attachmentRows = attachments.map(function (attachment) {
      var text = typeof attachment.embedded_text === "string" ? attachment.embedded_text : "";
      return { filename: attachment.filename || "", url: attachment.url || "", text: text,
        status: text ? "read" : "unread", parse_status: attachment.parse_status || "unknown",
        reason: text ? "" : (attachment.parse_reason || attachment.error_code || attachment.error || "no_parsed_text") };
    });
    // Exclude parser summaries and extracted date judgments from blind-label input.
    // Preserve blocks, links, attachment text and all other source fields without truncation.
    var sourceDetail = detail && typeof detail === "object" ? Object.assign({}, detail) : detail;
    if (sourceDetail && typeof sourceDetail === "object") { delete sourceDetail.summary; delete sourceDetail.snippet; delete sourceDetail.verified_dates; }
    var published = typeof object.published_at === "string" ? object.published_at : "";
    return { id: record.id, school: item.school || "", title: object.title || item.title || "", url: object.source_url || item.url || "",
      published_at: published, published_at_basis: published ? "stored_detail.published_at" : "unknown",
      source_index_date: item.date || "", content_updated_at: record.updated_at || "",
      body_content: body, body_status: !detail ? "missing" : body ? "present" : "empty",
      parse_status: object.parse_status || "unknown", attachment_content: JSON.stringify(attachmentRows),
      attachment_status: !detail ? "unknown" : !attachments.length ? "none_recorded" : attachmentRows.some(function (a) { return a.status === "unread"; }) ? "has_unread" : "read",
      detail_json: detail == null ? "" : JSON.stringify(sourceDetail), source_hash: record.source_hash || object.source_hash || "",
      exported_at: exportedAt, data_source: "preview_supabase", csv_escaped_columns: "" };
  }
  function quote(value) { return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"'; }
  function csv(records, exportedAt) {
    var lines = [columns.map(quote).join(",")];
    records.forEach(function (record) {
      var row = project(record, exportedAt), escaped = [];
      columns.forEach(function (key) {
        var value = String(row[key] == null ? "" : row[key]);
        // Quoting alone does not stop Excel formula execution. This is reversible
        // using csv_escaped_columns; the untouched body is also in detail_json.
        if (/^[\s\uFEFF]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value)) { row[key] = "'" + value; escaped.push(key); }
      });
      row.csv_escaped_columns = JSON.stringify(escaped);
      lines.push(columns.map(function (key) { return quote(row[key]); }).join(","));
    });
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }
  function verifyBatch(ids, records) {
    if (!Array.isArray(records) || records.length !== ids.length) throw new Error("匯出筆數不一致，下載已停止。");
    var seen = new Set();
    records.forEach(function (row, index) {
      if (!row || row.id !== ids[index] || seen.has(row.id)) throw new Error("公告 ID 不一致或重複，下載已停止。");
      seen.add(row.id);
    });
    return records;
  }
  return { columns: columns, project: project, csv: csv, textOf: textOf, verifyBatch: verifyBatch };
});
