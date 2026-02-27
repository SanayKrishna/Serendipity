# Uptime Monitor (UptimeRobot / cron-job.org)

This document explains two simple external uptime-monitoring options you can use to ping the backend and further reduce cold starts.

1) UptimeRobot (recommended)

- Create a free account at https://uptimerobot.com/
- Add a new HTTP(s) monitor:
  - Monitor Type: `HTTP(s)`
  - Friendly Name: `Serendipity Backend`
  - URL (example): `https://your-railway-url/health/fast`
  - Interval: 5 minutes (free plan supports 5 minutes)
- Save. UptimeRobot will ping from multiple locations and keep the service warm.

2) cron-job.org (simple alternative)

- Create an account at https://cron-job.org/
- Add a new cron job with the request set to `GET` and URL `https://your-railway-url/health/fast`.
- Set schedule to every 5 minutes.

3) Quick curl test (useful for verifying URL)

```bash
curl -i -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://your-railway-url/health/fast
```

Notes
- Replace `https://your-railway-url` with the value of your `RAILWAY_BACKEND_URL`.
- The GitHub Actions `keep-warm.yml` workflow already pings every 5 minutes. Adding an external monitor provides redundancy and pings from different networks.

If you want, I can add a small GitHub Action that notifies you (Slack/email) when the health endpoint fails; tell me which notifier you prefer and I’ll add it.
