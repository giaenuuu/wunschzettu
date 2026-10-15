# Wunschzettu

Self-hosted wishlists. Create a list, share the link, and family and friends reserve gifts or chip in together. The person the list is for never sees what has been taken.

Design and decisions: [ARCHITECTURE.md](ARCHITECTURE.md).

## Development

Open the repo in VS Code and choose **Reopen in Container**. You need Docker and the Dev Containers extension; JetBrains Rider and the `devcontainer` CLI work too. The container has the .NET 10 SDK and Node 24, restores everything on first start, and runs [Mailpit](http://localhost:8025) next to it, which catches all mails.

Then run the VS Code task **dev**, or start both servers yourself:

```sh
dotnet watch run --project src/Wunschzettu.Api --launch-profile http   # API on :5299 (SQLite in src/Wunschzettu.Api/.data)
cd src/Wunschzettu.Web && npm start                                    # UI on http://localhost:4200, proxies /api and /img
```

Sign in with any email address. The code arrives in Mailpit. Without an SMTP server configured, mails are written to the API log instead.

Without the devcontainer you need the .NET 10 SDK and Node 24+, then `dotnet tool restore` and `npm ci` in `src/Wunschzettu.Web`.

| Task | Command |
|---|---|
| Backend tests | `dotnet test` |
| Frontend unit tests | `npm test` in `src/Wunschzettu.Web` |
| Browser smoke test (servers running) | `npm run e2e` in `src/Wunschzettu.Web`; once per machine: `npx playwright install --with-deps chromium-headless-shell` |
| Add a migration | `dotnet ef migrations add <Name> -p src/Wunschzettu.Api -o Data/Migrations` (applied on startup). Check the generated file: EF sometimes guesses renames |
| Regenerate TS API types | `dotnet build` (writes `src/Wunschzettu.Web/src/api/openapi.json`), then `npm run api:types` in `src/Wunschzettu.Web` |
| Translations | Texts are German in the templates (`i18n="@@id"`). After changing any, run `npm run i18n:check` and update `public/i18n/{en,fr,es,pt-BR}.json` (de-DE, de-AT and pt-PT only list differences) |
| Icons | Write `<ui-icon name="name" />` with any [Material Symbols](https://fonts.google.com/icons) name (`-fill` for filled). `npm start`/`build` copy the used ones to `public/icons` |
| UI | Tailwind CSS 4 utilities in templates; reusable pieces live in `src/app/ui` (buttons, fields, dialogs, …), design tokens in `src/styles.css` |

## Running on the homelab

```sh
docker compose up -d --build
```

Everything lives in `./data` (database, daily backups, images, keys). The full step-by-step guide (mail DNS, reverse proxy, Cloudflare Tunnel, legal texts, backups, updates) is in [DEPLOYMENT.md](DEPLOYMENT.md). How our own instance is released (test → production) is in [DEPLOYMENT-HOMELAB.md](DEPLOYMENT-HOMELAB.md).
