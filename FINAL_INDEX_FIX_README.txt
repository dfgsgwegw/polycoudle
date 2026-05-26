Full final index.html fix:
- Restores METAR/WU table rendering.
- WU grouped into next METAR window.
- Chart rendered as HTML bars, no canvas needed.
- No temp-chart getContext error.
- Refreshes UI every 30 sec from /api/history.
- node --check: 0

