const { test } = require("node:test");
const assert = require("node:assert/strict");
const { summarize, aggregate, series, comparison } = require("../www/master/metrics.js");
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
test("combined curves leave missing days empty and count contributing accounts", () => {
  assert.deepEqual(series([
    {account:"x", date:"2026-09-01", followers:0},
    {account:"ig", date:"2026-09-01", followers:30},
    {account:"other", date:"2026-09-01", followers:500},
    {account:"x", date:"2026-09-03", followers:10},
  ], ["x", "ig"], ["2026-09-01", "2026-09-02", "2026-09-03"], "followers"), [
    {date:"2026-09-01", value:30, count:2},
    {date:"2026-09-02", value:null, count:0},
    {date:"2026-09-03", value:10, count:1},
  ]);
});
test("daily comparisons require both complete periods and identical accounts", () => {
  const rows = [1,2,3,4].map(day => ({ account:"x", date:`2026-09-0${day}`, posts: day < 3 ? 1 : 2 }));
  assert.deepEqual(comparison(rows, ["x"], "2026-09-03", "2026-09-04", "posts"), {percent:100, complete:true});
  assert.equal(comparison(rows.slice(1), ["x"], "2026-09-03", "2026-09-04", "posts").percent, null);
  assert.equal(comparison(rows, ["x", "ig"], "2026-09-03", "2026-09-04", "posts").percent, null);
});
test("follower comparisons reject stale snapshots and zero denominators", () => {
  const rows = [{account:"x", date:"2026-09-02", followers:100}, {account:"x", date:"2026-09-04", followers:120}];
  assert.equal(comparison(rows, ["x"], "2026-09-03", "2026-09-04", "followers").percent, 20);
  assert.equal(comparison(rows.slice(0,1), ["x"], "2026-09-03", "2026-09-04", "followers").percent, null);
  rows[0].followers = 0;
  assert.equal(comparison(rows, ["x"], "2026-09-03", "2026-09-04", "followers").percent, null);
});
