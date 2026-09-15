/* Daily quantities and follower snapshots have different aggregation rules. */
(function (root) {
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  function summarize(records, account, start, end) {
    const all = records
      .filter((r) => r.account === account && r.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date));
    const rows = all.filter((r) => r.date >= start);
    const followerRows = all.filter((r) => finite(r.followers));
    const last = followerRows.at(-1);
    const baseline = followerRows.find((r) => r.date === start);
    const endpoint = followerRows.find((r) => r.date === end);
    const result = {
      followers: last?.followers ?? null,
      followerDate: last?.date ?? null,
      followerSource: last?.sources?.followers ?? last?.source ?? null,
      gain:
        baseline && endpoint && start !== end
          ? endpoint.followers - baseline.followers
          : null,
      rows,
    };
    for (const field of ["posts", "reactions", "views", "comments", "shares"]) {
      const available = rows.filter((r) => finite(r[field]));
      result[field] = available.length
        ? available.reduce((sum, r) => sum + r[field], 0)
        : null;
      result[field + "Days"] = available.length;
    }
    for (const field of ["totalPosts", "totalViews", "totalLikes"]) {
      const row = all.filter((r) => finite(r[field])).at(-1);
      result[field] = row?.[field] ?? null;
      result[field + "Date"] = row?.date ?? null;
    }
    return result;
  }
  function aggregate(summaries, field) {
    const values = summaries.map((s) => s[field]).filter(finite);
    return {
      value: values.length ? values.reduce((a, b) => a + b, 0) : null,
      count: values.length,
    };
  }
  const api = { summarize, aggregate };
  if (typeof module !== "undefined") module.exports = api;
  else root.CockpitMetrics = api;
})(typeof window !== "undefined" ? window : globalThis);
