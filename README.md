# cliget-next

cliget-next is a Firefox and Chrome extension that turns a browser download
into a `curl`, `wget` or `aria2c` command. The command carries the cookies,
user agent and referrer of the original request, so a file behind a login
still downloads from a terminal, for example straight onto a remote server.

This is a maintained fork of [zaidka/cliget](https://github.com/zaidka/cliget)
that fixes the generated commands (upstream's `aria2c` line runs on a **single
connection**), adds download-queue backends, and ports the extension to
Manifest V3 so it runs on Chrome as well as Firefox.

## Improvements over upstream cliget

Compared with cliget 2.1.0, the last upstream release. For per-version
changes, see [GitHub Releases](https://github.com/rgvxsthi/cliget-next/releases).

Generated commands:

- **aria2 downloads are segmented.** The command splits the file across 16
  connections, resumes and retries. Upstream emitted a bare `aria2c`, which
  uses one connection and is no faster than curl.
- **Headers that break downloads are dropped.** `Host`, `Range`/`If-Range`,
  `If-Modified-Since`/`If-None-Match` and hop-by-hop headers are never
  replayed.
- **curl and wget stop saving broken files.** curl gets `--location` and
  `--fail`; both get resume and retry flags.
- **Server filenames are sanitised.** A `Content-Disposition` name such as
  `../../.bashrc` can no longer write outside the current directory.

The extension:

- **Download queues.** Send a download to aria2 over JSON-RPC, append it to an
  aria2 input file, or add it to Gopeed. The RPC and Gopeed modes have a
  **Send now** button.
- **Manifest V3.** Runs on Chrome and Edge as well as Firefox.
- **Separate settings page.** The popup keeps its options in a collapsible
  panel under the command.
- **Theme-aware badge.** In Firefox the toolbar badge colours match the light
  or dark toolbar icon. Upstream used a fixed blue.

## Install

Requires Firefox 128+ or Chrome 120+.

### Firefox (permanent install)

Release Firefox only keeps add-ons that Mozilla has signed. Every
[GitHub release](https://github.com/rgvxsthi/cliget-next/releases) carries a
signed `cliget-next-<version>.xpi`:

1. Download the `.xpi` from the latest release.
2. Open `about:addons`, click the gear icon, choose _Install Add-on From
   File…_, and pick the file.

To sign your own build instead, for example from a fork, sign it as an
_unlisted_ add-on. That is automatic, free, and publishes nothing on
addons.mozilla.org:

1. Create API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/>.
2. Sign the extension:
   ```sh
   npm install
   WEB_EXT_API_KEY=user:… WEB_EXT_API_SECRET=… npm run sign
   ```
3. Open `about:addons`, click the gear icon, choose _Install Add-on From
   File…_, and pick the `.xpi` that signing wrote to `web-ext-artifacts/`.

The add-on then survives restarts. Bump `version` in `manifest.json` before
signing again: AMO rejects a version it has already signed.

### Firefox (temporary, for development)

1. Run `npm run build`.
2. Open `about:debugging`, choose _This Firefox_, then _Load Temporary
   Add-on…_, and pick the `.zip` in `web-ext-artifacts/`.

Firefox removes the add-on when it closes.

### Chrome and Edge

1. Open `chrome://extensions` (`edge://extensions` in Edge).
2. Turn on _Developer mode_.
3. Click _Load unpacked_ and select this directory.

## Usage

1. Start the download in the browser as usual. The toolbar badge counts new
   captures. You can cancel the browser's own download; the capture is kept.
2. Open the cliget-next popup and pick the file.
3. Click **Copy** and paste the command into a terminal. In the RPC and Gopeed
   queue modes, **Send now** submits the download without a terminal.

What gets captured:

- Page and frame navigations that return HTTP 200 and that the browser would
  not display itself. HTML, plain text, images and XML are skipped unless the
  server sends them as an attachment.
- Not captured: files that page scripts fetch themselves, such as `blob:`
  downloads.
- The popup lists the last 20 captures. The list is cleared when the browser
  closes.

aria2 and the queue modes only replay GET requests. curl and wget also replay
form POSTs, except that wget cannot send multipart form data.

## Settings

The popup shows the command for the selected download, with an **Options for
this download** panel under it. Changes made in that panel are saved as your
defaults, exactly like changes on the settings page, so they also apply to
later downloads. **Reset to defaults** restores every setting, including queue
endpoints and tokens. The panel remembers whether you left it open.

The settings page opens from the **Settings** button in the popup, or from the
add-on's _Preferences_ (Firefox) or _Extension options_ (Chrome) entry.
Changes save immediately.

| Group           | Settings (default)                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Default command | `aria2` (default), `curl`, `wget`, queue (RPC), queue (file), queue (Gopeed)                                |
| All commands    | Drop tracking/noise headers (on), Wrap long commands (on), Escape with double-quotes (off), Exclude headers |
| Speed           | Connections (16). aria2 clamps this to 16; Gopeed accepts up to 64.                                         |
| aria2           | Binary (`aria2c` or `aria2-next`), Fast defaults (on), File allocation (`falloc`), Extra arguments          |
| curl, wget      | Robust defaults (on), Extra arguments                                                                       |
| aria2 queue     | RPC endpoint (`http://localhost:6800/jsonrpc`), RPC secret, Queue file (`~/aria2-queue.txt`)                |
| Gopeed queue    | Server (`http://localhost:9999`), API token, Download path (empty: Gopeed's configured directory)           |

_Extra arguments_ are appended to the command exactly as typed, without
quoting.

The default output targets POSIX shells (bash, zsh, Git Bash, WSL, Cygwin).
For Windows `cmd.exe`, turn on _Escape with double-quotes_ and turn off _Wrap
long commands_: wrapped lines end in a POSIX `\` continuation, which `cmd.exe`
does not understand. See [Security notes](#security-notes) before using
double-quote mode.

## Download queues

Three modes queue a download instead of producing a foreground command. In the
RPC and Gopeed modes the popup's **Send now** button submits the download from
the browser. The input-file mode produces a shell snippet to paste.

### aria2 over JSON-RPC

Start the daemon once:

```sh
aria2c --enable-rpc --rpc-listen-all=false --rpc-secret=YOUR_TOKEN \
       --continue=true --max-concurrent-downloads=3 --daemon=true
```

Set _RPC secret_ to the same token. cliget-next then generates (or sends) an
`aria2.addUri` call carrying the same tuning as the aria2 command. Downloads
survive closing the browser, and you can drive the queue from a UI such as
[AriaNg](https://github.com/mayswind/AriaNg). The daemon forgets its queue
when it stops unless you configure `--save-session`.

### aria2 input file

No daemon. cliget-next generates a snippet that appends a stanza to a
plain-text queue file. Shortened here; the real stanza lists every tuning
option:

```sh
cat >> ~/aria2-queue.txt <<'CLIGET_EOF'
https://example.net/file.7z
  max-connection-per-server=16
  split=16
  header=Cookie: session=…
  out=file.7z
CLIGET_EOF
```

The quoted heredoc delimiter stops the shell from expanding `$` or backticks
in cookie values. Drain the queue whenever you like:

```sh
aria2c --input-file ~/aria2-queue.txt --max-concurrent-downloads=1 --continue=true
```

Keep the space after `--input-file`. With `--input-file=~/…` neither the shell
nor aria2 expands the `~`, and aria2 cannot find the file.

### Gopeed

[Gopeed](https://gopeed.com) is an actively developed Go download manager with
a persistent queue and a web UI. cliget-next posts the download to its REST
API: `POST /api/v1/tasks`, port 9999 by default, with an `X-Api-Token` header
when you set _API token_. Gopeed accepts up to 64 connections per task.

### aria2 vs aria2-next

aria2 upstream has been dormant for years.
[aria2-next](https://github.com/AnInsomniacy/aria2-next) is a maintained fork
with the same option surface. Choose it under _Binary_ for the aria2 command
and the input-file queue. For the RPC queue, start the daemon with either
binary; the RPC call is the same.

## Generated commands

### aria2

With default settings, a captured download produces:

```sh
aria2c --max-connection-per-server=16 --split=16 --min-split-size=1M --continue=true \
  --auto-file-renaming=false --file-allocation=falloc --disk-cache=64M --max-tries=0 \
  --retry-wait=5 --max-file-not-found=3 --timeout=60 --connect-timeout=15 \
  --user-agent '…' --referer '…' --header 'Cookie: …' \
  --out 'file.7z' 'https://…'
```

| Flag                                        | Why                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--max-connection-per-server` / `--split`   | Segments the download. aria2 defaults to one connection; 16 is its maximum.                                     |
| `--min-split-size=1M`                       | The 20M default splits a 100M file into only five pieces.                                                       |
| `--continue` + `--auto-file-renaming=false` | Re-running resumes instead of starting `file.1.7z`.                                                             |
| `--file-allocation=falloc`                  | Instant preallocation on ext4/btrfs/xfs/NTFS; avoids fragmentation. Use `none` on FAT32/HFS+ or network shares. |
| `--max-tries=0` + `--max-file-not-found=3`  | Retry transient failures forever, but give up quickly on a dead URL.                                            |

Turning off _Fast defaults_ removes all of these flags. If the server ignores
range requests, aria2 shows `CN:1` in its status line and no tuning will help:
that is a server limit, not a config bug.

### curl and wget

Both use a single connection and cannot segment a download. Use aria2 when
throughput matters.

- **curl:** `--location` follows a redirect to a CDN instead of saving the
  redirect stub. `--fail` stops an HTTP error page from being saved under your
  filename. Also `--globoff`, `--continue-at -`, `--retry 5`,
  `--retry-delay 5`, `--retry-connrefused` and `--connect-timeout 15`. With no
  captured filename it uses `--remote-name --remote-header-name`.
- **wget:** `--continue`, `--tries=0`, `--waitretry=5`, `--retry-connrefused`
  and `--timeout=60`. With no captured filename it adds
  `--content-disposition`.

Turning off _Robust defaults_ leaves curl with only `--location` and removes
wget's resume and retry flags.

### Headers

Always dropped, regardless of settings:

- **`Host`:** a replayed value breaks redirects and TLS virtual-host routing.
- **`Range` / `If-Range`:** the browser often requests a byte range for media.
  Replaying it truncates the file _and_ disables segmented downloading.
- **`If-Modified-Since` / `If-None-Match`:** a 304 response leaves you with an
  empty file.
- **`Content-Length` and hop-by-hop headers** (`Connection`, `Keep-Alive`,
  `Proxy-Connection`, `TE`, `Upgrade`, `Transfer-Encoding`).

Dropped by default through _Drop tracking/noise headers_: `Sec-Fetch-*`, client
hints (`Sec-CH-UA*`), `DNT`, `Sec-GPC`, `Priority`,
`Upgrade-Insecure-Requests`, `Pragma` and `Cache-Control`. They carry no
authentication.

_Exclude headers_ lists extra header names to drop. It defaults to
`Accept-Encoding`, so the server does not send a compressed body that the tool
would save as-is.

### Filenames

The filename comes from `Content-Disposition` (RFC 5987 `filename*`, with or
without a language tag, is preferred over `filename`), or else from the last
segment of the URL path. It is then sanitised: control characters are removed,
`/` and `\` become `_`, leading dots are stripped, Windows device names (`CON`,
`NUL`, `COM1`, …) get a `_` prefix, and the result is capped at 255 characters.

## Development

```sh
npm install
npm test               # node --test, no browser needed
npm run lint           # eslint + web-ext lint
npm run format         # prettier
npm run start:firefox  # launch Firefox with the extension loaded
npm run build          # package into web-ext-artifacts/
```

- `background.js` captures requests through `webRequest` and stores them in
  `storage.session`.
- `popup.js` and `options.js` are the toolbar popup and the settings page.
- `lib/` holds the command generators (`aria2.js`, `curl.js`, `wget.js`,
  `aria2-queue.js`, `gopeed.js`), header filtering (`headers.js`), filename
  sanitising (`filename.js`) and the settings registry (`fields.js`,
  `options.js`).

The command generators in `lib/` are plain ES modules with no browser
dependencies, which is what makes them directly unit-testable
(`test/generators.test.js`).

### Releasing

1. Bump `version` in `manifest.json` and `package.json`.
2. Commit, then tag the commit `vX.Y.Z` to match and push the tag.
3. Publish a GitHub release for the tag.

`.github/workflows/sign-release.yml` then runs the tests, signs the tagged
source on addons.mozilla.org and attaches `cliget-next-X.Y.Z.xpi` to the
release. It needs the `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` repository
secrets. AMO signs each version only once, so if a version was already signed
elsewhere, for example with `npm run sign`, the workflow downloads the copy AMO
already has instead.

## Security notes

- **Generated commands contain your session cookies.** Treat them like a
  password: do not paste them into issues, chat, or CI logs.
- **"Escape with double-quotes" is for Windows `cmd.exe` only.** Double quotes
  do not stop `$(…)` or backtick expansion in a POSIX shell, so a command
  generated in that mode must not be pasted into bash or zsh. The default
  single-quote mode is safe in POSIX shells but does not work in `cmd.exe`.
- **Queue modes send your cookies to the queue server.** Point the RPC
  endpoint and the Gopeed server only at software you run, and keep aria2 RPC
  local with `--rpc-listen-all=false`.
- Captured requests are held in `storage.session` and are cleared when the
  browser closes. Options live in `storage.local`; an aria2 RPC secret or
  Gopeed token you enter is stored there in plain text.

## License

MPL-2.0, as upstream.

The icon is "Download Twice Square" from [SVG Repo](https://www.svgrepo.com)
(Solar icon set, CC BY 4.0).
