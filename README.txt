Toggle a proxy on, decide which domains tunnel through it, or let auto-mode figure it out from failed DNS lookups.

USE CASES
• Route a handful of internal tools through a corp/VPN SOCKS tunnel, leave the rest of the web direct.
• Debug a staging environment reachable only via a bastion, without breaking the rest of your session.
• Point a single domain at a local proxy (mitmproxy, Charles, a dev socks tunnel) while browsing normally elsewhere.
• Let auto-mode figure out which internal hostnames belong behind the tunnel instead of maintaining a list by hand.

HIGHLIGHTS
• One-click toggle per proxy from the toolbar popup. Icon turns green when the proxy is reachable, red when it's down, neutral when off.
• Supports SOCKS5 / SOCKS4 / HTTP / HTTPS upstreams (socks5://host:1080, http://host:8080, …).
• Three routing modes per entry:
  – Whitelist: only listed domains go through the proxy.
  – Blacklist: everything goes through the proxy except listed domains (localhost is always bypassed).
  – Auto: starts as whitelist, then silently learns. When a page fails with ERR_NAME_NOT_RESOLVED, the hostname is added to the proxied list and the tab reloads — no babysitting.
• Domain matching by suffix (example.com also covers api.example.com, *.example.com supported) or by regex for power users.
• Live health check: every 5s a generate_204 probe via the proxy confirms it's actually routing, not just configured. The icon reflects real connectivity, not wishful thinking.
• Manage any number of proxies side-by-side — pick the active one with a single click, rename, edit, or drop entries inline. Only one is active at a time; toggling a new one replaces the previous.
• "Clear learned" button to reset an auto-mode proxy's accumulated hostname list.
• Generates its own PAC script under the hood — no external tools, no system proxy juggling.

OPEN SOURCE
Source on GitHub — https://github.com/Matthour/proxied
