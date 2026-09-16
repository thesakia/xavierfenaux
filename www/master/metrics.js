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
    for (const field of ["posts", "reactions", "views", "comments", "shares", "followersGained", "followersLost", "watchMinutes", "saves"]) {
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
  function series(records, accounts, dates, field) {
    const ids = new Set(accounts);
    const byDate = new Map();
    for (const row of records) {
      if (!ids.has(row.account) || !finite(row[field])) continue;
      if (!byDate.has(row.date)) byDate.set(row.date, new Map());
      byDate.get(row.date).set(row.account, row[field]);
    }
    return dates.map(date => {
      const values = [...(byDate.get(date)?.values() || [])];
      return { date, value: values.length ? values.reduce((a, b) => a + b, 0) : null, count: values.length };
    });
  }
  function comparison(records, accounts, start, end, field) {
    const offset = (date, n) => {
      const d = new Date(date + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    const previousStart = offset(start, -days), previousEnd = offset(start, -1);
    const current = accounts.map(id => summarize(records, id, start, end));
    const previous = accounts.map(id => summarize(records, id, previousStart, previousEnd));
    // Compare the same accounts and complete windows; partial totals can mislead.
    const complete = accounts.length > 0 && current.every((s, i) => field === "followers"
      ? s.followerDate === end && previous[i].followerDate === previousEnd
      : s[field + "Days"] === days && previous[i][field + "Days"] === days);
    const now = aggregate(current, field).value, before = aggregate(previous, field).value;
    return { percent: complete && finite(now) && finite(before) && before > 0 ? (now - before) / before * 100 : null, complete };
  }
  const api = { summarize, aggregate, series, comparison };
  if (typeof module !== "undefined") module.exports = api;
  else root.CockpitMetrics = api;
})(typeof window !== "undefined" ? window : globalThis);
