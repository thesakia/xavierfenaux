const { test } = require("node:test");
const assert = require("node:assert/strict");
const { summarize, aggregate } = require("../www/master/metrics.js");
test("missing daily data stays null and does not produce a false zero gain", () => {
  const s = summarize(
    [{ account: "x", date: "2026-09-02", followers: 100, posts: 0 }],
    "x",
    "2026-09-01",
    "2026-09-07",
  );
  assert.equal(s.followers, 100);
  assert.equal(s.posts, 0);
  assert.equal(s.reactions, null);
  assert.equal(s.gain, null);
  assert.equal(s.postsDays, 1);
});
test("period totals exclude earlier data and gains require exact endpoints", () => {
  const rows = [
    { account: "x", date: "2026-08-31", followers: 50, posts: 99 },
    { account: "x", date: "2026-09-01", followers: 100, posts: 2 },
    {
      account: "x",
      date: "2026-09-07",
      followers: 95,
      posts: 3,
      totalPosts: 500,
    },
  ];
  const s = summarize(rows, "x", "2026-09-01", "2026-09-07");
  assert.equal(s.gain, -5);
  assert.equal(s.posts, 5);
  assert.equal(s.postsDays, 2);
  assert.equal(s.totalPosts, 500);
});
test("aggregation reports partial coverage and preserves zero", () => {
  assert.deepEqual(
    aggregate(
      [{ followers: 0 }, { followers: null }, { followers: 20 }],
      "followers",
    ),
    { value: 20, count: 2 },
  );
  assert.deepEqual(aggregate([{ gain: null }], "gain"), {
    value: null,
    count: 0,
  });
});
test("a future record cannot leak into an earlier period", () => {
  const s = summarize(
    [{ account: "x", date: "2026-09-08", followers: 500 }],
    "x",
    "2026-09-01",
    "2026-09-07",
  );
  assert.equal(s.followers, null);
});
