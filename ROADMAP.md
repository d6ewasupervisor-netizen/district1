# Roadmap

- SAS comes back when the office gateway is reachable at `sas-gw.the-dump-bin.com` and signed in. Then confirm a sync completes and check the gateway's `/status` for district1 traffic.
- The 15-minute sync pulls every visit in each matched cycle and one roster call per District 1 visit. Cache rosters or slow the interval if it weighs on the gateway's hourly cap.
