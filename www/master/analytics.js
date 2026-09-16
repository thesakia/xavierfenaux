const report = document.getElementById('analytics-data');
if (report && window.Chart) {
  const data = JSON.parse(report.textContent);
  new Chart(document.getElementById('audience-chart'), {
    type: 'bar',
    data: {labels: data.days, datasets: [{label: 'Pages vues', data: data.days.map(day => data.daily[day]?.pageviews ?? 0), backgroundColor: '#21785b', borderRadius: 3}]},
    options: {responsive: true, maintainAspectRatio: false, plugins: {legend: {display: false}}, scales: {y: {beginAtZero: true, ticks: {precision: 0}}, x: {ticks: {maxTicksLimit: 7}}}}
  });
}
