# cliget-next

Turn any browser download into a command-line download — with the cookies,
user agent and referrer of the original request, so login-protected files keep
working outside the browser.

This is a maintained fork of [zaidka/cliget](https://github.com/zaidka/cliget)
that fixes the generated commands (upstream's `aria2c` line runs on a **single
connection**), adds download-queue backends, and ports the extension to
Manifest V3 so it runs on Chrome as well as Firefox.

---

## What changed in 3.0

### Downloads are actually fast now

Upstream emitted a bare `aria2c` with only headers. aria2 defaults to
`--max-connection-per-server=1`, so that command was no faster than curl. The
generated command now segments the download:

```
aria2c --max-connection-per-server=16 --split=16 --min-split-size=1M \
  --continue=true --auto-file-renaming=false \
  --file-allocation=falloc --disk-cache=64M \
  --max-tries=0 --retry-wait=5 --max-file-not-found=3 \
  --timeout=60 --connect-timeout=15 \
  --user-agent '…' --referer '…' --header 'Cookie: …' --out 'file.7z' 'https://…'
```

| Flag                                        | Why                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-connection-per-server` / `--split`   | The whole point of aria2. 16 is aria2's hard maximum.                                                                                                           |
| `--min-split-size=1M`                       | The 20M default leaves a 100M file split into only five pieces.                                                                                                 |
| `--continue` + `--auto-file-renaming=false` | Re-running resumes instead of starting `file.1.7z`.                                                                                                             |
| `--file-allocation=falloc`                  | Instant preallocation on ext4/btrfs/xfs/NTFS, and stops a large file fragmenting under 16 concurrent writers. Switch to `none` on FAT32/HFS+ or network shares. |
| `--max-tries=0` + `--max-file-not-found=3`  | Retry transient failures forever, but give up quickly on a dead URL.                                                                                            |

If the server ignores range requests, aria2 reports `CN:1` in its status line
and no amount of tuning will help — that is a server limit, not a config bug.

### Headers that silently broke downloads are now dropped

These are removed from every generated command regardless of settings:

- **`Host`** — upstream replayed the browser's copy. A pinned `Host` breaks
  redirects and TLS virtual-host routing.
- **`Range` / `If-Range`** — the browser routinely requests a byte range for
  media. Replaying it truncates the file _and_ disables segmented downloading
  entirely.
- **`If-Modified-Since` / `If-None-Match`** — a 304 leaves you with an empty
  file.
- Hop-by-hop headers (`Connection`, `Keep-Alive`, `TE`, `Upgrade`, …).

Noise headers (`Sec-Fetch-*`, `DNT`, `Sec-GPC`, client hints, …) are dropped by
default too, but that is a toggle — they carry no authentication.

### curl and wget got their missing flags

- curl now passes **`--location`**. Without it, a download link that 302s to a
  CDN saved the redirect stub instead of the file.
- curl passes `--fail`, so an HTTP 403 error page is no longer written to disk
  under your filename and mistaken for a successful download.
- curl passes `--globoff`, `--continue-at -` and retry flags.
- wget gets `--continue`, `--tries=0`, `--waitretry`, `--retry-connrefused`,
  and `--content-disposition` when no filename was captured.

Neither can segment a download — use aria2 when throughput matters.

### Filenames from the server are sanitised

A `Content-Disposition` of `attachment; filename="../../.bashrc"` used to go
straight into `--out`. Path separators, control characters, leading dots and
Windows device names are now stripped. RFC 5987 `filename*` values with a
language tag parse correctly.

---

## Download queues

Three backends turn a captured request into a queued download instead of a
foreground command. In queue modes the popup also shows a **Send now** button
that submits directly from the browser — no terminal needed.

### aria2 over JSON-RPC

Start the daemon once:

```sh
aria2c --enable-rpc --rpc-listen-all=false --rpc-secret=YOUR_TOKEN \
       --continue=true --max-concurrent-downloads=3 --daemon=true
```

cliget then generates (or sends) an `aria2.addUri` call carrying all the
tuning above. Downloads survive closing the browser, and you can drive the
queue from a UI such as [AriaNg](https://github.com/mayswind/AriaNg).

### aria2 input-file

No daemon. cliget appends a stanza to a plain-text queue file:

```
cat >> ~/aria2-queue.txt <<'CLIGET_EOF'
https://example.net/file.7z
  max-connection-per-server=16
  split=16
  header=Cookie: session=…
  out=file.7z
CLIGET_EOF
```

Drain it whenever you like:

```sh
aria2c --input-file=~/aria2-queue.txt --max-concurrent-downloads=1 --continue=true
```

### Gopeed

[Gopeed](https://gopeed.com) is an actively developed Go download manager with
a persistent queue and a web UI. cliget posts to its REST API
(`POST /api/v1/tasks`, default port 9999, `X-Api-Token` header when a token is
configured).

---

## aria2 vs aria2-next

aria2 upstream has been dormant for years.
[aria2-next](https://github.com/AnInsomniacy/aria2-next) is a maintained fork
with the same option surface. Pick the binary in the popup — every aria2 mode
here, including both queue modes, works against either.

---

## Settings

The toolbar popup shows the command for the download you clicked, with a
collapsible **Options for this download** panel underneath for one-off
overrides. The panel remembers whether you left it open.

Defaults for every download live on a separate settings page — the _Settings_
button in the popup, or the addon's _Preferences_ / _Extension options_ entry.
It covers the default command, header policy, connection count, per-backend
flags, and the queue endpoints and tokens.

---

## Install

**Firefox (permanent install)** — release Firefox only keeps add-ons that
Mozilla has signed. Signing as an _unlisted_ add-on is automatic, free, and
does not publish anything on addons.mozilla.org:

1. Create API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/>.
2. Sign:
   ```sh
   npm install
   WEB_EXT_API_KEY=user:… WEB_EXT_API_SECRET=… npm run sign
   ```
3. Open `about:addons` → ⚙ → _Install Add-on From File…_ → pick
   the `.xpi` that signing wrote to `web-ext-artifacts/`.

The add-on then survives restarts. Bump `version` in `manifest.json` before
signing again — AMO rejects a version it has already signed.

**Firefox (temporary, for development)** — `npm run build`, then load
`web-ext-artifacts/*.zip` via `about:debugging` → _Load Temporary Add-on_.
Removed when Firefox closes.

**Chrome / Edge** — `chrome://extensions` → enable Developer mode → _Load
unpacked_ → select this directory.

Firefox 128+ or Chrome 120+.

## Development

```sh
npm install
npm test        # node --test, no browser needed
npm run lint    # eslint + web-ext lint
npm run format  # prettier
npm run start:firefox
```

The command generators in `lib/` are plain ES modules with no browser
dependencies, which is what makes them directly unit-testable.

---

## Security notes

- **Generated commands contain your session cookies.** Treat them like a
  password: do not paste them into issues, chat, or CI logs.
- **"Escape with double-quotes" is for Windows `cmd.exe` only.** Double quotes
  do not stop `$(…)` or backtick expansion in a POSIX shell, so a command
  generated in that mode must not be pasted into bash or zsh. The default
  single-quote mode is safe everywhere except `cmd.exe`.
- Captured requests are held in `storage.session` and are cleared when the
  browser closes. Options live in `storage.local`; an aria2 RPC secret or
  Gopeed token you enter is stored there in plain text.

## License

MPL-2.0, as upstream.

The icon is "Download Twice Square" from [SVG Repo](https://www.svgrepo.com)
(Solar icon set, CC BY 4.0).
