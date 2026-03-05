# Where Goes the Link

A Chrome extension (Manifest V3) that expands shortened URLs without visiting them. Click the icon, get the real destination copied to your clipboard. No tracking pixels fired, no pages loaded.

Powered by the free [UnshortLink API](https://unshortlink.com).

## Why this exists

If you use a network-level firewall like [Little Snitch](https://obdev.at/products/littlesnitch/) with blocklists such as [ph00lt0/blocklist](https://github.com/ph00lt0/blocklist) (22,500+ short URL domains), you can't visit shortened links at all. Toggling the entire list on and off is disruptive, and editing individual entries breaks automatic updates.

This extension resolves those links via a third-party API — the lookup happens on their servers, not your machine, so your firewall rules stay intact. The trade-off is a slight delay (a few seconds) while the API follows the redirect chain.

## How it works

1. Navigate to a page with a shortened URL (e.g. a `t.co` or `bit.ly` link)
2. Click the extension icon in the toolbar
3. The icon turns orange while resolving, then green on success
4. The expanded destination URL is copied to your clipboard
5. A notification shows the result (both an OS notification and a page overlay)

## Installation

### From source (Developer Mode)

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the `where_goes_the_link` folder
5. The onboarding wizard will open automatically — follow it to set up your API key

### API key setup

1. Create a free account at [UnshortLink Portal](https://portal.unshortlink.com/)
2. Copy your API key from the dashboard
3. Paste it into the extension (during onboarding or in Settings)

The free plan includes **500 API calls per month** — no credit card required.

## Features

- **One-click expand** — click the icon, get the real URL on your clipboard
- **No page visits** — the API resolves redirects server-side
- **Visual feedback** — icon changes color (orange = processing, green = success, red = error)
- **Dual notifications** — page overlay with selectable text + OS notification as fallback
- **Quota tracking** — optional badge showing days remaining or API calls left
- **Rate limiting** — built-in 5-second cooldown to respect API limits
- **Configurable** — all timings, timeouts, and display options adjustable in Settings
- **Privacy-first** — no telemetry, no analytics, API key stored locally

## Settings

Right-click the extension icon and choose **Settings**, or go to `chrome://extensions` and click Options.

| Section                 | What you can configure                                            |
| ----------------------- | ----------------------------------------------------------------- |
| API Configuration       | API key, base URL, endpoint path                                  |
| Advanced API Parameters | Max redirect hops, per-hop timeout                                |
| Quota (Manual Override) | Total plan calls, billing cycle start                             |
| Badge Display           | Show/hide badge, choose between days remaining or calls remaining |
| Visual Feedback Timing  | Duration of processing, success, and error icon states            |
| Notification Timing     | How long the page overlay and OS notification stay visible        |

## File structure

```
where_goes_the_link/
├── manifest.json            # Manifest V3 configuration
├── background.js            # Service worker — all core logic
├── offscreen.html/js        # Clipboard write bridge
├── content-overlay.js/css   # Injected page toast overlay
├── options.html/js/css      # Settings page
├── onboarding.html/js/css   # First-install setup wizard
└── icons/                   # 20 PNGs (5 states × 4 sizes)
```

## Permissions

| Permission       | Why                                                |
| ---------------- | -------------------------------------------------- |
| `activeTab`      | Read the current tab's URL when you click the icon |
| `scripting`      | Inject the overlay toast into pages                |
| `contextMenus`   | Right-click menu (Settings, Setup Guide)           |
| `notifications`  | OS-level notifications                             |
| `storage`        | Persist settings, API key, quota data              |
| `offscreen`      | Clipboard write from service worker                |
| `clipboardWrite` | Allow clipboard access in offscreen document       |

## License

MIT
