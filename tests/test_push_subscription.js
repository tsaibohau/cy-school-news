const assert = require("node:assert/strict");
const Push = require("../docs/push-subscription.js");

function queryResult(result, capture) {
  const chain = {
    eq(column, value) { capture.filters.push([column, value]); return chain; },
    then(resolve) { return Promise.resolve(result).then(resolve); },
  };
  return chain;
}

async function run() {
  const capture = { rows: [], filters: [], unsubscribed: false };
  const subscription = {
    endpoint: "https://push.example/device-a",
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "public-key", auth: "auth-key" } }; },
    unsubscribe() { capture.unsubscribed = true; return Promise.resolve(true); },
  };
  const registration = { pushManager: {
    getSubscription() { return Promise.resolve(subscription); },
    subscribe() { throw new Error("existing subscription should be reused"); },
  } };
  const client = { from(table) {
    assert.equal(table, "user_push_subscriptions");
    return {
      upsert(row, options) { capture.rows.push({ row, options }); return Promise.resolve({ error: null }); },
      update(row) { capture.update = row; return queryResult({ error: null }, capture); },
    };
  } };
  const auth = {
    getVerifiedSession() { return Promise.resolve({ user: { id: "verified-user-a" }, access_token: "verified-token" }); },
    getClient() { return Promise.resolve(client); },
  };
  const env = {
    Notification: { permission: "default", requestPermission() { this.permission = "granted"; return Promise.resolve("granted"); } },
    PushManager: function () {},
    navigator: { serviceWorker: { ready: Promise.resolve(registration) }, userAgent: "test-agent" },
  };
  const manager = Push.createManager({ env, auth, config: { vapidPublicKey: "AQID" } });
  assert.equal(manager.supported(), true);
  assert.deepEqual(await manager.current(), { supported: true, active: true, permission: "default" });
  await manager.enable();
  assert.equal(capture.rows[0].row.user_id, "verified-user-a", "verified session UID must own the row");
  assert.equal(capture.rows[0].row.endpoint, subscription.endpoint);
  assert.equal(capture.rows[0].options.onConflict, "endpoint");
  await manager.disable();
  assert.deepEqual(capture.filters, [["user_id", "verified-user-a"], ["endpoint", subscription.endpoint]]);
  assert.equal(capture.update.active, false);
  assert.equal(capture.unsubscribed, true);
  assert.equal(Push.supported({}, { vapidPublicKey: "AQID" }), false);
  console.log("Push subscription verified-identity and device lifecycle tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
