#!/usr/bin/env python3
import html
import subprocess
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUTPUT_PATH = Path("/var/www/umami-overview/index.html")
SITES = {
    "parentsdejumeaux.fr": "Parents de Jumeaux",
    "xavierfenaux.com": "Xavier Fenaux",
}


def run_psql(query):
    result = subprocess.run(
        [
            "docker",
            "exec",
            "umami-db",
            "psql",
            "-U",
            "umami",
            "-d",
            "umami",
            "-At",
            "-F",
            "\t",
            "-c",
            query,
        ],
        check=True,
        text=True,
        capture_output=True,
    )
    rows = []
    for line in result.stdout.splitlines():
        if line.strip():
            rows.append(line.split("\t"))
    return rows


def esc(value):
    return html.escape(str(value or ""), quote=True)


def to_int(value):
    try:
        return int(value or 0)
    except ValueError:
        return 0


def load_summary():
    domains = "', '".join(SITES.keys())
    query = f"""
        select
            w.domain,
            count(*) filter (where e.event_type = 1 and e.created_at >= now() - interval '24 hours') as pageviews_24h,
            count(distinct e.session_id) filter (where e.event_type = 1 and e.created_at >= now() - interval '24 hours') as visitors_24h,
            count(*) filter (where e.event_name like 'click%' and e.created_at >= now() - interval '24 hours') as clicks_24h,
            count(*) filter (where e.event_type = 1 and e.created_at >= now() - interval '7 days') as pageviews_7d,
            count(distinct e.session_id) filter (where e.event_type = 1 and e.created_at >= now() - interval '7 days') as visitors_7d,
            count(*) filter (where e.event_name like 'click%' and e.created_at >= now() - interval '7 days') as clicks_7d,
            count(*) filter (where e.event_type = 1) as pageviews_total,
            count(*) filter (where e.event_name like 'click%') as clicks_total
        from website w
        left join website_event e on e.website_id = w.website_id
        where w.domain in ('{domains}') and w.deleted_at is null
        group by w.domain
        order by w.domain;
    """
    summary = {}
    for row in run_psql(query):
        summary[row[0]] = {
            "pageviews_24h": to_int(row[1]),
            "visitors_24h": to_int(row[2]),
            "clicks_24h": to_int(row[3]),
            "pageviews_7d": to_int(row[4]),
            "visitors_7d": to_int(row[5]),
            "clicks_7d": to_int(row[6]),
            "pageviews_total": to_int(row[7]),
            "clicks_total": to_int(row[8]),
        }
    return summary


def load_daily():
    domains = "', '".join(SITES.keys())
    query = f"""
        select
            w.domain,
            to_char(date_trunc('day', e.created_at), 'YYYY-MM-DD') as day,
            count(*) filter (where e.event_type = 1) as pageviews,
            count(*) filter (where e.event_name like 'click%') as clicks
        from website_event e
        join website w on w.website_id = e.website_id
        where w.domain in ('{domains}')
          and w.deleted_at is null
          and e.created_at >= date_trunc('day', now()) - interval '13 days'
        group by w.domain, day
        order by w.domain, day;
    """
    start = datetime.now(timezone.utc).date() - timedelta(days=13)
    days = [(start + timedelta(days=i)).isoformat() for i in range(14)]
    daily = {domain: {day: {"pageviews": 0, "clicks": 0} for day in days} for domain in SITES}
    for domain, day, pageviews, clicks in run_psql(query):
        daily.setdefault(domain, {})[day] = {
            "pageviews": to_int(pageviews),
            "clicks": to_int(clicks),
        }
    return days, daily


def load_top_pages():
    domains = "', '".join(SITES.keys())
    query = f"""
        with ranked as (
            select
                w.domain,
                coalesce(nullif(e.url_path, ''), '/') as path,
                count(*) as views,
                row_number() over (partition by w.domain order by count(*) desc) as rank
            from website_event e
            join website w on w.website_id = e.website_id
            where w.domain in ('{domains}')
              and w.deleted_at is null
              and e.event_type = 1
              and e.created_at >= now() - interval '7 days'
            group by w.domain, path
        )
        select domain, path, views from ranked where rank <= 8 order by domain, views desc;
    """
    pages = defaultdict(list)
    for domain, path, views in run_psql(query):
        pages[domain].append({"path": path, "views": to_int(views)})
    return pages


def load_top_clicks():
    domains = "', '".join(SITES.keys())
    query = f"""
        with click_data as (
            select
                ed.website_event_id,
                max(ed.string_value) filter (where ed.data_key = 'label') as label,
                max(ed.string_value) filter (where ed.data_key = 'section') as section,
                max(ed.string_value) filter (where ed.data_key = 'href') as href,
                max(ed.string_value) filter (where ed.data_key = 'href_type') as href_type
            from event_data ed
            group by ed.website_event_id
        ),
        ranked as (
            select
                w.domain,
                coalesce(nullif(cd.label, ''), '(sans libelle)') as label,
                coalesce(nullif(cd.section, ''), '-') as section,
                coalesce(nullif(cd.href, ''), '-') as href,
                coalesce(nullif(cd.href_type, ''), '-') as href_type,
                count(*) as clicks,
                row_number() over (partition by w.domain order by count(*) desc) as rank
            from website_event e
            join website w on w.website_id = e.website_id
            left join click_data cd on cd.website_event_id = e.event_id
            where w.domain in ('{domains}')
              and w.deleted_at is null
              and e.event_name like 'click%'
              and e.created_at >= now() - interval '7 days'
            group by w.domain, label, section, href, href_type
        )
        select domain, label, section, href, href_type, clicks
        from ranked
        where rank <= 10
        order by domain, clicks desc;
    """
    clicks = defaultdict(list)
    for domain, label, section, href, href_type, count in run_psql(query):
        clicks[domain].append({
            "label": label,
            "section": section,
            "href": href,
            "href_type": href_type,
            "clicks": to_int(count),
        })
    return clicks


def load_referrers():
    domains = "', '".join(SITES.keys())
    query = f"""
        with ranked as (
            select
                w.domain,
                coalesce(nullif(e.referrer_domain, ''), '(direct)') as referrer,
                count(*) as visits,
                row_number() over (partition by w.domain order by count(*) desc) as rank
            from website_event e
            join website w on w.website_id = e.website_id
            where w.domain in ('{domains}')
              and w.deleted_at is null
              and e.event_type = 1
              and e.created_at >= now() - interval '7 days'
            group by w.domain, referrer
        )
        select domain, referrer, visits from ranked where rank <= 6 order by domain, visits desc;
    """
    referrers = defaultdict(list)
    for domain, referrer, visits in run_psql(query):
        referrers[domain].append({"referrer": referrer, "visits": to_int(visits)})
    return referrers


def metric_card(label, value, hint=""):
    return f"""
        <div class="metric-card">
            <span>{esc(label)}</span>
            <strong>{esc(value)}</strong>
            <small>{esc(hint)}</small>
        </div>
    """


def bar_chart(days, values, key):
    max_value = max([values.get(day, {}).get(key, 0) for day in days] + [1])
    bars = []
    for day in days:
        value = values.get(day, {}).get(key, 0)
        height = max(4, round((value / max_value) * 100)) if value else 4
        label = datetime.fromisoformat(day).strftime("%d/%m")
        bars.append(
            f'<div class="bar" style="height:{height}%"><span>{value}</span><em>{esc(label)}</em></div>'
        )
    return '<div class="bars">' + "".join(bars) + "</div>"


def list_rows(items, value_key, label_key, sub_keys=None):
    sub_keys = sub_keys or []
    if not items:
        return '<div class="empty">Pas encore assez de donnees.</div>'
    max_value = max([item[value_key] for item in items] + [1])
    rows = []
    for item in items:
        width = max(6, round((item[value_key] / max_value) * 100))
        sub = " · ".join([str(item.get(key, "")) for key in sub_keys if item.get(key)])
        rows.append(f"""
            <div class="list-row">
                <div class="row-main">
                    <strong>{esc(item[label_key])}</strong>
                    <span>{esc(sub)}</span>
                </div>
                <b>{esc(item[value_key])}</b>
                <i style="width:{width}%"></i>
            </div>
        """)
    return "".join(rows)


def render():
    summary = load_summary()
    days, daily = load_daily()
    pages = load_top_pages()
    clicks = load_top_clicks()
    referrers = load_referrers()
    generated_at = datetime.now().strftime("%d/%m/%Y %H:%M")

    site_sections = []
    for domain, name in SITES.items():
        data = summary.get(domain, {})
        site_sections.append(f"""
            <section class="site-panel">
                <div class="site-header">
                    <div>
                        <p>{esc(domain)}</p>
                        <h2>{esc(name)}</h2>
                    </div>
                    <a href="https://{esc(domain)}" target="_blank" rel="noopener">Ouvrir le site</a>
                </div>
                <div class="metrics">
                    {metric_card("Vues 24h", data.get("pageviews_24h", 0), "pages vues")}
                    {metric_card("Visiteurs 24h", data.get("visitors_24h", 0), "sessions uniques")}
                    {metric_card("Clics 24h", data.get("clicks_24h", 0), "events click")}
                    {metric_card("Vues 7j", data.get("pageviews_7d", 0), "tendance courte")}
                    {metric_card("Visiteurs 7j", data.get("visitors_7d", 0), "audience")}
                    {metric_card("Clics 7j", data.get("clicks_7d", 0), "engagement")}
                </div>
                <div class="chart-grid">
                    <article>
                        <h3>Vues sur 14 jours</h3>
                        {bar_chart(days, daily.get(domain, {}), "pageviews")}
                    </article>
                    <article>
                        <h3>Clics sur 14 jours</h3>
                        {bar_chart(days, daily.get(domain, {}), "clicks")}
                    </article>
                </div>
                <div class="insights">
                    <article>
                        <h3>Top pages 7j</h3>
                        {list_rows(pages.get(domain, []), "views", "path")}
                    </article>
                    <article>
                        <h3>Top clics 7j</h3>
                        {list_rows(clicks.get(domain, []), "clicks", "label", ["section", "href_type", "href"])}
                    </article>
                    <article>
                        <h3>Sources 7j</h3>
                        {list_rows(referrers.get(domain, []), "visits", "referrer")}
                    </article>
                </div>
            </section>
        """)

    total_pageviews_7d = sum(summary.get(domain, {}).get("pageviews_7d", 0) for domain in SITES)
    total_visitors_7d = sum(summary.get(domain, {}).get("visitors_7d", 0) for domain in SITES)
    total_clicks_7d = sum(summary.get(domain, {}).get("clicks_7d", 0) for domain in SITES)

    return f"""<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>Overview Umami · Parents + Xavier</title>
    <style>
        :root {{
            --bg: #0c1020;
            --panel: #141a2e;
            --panel-2: #101729;
            --text: #f5f7fb;
            --muted: #9aa5bd;
            --line: rgba(255,255,255,.09);
            --accent: #74d8ff;
            --accent-2: #b69cff;
            --good: #7ee7ad;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            min-height: 100vh;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
            color: var(--text);
            background:
                radial-gradient(circle at 20% 0%, rgba(116,216,255,.18), transparent 35%),
                radial-gradient(circle at 85% 8%, rgba(182,156,255,.18), transparent 32%),
                var(--bg);
        }}
        .wrap {{ width: min(1220px, calc(100% - 32px)); margin: 0 auto; padding: 34px 0 56px; }}
        header {{ display: flex; justify-content: space-between; gap: 20px; align-items: flex-end; margin-bottom: 24px; }}
        h1 {{ margin: 0; font-size: clamp(2rem, 4vw, 4rem); letter-spacing: -.04em; }}
        header p, .site-header p {{ color: var(--muted); margin: 0 0 8px; font-weight: 700; text-transform: uppercase; font-size: .72rem; letter-spacing: .14em; }}
        .stamp {{ color: var(--muted); font-size: .9rem; text-align: right; }}
        .global-metrics, .metrics, .chart-grid, .insights {{ display: grid; gap: 12px; }}
        .global-metrics {{ grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 18px; }}
        .metrics {{ grid-template-columns: repeat(6, minmax(0, 1fr)); margin: 18px 0; }}
        .metric-card, .site-panel, article {{
            background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.025));
            border: 1px solid var(--line);
            border-radius: 14px;
            box-shadow: 0 18px 50px rgba(0,0,0,.18);
        }}
        .metric-card {{ padding: 16px; }}
        .metric-card span, .metric-card small {{ display: block; color: var(--muted); }}
        .metric-card span {{ font-size: .78rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }}
        .metric-card strong {{ display: block; font-size: clamp(1.8rem, 3vw, 2.7rem); margin: 8px 0 2px; letter-spacing: -.04em; }}
        .site-panel {{ padding: 18px; margin-top: 18px; }}
        .site-header {{ display: flex; justify-content: space-between; align-items: center; gap: 16px; }}
        .site-header h2 {{ margin: 0; font-size: clamp(1.45rem, 3vw, 2.4rem); letter-spacing: -.03em; }}
        a {{ color: var(--accent); text-decoration: none; font-weight: 800; }}
        .chart-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
        .insights {{ grid-template-columns: 1.1fr 1.3fr .9fr; margin-top: 12px; }}
        article {{ padding: 16px; min-width: 0; }}
        article h3 {{ margin: 0 0 14px; font-size: .95rem; color: var(--text); }}
        .bars {{ height: 190px; display: flex; align-items: end; gap: 7px; border-bottom: 1px solid var(--line); padding-top: 24px; }}
        .bar {{ position: relative; flex: 1; min-width: 8px; border-radius: 7px 7px 0 0; background: linear-gradient(180deg, var(--accent), var(--accent-2)); opacity: .9; }}
        .bar span {{ position: absolute; left: 50%; top: -22px; transform: translateX(-50%); color: var(--muted); font-size: .68rem; }}
        .bar em {{ position: absolute; left: 50%; bottom: -24px; transform: translateX(-50%) rotate(-45deg); color: var(--muted); font-style: normal; font-size: .66rem; white-space: nowrap; }}
        .list-row {{ position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); overflow: hidden; }}
        .list-row:last-child {{ border-bottom: 0; }}
        .list-row i {{ position: absolute; left: 0; bottom: 0; height: 2px; background: linear-gradient(90deg, var(--accent), var(--good)); border-radius: 99px; }}
        .row-main {{ min-width: 0; }}
        .row-main strong {{ display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; }}
        .row-main span {{ display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: .75rem; margin-top: 3px; }}
        .list-row b {{ color: var(--good); }}
        .empty {{ color: var(--muted); padding: 12px 0; }}
        @media (max-width: 980px) {{
            header, .site-header {{ align-items: flex-start; flex-direction: column; }}
            .global-metrics, .metrics, .chart-grid, .insights {{ grid-template-columns: 1fr; }}
            .stamp {{ text-align: left; }}
        }}
    </style>
</head>
<body>
    <div class="wrap">
        <header>
            <div>
                <p>Umami overview</p>
                <h1>Parents + Xavier</h1>
            </div>
            <div class="stamp">Mis a jour le {esc(generated_at)}<br>Regeneration automatique toutes les 5 min</div>
        </header>
        <div class="global-metrics">
            {metric_card("Vues 7j total", total_pageviews_7d, "2 sites")}
            {metric_card("Visiteurs 7j total", total_visitors_7d, "sessions uniques")}
            {metric_card("Clics 7j total", total_clicks_7d, "events click")}
        </div>
        {''.join(site_sections)}
    </div>
</body>
</html>
"""


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(render(), encoding="utf-8")


if __name__ == "__main__":
    main()
