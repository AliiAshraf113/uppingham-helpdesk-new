# cPanel compatibility checklist

Status reviewed 2026-10-26. The existing cPanel configuration is now reported by the user, but no server files or settings were changed and no deployment was attempted. The previous source ZIP was rejected by the hosting scanner; no replacement archive has been created.

## Facts verified locally

- Project: Next.js App Router, Next `16.4.3`, React/React DOM `19.3.1`.
- Local runtime: Node.js `24.21.0`, npm `11.19.0`, Windows x64.
- Project engine range: Node `>=20.9.0 <25`; exact installed Next package requires Node `>=20.9.0`.
- Confirmed cPanel values supplied by the user: application root `/home/ucegcom/helpdesk`, URL `https://uc-eg.com/helpdesk`, CloudLinux environment `/home/ucegcom/nodevenv/helpdesk/20`, Node `20.20.2`, npm `10.8.2`, startup file `server.js`. The user reports a physical 667 MB `node_modules` directory in the app root and another module directory in the virtual environment; these server paths were not inspected directly.
- The local project also has a real `node_modules` directory, not a symlink. The previously generated ZIP contains no `node_modules` entry. Neither fact establishes the type or cause of the server-side Selector warning.
- Recommended runtime: **Node `24.22.1`** after resolving the Selector path conflict. Next `16.4.3` and MariaDB Connector `3.5.4` support this version. Node `20.20.2` also satisfies package engine requirements, but Node 20 is EOL. CloudLinux documents that switching an application's Node version reinstalls its packages. Do not switch until the app-root `node_modules` path is inspected and the Selector-managed install flow is confirmed.
- `next.config.ts` sets `basePath: "/helpdesk"`; Next embeds this at build time. `npm run build` is `next build --webpack`. Stage 1 verified the root, tickets, assets, reports, settings, `/helpdesk/api/health` and generated CSS/JS assets with local production-mode requests.
- `server.js` is the configured CloudLinux Passenger startup file. It initializes Next.js using its custom-server API, creates one HTTP server, calls `listen()` once, and reads `PORT` when present (otherwise 3000). The `package.json` `start` script points to the same file. Local Passenger routing and live `/helpdesk` HTTP behavior are unverified.
- The previous ZIP contained one JavaScript startup file and was rejected with `Sanesecurity.Foxhole.JS_Zip_1.UNOFFICIAL`. Defender scanned the archive and project without detections, but that does not supersede the hosting scanner. Because Passenger needs a JavaScript startup file, do not create another ZIP until the hosting provider reviews the specific signature and approves a supported transfer route.
- MariaDB Connector/Node.js `3.5.4` is pinned in `package.json` and `package-lock.json`; the package engine is Node `>=20.0.0`, compatible with the project's Node 24 range. cPanel/Linux installation and database TLS behavior have not been tested.
- The project contains offline-tested SQL migration tooling and lazy pool/transaction helpers. No migration was run and no database endpoint was contacted. The intended MariaDB 10.6.28 Community line is past its announced end of maintenance; confirm a maintained service tier or authorize a supported upgrade before production.

## Compatibility matrix

| cPanel option | Next 16.4.3 requirement | Node support status (official Node project) | Recommendation |
| --- | --- | --- | --- |
| 18.20.8 | Fails: below 20.9 | EOL | Do not use |
| 20.20.2 | Meets minimum | EOL | Avoid for production |
| 22.23.4 | Meets minimum and project range | LTS | Compatible fallback; test on host |
| 24.22.1 | Meets minimum and project range | LTS | Preferred; test on host |

## Preflight with hosting provider

- [ ] Confirm cPanel/WHM version and whether this account has classic Application Manager or the newer Websites/Web Apps feature.
- [ ] Confirm Node `24.22.1` is available to both dependency installation/build and the production Passenger process. Capture `node --version`, `npm --version`, `node -p "process.platform + ' ' + process.arch"` from the actual application context.
- [ ] Confirm Linux distribution/architecture, available memory/disk, process limits, open-file limits, Node module install scripts/native binaries, and whether `npm ci` is supported.
- [ ] In cPanel File Manager or SSH, read-only inspect `/home/ucegcom/helpdesk/node_modules`: distinguish absent, real directory/file, and symlink; if it is a symlink, read its target. Do not delete or rename it during inspection. Confirm the Node Selector's own virtual-environment path and identify which component owns the app-root object.
- [ ] Confirm the Selector's supported dependency-install action and whether it includes build-time devDependencies. Use the Selector-managed environment; do not upload local `node_modules` or run `npm ci` against an app-root symlink unless CloudLinux confirms that workflow is supported.
- [ ] Before changing Node versions, resolve the Selector warning with a read-only check of the app-root `node_modules` type, link target (if any), owner, and the selected virtualenv's package location. The reported 667 MB directory is a plausible conflict, not a confirmed cause. Preserve it until its owner/content and a recoverable backup are established.
- [ ] Confirm the build command can run inside the selected virtual environment. Build with Node `24.22.1` after the Selector warning is resolved; verify installed package versions and that the generated `.next` output exists.
- [ ] Keep the app root and URL unchanged. Confirm the configured startup file is `server.js`, Node runs it as CommonJS, `PORT` is supplied as expected, and restart/log behavior uses the existing Selector/Passenger controls.
- [ ] Confirm Passenger reverse proxy routing preserves the `/helpdesk` prefix, `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, query strings, cookies, authorization headers, streaming behavior and timeout semantics.
- [ ] Confirm maximum request body, upload size/time limits, temporary upload directory/quota and whether proxy limits can be set. The application must enforce its own streamed size limit too.
- [ ] Confirm canonical HTTPS hostname and TLS behavior. Confirm production base URL, Auth.js base path and exact Entra callback/logout URLs before registration.
- [ ] Confirm application environment variables are server-only, how changes trigger redeploy/restart, and that logs redact credentials, OAuth tokens, SQL values and attachment contents.
- [ ] Confirm an app-owned writable attachment directory outside every served document root, actual owner/mode semantics, `open_basedir` restrictions, filesystem quota, persistence across restarts/redeploys and backup/restore procedure. Do not use the illustrative path in `.env.example` until confirmed.
- [ ] Confirm MariaDB endpoint, exact product/version/tier (Community vs Enterprise), database/user creation permissions, TLS requirements, network ACLs, connection quota, backup/restore, and maintenance lifecycle. MariaDB Community 10.6 has passed EOL; resolve this before production.
- [ ] Before schema initialization, obtain explicit database-owner approval, verify the exact new database and host identity independently, verify a restorable backup or confirm the database is empty/disposable, and use separate least-privilege runtime/migrator credentials. Follow [database migration procedure](database-migrations.md). Never import the legacy SQL dump.
- [ ] Confirm outbound HTTPS to Microsoft identity endpoints and any approved Microsoft Graph group lookup; confirm Entra registration ownership and tenant/group allowlists.
- [ ] Confirm whether cron is unavailable and whether any scheduled job would need an alternate mechanism. The application must not assume cron exists.

## Build/start path (provisional)

Next.js documents `next start` after `next build`, with `PORT` configuring the listener. This application is configured for CloudLinux/Passenger startup file `server.js`; it uses the documented Next.js custom-server API and preserves `basePath: "/helpdesk"`. CloudLinux's Selector manages the virtual environment and provides its own dependency installation action. The hosting Node version can be changed only after inspecting the app-root `node_modules` object; CloudLinux reports that a version switch reinstalls packages.

`server.js` matches the existing startup-file configuration. Passenger intercepts the first HTTP server's `listen()` call; the adapter creates one server and delegates requests to Next.js. Next.js documents performance tradeoffs for custom servers, but the current configured startup file is the reason this adapter is used. Keep the existing application registration; do not create a second app.

Do not create or upload a replacement ZIP until the provider has reviewed the Foxhole alert and approved the transfer method. The prior ZIP excluded `node_modules`, `.next`, environment files, migrations, database scripts, tests, docs, and cPanel's `.htaccess`, but its `app.js` entry was rejected. A new `server.js` entry is also JavaScript and must not be treated as a way around that scanner rule.

Once the provider has approved a source-transfer method, deploy only source/configuration files to the existing root, preserving cPanel-owned files and environment settings. Let CloudLinux Selector install dependencies into its own environment; do not copy local `node_modules`. Run the `build` script from that selected environment (or its documented Run JS Script control), then use the existing Selector/Passenger restart mechanism. Keep database setup separate.

### Ordered deployment preparation (no ZIP or deployment yet)

1. Ask the hosting provider to review the specific `Sanesecurity.Foxhole.JS_Zip_1.UNOFFICIAL` alert and identify the flagged member or approve a supported source-transfer method that continues to receive their normal security scanning. Do not rename or repackage the same JavaScript to evade detection. `server.js` is required by the currently configured Passenger startup-file setting, so its presence does not resolve the scanner concern.
2. In cPanel File Manager/SSH, inspect `/home/ucegcom/helpdesk/node_modules` read-only: record whether it is a real directory, file, or symlink; if symlink, its target; and owner. Compare with `/home/ucegcom/nodevenv/helpdesk/20`. Do not remove/rename either object. The stated 667 MB size is a lead, not proof of why CloudLinux warned.
3. Confirm with CloudLinux Selector which Node versions it supports, whether changing the existing app registration to 24.22.1 would replace packages, and the supported install/build controls. Keep the existing app root, URL, and `server.js` setting. Do not switch versions while the modules-location warning is unresolved.
4. After the warning is resolved through the supported Selector workflow, select Node 24.22.1 (preferred based on current compatibility and Node 20 EOL), then install dependencies using the Selector's own **Run npm install** control in the app environment. Ensure the install includes development dependencies required to build (`next build` uses the PostCSS/Tailwind toolchain). Do not upload local `node_modules` or use `npm ci` from an unactivated shell; use `npm ci` only if the provider explicitly confirms it is the supported way to populate the Selector-managed environment.
5. Transfer the reviewed source by the provider-approved method, preserving cPanel-owned `.htaccess` and environment settings. Build from `/home/ucegcom/helpdesk` using the Selector's documented script runner or an activated environment; confirm runtime versions, `npm run build`, and `.next` output. Do not run database scripts.
6. Restart the existing application with its cPanel/Selector control (or the provider-documented Passenger restart procedure). Confirm Passenger still launches `server.js`, then verify `/helpdesk`, each page, `/helpdesk/api/health`, prefixed `/_next` assets, and the expected unprefixed 404. Keep database work separate.

Node `20.20.2` technically satisfies Next's `>=20.9.0` minimum but is on an EOL major line. It is a temporary compatibility fallback only if Node 24 cannot be enabled after the Selector issue is resolved. These are future host steps; none were performed here.

## Post-configuration verification (future host test)

- [ ] Record the exact runtime, OS, Passenger mode and all provider settings without recording secrets.
- [ ] Run the provider-supported dependency installation, `npm run typecheck`, `npm run lint`, `npm run build`, and production startup inside the selected CloudLinux environment or representative Linux image.
- [ ] Probe `/helpdesk`, each page, `/_next` assets under `/helpdesk`, `/helpdesk/api/health`, malformed paths and the expected unprefixed 404.
- [ ] Verify restart/redeploy preserves private attachments and applies updated environment variables.
- [ ] Confirm no private file is directly retrievable by URL; authorized downloads succeed and unauthorized downloads fail.
- [ ] Verify the Entra authorization redirect, callback, cookie path/flags, logout redirect and HTTPS forwarded headers end-to-end.
- [ ] Exercise request-size rejection and slow/aborted uploads through the real proxy.
- [ ] Complete database connectivity, TLS, connection-limit, migration and restore tests against a disposable database.
- [ ] Test `mariadb@3.5.4` install/start against the actual cPanel Linux Node runtime and verify provider TLS certificate validation, connection release, pooling and restart behavior.

Passing local Windows checks is not a substitute for these host checks. Do not claim cPanel compatibility or deployment readiness until they pass.

## Official references

- [Next.js 16 runtime minimum and Turbopack defaults](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js basePath behavior](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath)
- [Next.js production CLI and PORT](https://nextjs.org/docs/app/api-reference/cli/next)
- [Next.js custom server tradeoffs](https://nextjs.org/docs/app/guides/custom-server)
- [Node.js supported release lines](https://nodejs.org/en/about/previous-releases)
- [Node.js 24.22.1 LTS release](https://nodejs.org/en/blog/release/v24.22.1)
- [cPanel: install a Node.js application](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/)
- [cPanel: Passenger applications](https://docs.cpanel.net/knowledge-base/web-services/using-passenger-applications/)
- [cPanel: manage a Node.js app](https://docs.cpanel.net/cpanel/meridian/websites/manage-a-nodejs-app/)
- [Passenger Node.js reverse port binding](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/reverse_port_binding.html)
- [Next.js custom server API and caveats](https://nextjs.org/docs/app/guides/custom-server)
- [MariaDB Community 10.6 EOL notice](https://mariadb.org/mariadb-server-10-6-reaches-end-of-life-on-july-6th/)
# Application implementation status (2026-10-26)

Ticket and asset services plus narrow report, notification, and admin-reference services have been added locally. Their API shells fail closed until Entra authentication is configured, and no workflow UI is complete. Do not deploy this intermediate version. Windows builds have alternated between success and `EPERM` during Next output creation; the latest failure occurred during compilation at `.next/server/app/api/admin`, after earlier failures at other route paths. Read-only ACL/process checks did not establish a cause; Defender and open-handle diagnostics were unavailable. Treat cPanel clone build and HTTP validation as separate required checks after the application becomes deployable.
