# Wunschzettu – Architecture

A self-hosted wishlist app. People create and style wishlists and share a link. Guests open the link, see the list immediately, and can reserve a wish or chip in on a group gift by entering their name and email. No account and no password are needed.

Guiding rule: **modern defaults, as few moving parts as possible.** One container, one database file, one volume.

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Angular (latest)**: standalone components, signals, zoneless, `@if/@for` control flow, `httpResource` | Current Angular way of building apps, with no NgModules and no RxJS-heavy state |
| UI kit | **Tailwind CSS 4** + own components in `src/app/ui` on top of the Angular CDK (dialog, menu, a11y, drag-and-drop) | Small CSS, full control over the look. The CDK brings focus traps, keyboard navigation and ARIA; colours are OKLCH tokens, so per-list palettes are a hue and a chroma |
| Backend | **ASP.NET Core (.NET 10 LTS)**, Minimal APIs | Small and fast, with built-in OpenAPI, rate limiting, and auth |
| Data | **EF Core + SQLite** (WAL mode) | No DB server to run. Switching to Postgres later means changing the provider only |
| Auth | **ASP.NET Core Identity** (user store, lockout) + **cookie auth** + own one-time codes table | Identity covers users and lockout; codes and links are a small table we fully control (hashed, single-use, any lifetime) |
| Background work | `BackgroundService` + outbox table | Mail sending, reminders and expiry without a job framework |
| Images | Stored on disk (`/data/images`), resized to WebP on upload with **SkiaSharp**, metadata dropped | No object storage needed. SkiaSharp is MIT; ImageSharp 4 needs a license key |
| Mail | SMTP via **MailKit**. **Mailpit** in the devcontainer | Works with any provider or your own relay |
| i18n | **de-CH** (default) + **en**, Angular `$localize` with translations loaded at runtime | One build; switching language reloads |
| Fonts & icons | **Figtree** for text, **Fraunces** for headings (both self-hosted) + only the used **Material Symbols** as SVGs (CSS masks) | No CDN: guests' IPs never go to Google, ~100 KB instead of a 4 MB icon font |
| Hosting | One Docker image (API serves the Angular build) behind the existing reverse proxy | One container, one volume, easy backup |

---

## 2. Repository layout

```
wunschzettu/
├─ src/
│  ├─ Wunschzettu.Api/            # ASP.NET Core – serves API + SPA
│  │  ├─ Features/                # vertical slices, one folder per feature
│  │  │  ├─ Auth/                 # identify, codes and links, profile
│  │  │  ├─ Wishlists/            # CRUD, settings, share link, dashboard, gift overview, Dankesliste, link preview
│  │  │  ├─ Wishes/               # CRUD, ordering, fulfil
│  │  │  ├─ Images/               # upload, resize, serve
│  │  │  ├─ Gifts/                # shared-link view, availability, reserve, group gifts, the rules (GiftService)
│  │  │  ├─ Members/              # invite co-managers, recipients, guests
│  │  │  ├─ Notifications/        # outbox + sender, mail templates
│  │  │  └─ Jobs/                 # reminders, expiry, event processing, cleanup
│  │  ├─ Data/                    # AppDbContext, entities, migrations
│  │  ├─ Infrastructure/          # options, SMTP, CSRF, claims, policies
│  │  └─ Program.cs
│  └─ Wunschzettu.Web/            # Angular app
│     ├─ src/app/
│     │  ├─ core/                 # API types, auth, colour scheme, language, error messages
│     │  ├─ features/             # landing, auth, dashboard, list-editor, list-view, wish, thanks, profile, install
│     │  ├─ shared/               # wish card, link card, palettes, theme pickers, pipes
│     │  └─ ui/                   # design system: button, field, switch, segmented, dialog, toaster, icon, progress
│     ├─ public/i18n/en.json      # English translations (German is the source)
│     ├─ scripts/                 # icon sync, i18n check
│     └─ e2e/smoke.mjs            # browser smoke test of the main flows
├─ tests/
│  └─ Wunschzettu.Api.Tests/      # xUnit + WebApplicationFactory (integration first)
├─ .devcontainer/                 # dev environment: .NET SDK + Node + Mailpit
├─ Dockerfile
├─ compose.yaml                   # production: the app container
└─ ARCHITECTURE.md
```

There is one backend project and no layered "clean architecture" split. Each feature folder holds its endpoints, DTOs, and logic together. Add more structure only when a feature grows enough to need it.

---

## 3. Roles

A list separates **who manages it** from **who it is for**.

| Role | Who | Typical case |
|---|---|---|
| **Manager** | Edits the list, wishes, theme and settings. Several per list. | You; both partners of a couple; a parent |
| **Recipient** | The person the gifts are for. Never sees gift state (see §6). | You on your own list; the child on a list the parent manages |
| **Guest** | Anyone who opened the share link. | Family, friends |
| **Giver** | A guest who reserved a wish or joined a group gift. | |

- A user can be **manager and recipient at once** (the normal "my own list" case). **Recipient always wins**: if you are a recipient, you get the recipient view, even if you are also a manager.
- The recipient does not need an account. "Für wen?" is a display name (`"Lena"`), optionally linked to a user (for an adult recipient with their own login).
- Managers and recipients can't reserve or join gifts on their own list.

---

## 4. Domain model

```
User ─┬─< ListMember >─ Wishlist ─< Wish ─┬─< WishImage
      │                                   ├─< WishLink        ("where to buy")
      │                                   └─< Gift ─< GiftParticipant >── User
      └─ (Identity: email, confirmed?, optional password/passkey)

OutboxMessage   (mails to send, retried)
LoginCode       (one-time codes and link tokens, hashed)
```

### User (ASP.NET Identity user)
- `Id`, `Email` (unique), `EmailConfirmed`, `DisplayName`
- Created **as soon as someone enters an email** to act on a list, with `EmailConfirmed = false`.
- A password is optional (§5.9). Without one, the user logs in with an email code or link.

### Wishlist
- `Id`, `Title`, `Description`
- `RecipientName` (the "Für wen?" label). Who actually is recipient is `ListMember.IsRecipient`
- `EventDate` (optional), `Currency` (default `CHF`)
- `ShareToken`: random, unguessable link token (`/l/{token}`), can be regenerated
- `Access`: `Link` (anyone with the link, default) | `Invited` (only invited emails)
- `ShowGiverNames` (bool, default **on**): whether guests see *who* gave a wish, or only that it is taken
- `Theme`: presets only, as a JSON value object: `palette` (from a preset list), `emoji` or `coverImage`, `layout` (`grid` | `list`)
- `CreatedAt`, `UpdatedAt`, `DeletedAt` (soft delete, restorable for 30 days)

### ListMember
- `WishlistId`, `UserId`, `IsManager`, `IsRecipient`, `Invited` (explicitly invited guest), `JoinedAt`
- A guest row is created when a guest first acts on the list. That gives the dashboard its "lists shared with me" section.

### Wish
- `Id`, `WishlistId`, `Name` (the only required field), `Description` (plain text)
- `Price` (decimal, optional, shown as "ca. CHF 40")
- `Gtin` (EAN/UPC barcode number, optional; links to a price comparison)
- `IsFavorite` (the "Herzenswunsch" heart)
- `Quantity`: integer, default **1**; `null` = **unlimited** (books, vouchers, "Zuschuss Ferien")
- `GroupGiftAllowed` (bool)
- `State`: `Active` | `Fulfilled` | `Removed`
- `SortOrder`, `Version` (concurrency token)

### WishImage
- `Id`, `WishId`, `FileKey`, `SortOrder`, `AltText`
- Stored as `/data/images/{fileKey}.webp` plus a `_thumb` version.
- Images are always stored here: uploaded, or downloaded once from a shop page ("Wunsch aus Link"). No hotlinking to shop images, because those links break.

### WishLink ("where to buy")
- `Id`, `WishId`, `Kind` (`Online` | `Store`), `Label`, `Url`, `Note`, `SortOrder`
- **Online**: `Url` required (http/https), `Label` optional (shop name), `Note` optional ("in Grösse M").
- **Store**: `Label` required ("Manor"), `Note` optional (place, branch, hint), no `Url`.
- **Preview** for online links: `PreviewTitle`, `PreviewSiteName`, `PreviewImageKey` (a stored thumbnail), `PreviewFetchedAt`. Fetched by the server while saving the wish, only for URLs that are new or changed (about 6 s budget, in parallel). A failure just means no preview; a timeout leaves `PreviewFetchedAt` empty, so the next save tries again. Thumbnails of links that go away are deleted.
- **Wunsch aus Link**: `POST /api/scrape` reads a shop page (Open Graph, Twitter cards, schema.org `Product` JSON-LD) to prefill name, description, price and images. Results are cached for 15 minutes, so saving the link right after doesn't fetch the page again. Chosen images are then imported with `POST /api/wishes/{id}/images/import`. Many big shops block bots (Galaxus, Zalando answer 403); the UI then just keeps the link.

### Gift
Someone committing to give a wish, alone or as a group.
- `Id`, `WishId`, `Units` (default 1), `IsGroup`, `Status` (`Planned` | `Bought`), `CreatedAt`, `ArchivedAt` (after the event)
- A solo reservation is a Gift with `IsGroup = false` and one participant.
- A group gift is a Gift with `IsGroup = true` that others can join.

### GiftParticipant
- `GiftId`, `UserId`, `IsOrganizer`, `Amount` (optional), `Message` (optional), `JoinedAt`
- `ExpiresAt`: set while the participant's email is unconfirmed, cleared on confirmation (see §5)
- `RemindersSent`, `DeviceId` (the session that created it, §5.4)

### OutboxMessage
- `Id`, `Type`, `ToEmail`, `ToUserId`, `Subject`, `HtmlBody`, `TextBody`, `CreatedAt`, `NextAttemptAt`, `SentAt`, `Attempts`, `LastError`
- Rendered when the action happens (in the recipient's language), so the sender only sends.

### LoginCode
- `UserId`, `CodeHash` (6 digits to type), `TokenHash` (for links), `Purpose` (`Login` | `Confirm` | `Invite`), `ExpiresAt`, `UsedAt`

---

## 5. Identity: email without confirmation, confirmation by email

Guests should never be blocked by a login screen. The share link grants viewing; an email is only asked for when a guest **does** something.

### Flow

```
Guest opens /l/{token}
   │  (Access = Link) list is visible immediately, no email needed
   │
   └─ taps "Ich schenke das" / "Ich beteilige mich"
        │
        ├─ already known on this device (cookie)? ─► action done
        │
        └─ enter name + email ─► POST /api/auth/identify
             │
             ├─ email unknown or unconfirmed
             │     find-or-create unconfirmed User
             │     sign in with a device cookie (unconfirmed identity)
             │     action done, marked "unbestätigt", ExpiresAt = now + 7 days
             │     mail: "Du hast <Wish> gewählt" + [Bestätigen] button + 6-digit code
             │
             └─ email belongs to a CONFIRMED user
                   send code / link, action is NOT done until verified
                   (otherwise anyone could act as an existing user by typing their email)
```

### Rules
1. **The "you chose a wish" mail is the verification mail.** It has a one-click confirm button (magic link) and a 6-digit code. Clicking it confirms the email, clears `ExpiresAt` on all of that user's participations and signs them in on that device.
   - Links point to the SPA's `/confirm` page, which POSTs the token. A GET with side effects would be "clicked" by mail scanners.
   - Codes and link tokens are stored hashed, single-use. Login codes live 15 minutes, confirmation codes until the participation expires, invitations 7 days.
2. **Unconfirmed actions are visible as such.** Other guests see "reserviert (unbestätigt)". Recipients see nothing, as always.
3. **Reminders are limited:** at most **2** reminder mails (day 2 and day 5). On day 7 the unconfirmed participation is **released**: the wish becomes available again and the person gets a final "Reservation aufgehoben" mail. A typo or a fake email can never block a wish forever.
   - If the event date is earlier, everything is compressed so the release happens no later than 1 day before the event.
4. **Unconfirmed identities are device-bound.** An unconfirmed user can only change or withdraw participations from the device that created them (cookie). On a new device they must confirm first.
5. **Abuse limits:**
   - Rate-limit the auth endpoints per IP (built-in `RateLimiter`, 10/min by default).
   - At most 5 codes per email address and hour (12 per day), each code dies after 5 wrong guesses, and 10 unconfirmed participations per user and day.
   - Typing an email only signs in without a code for accounts that hold nothing but their own gifts. Anyone invited (manager, recipient, invite-only guest) gets a code instead, even before their first confirmation. Everything that needs a manager or recipient membership requires a confirmed session.
   - Identity lockout after 5 wrong codes.
   - Identical responses for known and unknown emails.
6. **Creating lists requires a confirmed email.** Anyone may create lists (no allowlist), but only after confirming. Upload limits per user apply (§9).
7. **Sessions are long:** 90 days, sliding. Non-technical users should rarely see a login screen again.
8. Managers log in the same way: email code or link.
9. **Optional password.** A confirmed user may set a password in the profile (at least 8 characters, no composition rules) and then log in with email + password as an alternative to the code. Wrong passwords count towards the same lockout as codes, and every failure gets the same `invalid-login` answer. Setting, changing or removing it changes the security stamp: other sessions end within minutes, the current one is renewed. Forgotten passwords need no reset flow: log in with a code and set a new one. Passkeys are in §12.

### Cookies and CSRF
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`. The SPA is same-origin, so no CORS and no JWT.
- CSRF: `SameSite` plus a required custom header (`X-Requested-With`) on mutating requests, enforced by middleware.
- The session carries a claim `email_confirmed`. Policies use it.

### Accepted limitation
A recipient who opens their own share link in a private window with another email can snoop. This protects against **accidental** spoilers, not determined ones. Accepting that keeps everything else simple.

---

## 6. Gift rules

Enforced on the server, inside one transaction with the wish's `Version` as concurrency token.

1. **Units:** the sum of `Units` over a wish's Gifts can't exceed `Quantity`, unless the quantity is unlimited.
2. A group gift always covers exactly **1 unit**.
3. While a group gift for a wish is still open (not bought), nobody can start a second one: they **join** it instead. Reserving remaining units alone stays possible.
4. Group gifts are only possible if `GroupGiftAllowed` is set.
5. **Organizer:** the person who started a group gift is the organizer and always a participant. If the organizer leaves, the longest-standing remaining participant becomes organizer. If nobody is left, the Gift is deleted.
6. **Bought:** once the organizer marks a Gift as `Bought`, participants can't join or leave. Only the organizer can unlock it again.
7. **Amounts are optional.** The wish card shows a progress bar of pledged amounts against `Price`. The app never handles real money.
8. **Races:** two people reserving at the same moment are resolved by the transaction plus the `Version` check. Exactly one wins. The other sees "gerade vergeben".
9. **Expiry** of unconfirmed participations follows §5. Expiry of the organizer triggers rule 5.

### What each role sees

| | Wish details | Taken / available | Who is giving | Amounts |
|---|---|---|---|---|
| Recipient | ✅ | ❌ never | ❌ | ❌ |
| Manager who isn't the recipient | ✅ | ✅ | ✅ | ✅ |
| Guest | ✅ | ✅ | only if `ShowGiverNames` | ❌ |
| Participant of a group gift | ✅ | ✅ | ✅ always (within their gift, to coordinate) | ✅ (within their gift) |

### The no-leak principle (recipient)
- **Nothing the recipient does is blocked by gift state, or behaves differently because of it.** That covers editing a wish, deleting it, lowering its quantity, and marking it Fulfilled.
- Instead, the affected givers get a mail ("Der Wunsch, den du schenkst, wurde geändert / entfernt / ist schon erfüllt").
- Deleting a wish that has Gifts sets `State = Removed` instead of deleting it. Givers still see it, greyed out and labelled "nicht mehr nötig". For the recipient it is gone.
- Lowering the quantity below the given units is allowed. Givers are notified; nobody is removed automatically.
- The API response for a recipient has **no gift fields at all**, not even empty ones. Gift state lives on **separate endpoints** (`/api/shared/{token}/availability`, `/api/wishlists/{id}/gifts`) that answer recipients with 403 whatever the state; the wish endpoints never carry gift data. An integration test compares a recipient's responses before and after gifts byte by byte.
- The member list only shows managers, recipients and explicitly invited guests, never guests who joined by giving.
- The same applies to counts, sort order, error messages and timings: nothing in a recipient response may depend on gift state.

### After the event date
- A daily job processes lists whose `EventDate` has passed:
  - Wishes whose units are fully covered by Gifts become `Fulfilled` and drop out of the list.
  - Open wishes and unlimited wishes stay `Active`.
  - The Gifts are kept (for the Dankesliste) but no longer count towards availability.
- The managers can then set a new `EventDate` for the next occasion. The list is permanent.
- **Dankesliste:** once the occasion is processed (the day after the event date), the recipient can press "Wer hat was geschenkt?" to reveal who gave what. This is an explicit opt-in action, never shown automatically. It only lists archived gifts, so moving the date can't reveal plans in progress.
- A **new event date in the past** is rejected: it would end the occasion at once. An old date may stay unchanged.

---

## 7. Notifications

All mails go through the **outbox**: an action writes an `OutboxMessage` in the same transaction, and a `BackgroundService` sends it with retries. A broken SMTP server never breaks a reservation.

| Mail | To | Trigger |
|---|---|---|
| Login code / link | the user | login, or acting as a confirmed email |
| **"Du hast <Wish> gewählt"** (+ confirm button if unconfirmed) | giver | reserving or joining a group gift |
| Confirmation reminder (max 2) | unconfirmed giver | day 2 and day 5 |
| "Reservation aufgehoben" | unconfirmed giver | expiry on day 7 |
| Invitation | invited person | manager invite, or invite to an `Invited` list |
| Someone joined / left your group gift; you are now organizer | group participants | join, leave, organizer change |
| **The wish you chose was changed / removed / fulfilled** | givers of that wish | recipient or manager edits price or quantity, removes or fulfils the wish |
| Event reminder | givers with `Planned` gifts | 7 days before the event date |

Mails are sent in the recipient's language (de-CH or en, stored on the user).

---

## 8. API

```
POST   /api/auth/identify               { email, displayName, returnUrl? } → SignedIn (unconfirmed session) | CodeSent
POST   /api/auth/request-code           { email, returnUrl? }    always 202
POST   /api/auth/verify-code            { email, code }          confirms + signs in
POST   /api/auth/confirm                { token }                link from mails, posted by the /confirm page
POST   /api/auth/login-password         { email, password }      alternative to the code (§5.9)
PUT    /api/auth/password               { password }             set or replace (confirmed users)
DELETE /api/auth/password
POST   /api/auth/logout
GET    /api/auth/me                     204 when signed out; hasPassword
PUT    /api/auth/me                     { displayName, language }

GET    /api/wishlists                   my lists + shared with me + my gifts
POST   /api/wishlists                   (confirmed users only)
GET    /api/wishlists/{id}              managers and recipients: wish data only
PUT    /api/wishlists/{id}              title, description, recipient, event date, theme, settings (managers)
DELETE /api/wishlists/{id}              soft delete
POST   /api/wishlists/{id}/restore
POST   /api/wishlists/{id}/share-token  regenerate link
GET    /api/wishlists/{id}/gifts        who gives what (managers who aren't the recipient; 403 for recipients)
GET    /api/wishlists/{id}/thanks       Dankesliste (from the event date on)
GET    /api/wishlists/{id}/members      managers, recipients, invited guests
POST   /api/wishlists/{id}/members      { email, role } invite by mail
PUT    /api/wishlists/{id}/members/{userId}  { isManager, isRecipient }
DELETE /api/wishlists/{id}/members/{userId}

POST   /api/wishlists/{id}/wishes       managers and recipients
PUT    /api/wishlists/{id}/wishes/order [ids…]
PUT    /api/wishes/{id}                 incl. links[] { kind, label?, url?, note? }; previews fetched here
DELETE /api/wishes/{id}                 → Removed if it has Gifts
POST   /api/wishes/{id}/fulfil          (DELETE to undo)
POST   /api/wishes/{id}/images          multipart, resize → webp
POST   /api/wishes/{id}/images/import   { url } download a shop image (SSRF rules, §9)
POST   /api/scrape                      { url } → title, description, price, currency, siteName, images (prefill)
DELETE /api/wishes/{id}/images/{imageId}
GET    /img/{fileKey}.webp              static, cached forever

GET    /api/shared/{token}              the list behind the link: wish data only, same for everyone
GET    /api/shared/{token}/availability gift state for guests (403 for recipients)
POST   /api/shared/{token}/wishes/{wishId}/gifts         { isGroup, units?, amount?, message? }  reserve or start group
POST   /api/shared/{token}/gifts/{giftId}/participants   { amount?, message? }                   join group
PUT    /api/gifts/{id}/participants/me  change own amount / message
DELETE /api/gifts/{id}/participants/me  leave / withdraw
POST   /api/gifts/{id}/bought           organizer only (DELETE to unlock)

GET    /l/{token}                       the SPA with the list's title as Open Graph tags (link previews)
```

Rule violations are problem responses with a `type` the frontend translates (`not-available`, `join-existing`, `wrong-device`, …).
"Where to buy" links are edited inline as part of the wish payload, so they need no separate endpoints.

OpenAPI is generated by .NET at build time. The Angular client types are generated from it with `openapi-typescript`, so frontend types always match the API.

### Authorization
- **Managers** edit everything about a list. **Recipients** may add and edit wishes, but never get gift data.
- **Viewers** reach a list through its share token (`Access = Link`) or as members (`Access = Invited`).
- **Givers** are viewers who are neither manager nor recipient. Unconfirmed users may only change participations created on the same device.
- `ConfirmedUser` policy (`email_confirmed` claim): required for creating lists, inviting, uploading images, reading shop pages and setting a password.

---

## 9. Robustness

- **Outbox for mail** (§7).
- **Soft delete** for lists (restorable for 30 days) and wishes (`Removed`).
- **Concurrency token** on `Wish` for all gift operations.
- **Uploads:** max 5 images per wish, 10 MB each before resizing, EXIF stripped (removes phone GPS). Per-user storage quota (default 200 MB, configurable). Max lists per user (default 20, configurable). These matter because anyone can create lists.
- **Display name** is asked on first action, because participants need to recognise each other and emails are ugly for that.
- **Fetching user-supplied URLs (SSRF):** scrape, image import and link previews go through one `HttpClient` whose `ConnectCallback` resolves DNS itself and connects only to public addresses (no loopback, private, link-local/cloud metadata, CGNAT, ULA, multicast, NAT64/6to4 tunnels to those), only on ports 80/443, at most 5 redirects (each one checked again), 8 s timeout, 2 MB of HTML, 10 MB per image. Rate limit: 30 requests per minute and user. The User-Agent says honestly who is asking.
- **Health** endpoint `/healthz`, structured console logs.

---

## 10. Frontend

- **Routes**
  - `/`: landing page, or the overview ("Übersicht": my lists, what I give, lists from others) when logged in
  - `/login`: email → code, or email + password
  - `/app`: how to install the PWA
  - `/share`: Web Share Target, adds a shared link as a wish
  - `/confirm`: target of the magic link
  - `/lists/:id/edit`: editor (drag-and-drop sorting, settings, people, gift overview for managers)
  - `/lists/:id/thanks`: Dankesliste
  - `/l/:token`: guest view (the link people share)
  - `/profile`: name, language, optional password
- **State**: signals, with one small service per feature. No NgRx.
- **Design system** (`src/app/ui`, tokens in `styles.css`): semantic colour tokens (`paper`, `card`, `ink`, `accent`, …) use `light-dark()`, so components need no dark variants. Native inputs styled by `uiControl` inside `<ui-field>` (label, hint and validation message wired up with `aria-describedby`); `ui-switch`, `ui-segmented` and the theme pickers are signal-forms controls with ARIA roles and arrow-key navigation. Dialogs are bottom sheets on phones and centered cards on wider screens.
- **Theming**: a list's palette class sets `--brand-h`/`--brand-c`; the `brand-*` scale and the `accent` tokens are recomputed inside it. Presets only, no free colour pickers or fonts, so lists stay pretty and accessible.
- **Wishes from links**: a new wish starts from a pasted shop URL (`POST /api/scrape` prefills name, brand, description, price, EAN, pictures and the link, and warns when the shop says sold out) or from an empty form. The scraper reads what messengers use for link previews (Open Graph, Twitter cards) plus schema.org Product data (JSON-LD and microdata), strips the shop name from titles and ignores shop slogans posing as descriptions. It asks for WebP/PNG/JPEG only: CDNs answer AVIF to clients that list it, and SkiaSharp can't decode AVIF. When a shop blocks reading, the link is kept and the name comes from the shared title or is guessed from the URL.
- **Sharing into Wunschzettu**: the manifest declares a Web Share Target (`/share`, GET with `title`/`text`/`url`). Sharing a product from a shop app or browser picks the list (skipped when there is only one) and opens the wish dialog with the link. Android and desktop Chrome/Edge; iOS doesn't support share targets.
- **Sharing a list**: one "Teilen" button. Touch devices get the system share sheet; computers get a menu (copy, email, WhatsApp, Threema, Telegram, Facebook, plus the browser's own sheet if there is one).
- **Taken, fulfilled and removed wishes** are greyed out, struck through and stamped ("Vergeben", "Erfüllt"), so nobody misreads them.
- **EAN/GTIN** (optional, from the shop page or typed in) links to a price comparison.
- **PWA**: `manifest.webmanifest` + Angular service worker (production builds only). The app shell and icons are cached; `/img` is cache-first (file names never change), the read-only list APIs are network-first with a cache fallback, so recently opened lists open offline. Cached API answers are dropped on logout. A toast offers a reload when a new version is ready. `/app` and the landing page explain installing per platform; Chrome/Edge get a real install button.
- **Easy for non-technical users**:
  - The list is visible straight from the link, without any login
  - Big wish cards, one clear primary action per card ("Ich schenke das" / "Ich beteilige mich")
  - Adding a wish only requires a name; everything else is optional
  - Mobile-first, since most people open the link from WhatsApp
  - The code input auto-fills (`autocomplete="one-time-code"`)
- **i18n**: German texts live in the templates (`i18n="@@id"`), `public/i18n/en.json` holds English. `npm run i18n:check` fails on missing or stale keys.
- **Light and dark**: follows the device, or pinned in the menu. Every palette works in both; "Nacht" is always dark.
- **Gift state** is only requested when the viewer isn't the recipient.

---

## 11. Hosting on the homelab

**Dockerfile**: multi-stage
1. `node` stage builds Angular → `dist/`
2. `dotnet/sdk` stage publishes the API, copying `dist/` into `wwwroot`
3. Runtime image is `mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra` (small, non-root; "extra" brings ICU for localized dates in mails). Published for the target architecture only, ~280 MB.

**compose.yaml**
```yaml
services:
  app:
    image: wunschzettu:latest
    build: .
    restart: unless-stopped
    environment:
      App__BaseUrl: "https://wunsch.example.home"
      ASPNETCORE_FORWARDEDHEADERS_ENABLED: "true"
      Smtp__Host: "smtp.example.com"
      Smtp__Port: "587"
      Smtp__User: "..."
      Smtp__Password: "..."
      Smtp__From: "Wunschzettu <noreply@example.com>"
    user: "1000:1000"           # owner of ./data
    volumes:
      - ./data:/data:z          # sqlite db + images + data-protection keys (z: SELinux hosts)
    ports:
      - "8080:8080"             # or join your reverse-proxy network instead

```

- **TLS** is handled by the reverse proxy; `ASPNETCORE_FORWARDEDHEADERS_ENABLED` makes the app trust its headers.
- **Data Protection keys** are persisted to `/data/keys`, so cookies and magic links survive restarts.
- **Migrations** run automatically on startup (fine for a single instance).
- **Backup** means backing up `./data`. Use `sqlite3 .backup` or stop the container briefly for a consistent copy.
- **Health**: `/healthz` for the proxy or Uptime Kuma.
- **Logs**: structured console logs → `docker logs` / Loki.

---

## 12. Later (not in v1)

- **Comments or a mini-chat per group gift**, for coordinating who pays what.
- **TWINT/IBAN details** for the organizer of a group gift.
- **Notification preferences** (mute per type).
- **Passkeys** as another optional extra to email codes and passwords.
- **Postgres** if the app ever outgrows SQLite (only the provider changes).

---

## 13. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Verify to view or to act? | View with the link only. Acting needs name + email, **no confirmation required**. Confirmation via the "you chose" mail, max 2 reminders, unconfirmed actions released after 7 days (§5) |
| 2 | Who can create lists? | Anyone with a confirmed email. Quotas protect the disk |
| 3 | Can guests see who gave? | Per-list setting `ShowGiverNames` (default on). Group participants always see each other |
| 4 | Multiple managers + recipient? | Yes, in v1 (§3) |
| 5 | Group gift money | Optional amount, progress bar against the price. No payments |
| 6 | List lifecycle | Permanent list with optional event date (§6) |
| 7 | Reveal after the event | Opt-in Dankesliste once the occasion is over |
| 8 | Price | Single "ca." value, currency per list, CHF default |
| 9 | Quantity | Optional quantity, default 1, unlimited allowed |
| 10 | Languages | de-CH + en |
| 11 | Notifications | As in §7, including "you chose a wish" and "your wish was changed/removed/fulfilled" |
| 12 | Database | SQLite |
| 13 | SMTP | Any SMTP, configured via env vars |
