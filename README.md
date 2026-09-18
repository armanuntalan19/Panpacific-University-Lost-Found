# Panpacific University — Lost & Found Website

Plain HTML, CSS, and JavaScript frontend + Supabase backend (database, auth, storage).
No frameworks, no build step — just open the files and edit.

## Folder structure
```
index.html               The login page — this is what loads when the site opens
home.html                Home page (hero, "how it works", recently reported items) — login required
register.html            Create account
reset-password.html      Password reset flow
lost-items.html          Browse lost items (viewing an item + submitting a claim opens as a modal) — login required
found-items.html         Browse found items (same modal pattern) — login required
dashboard.html           Student/Staff dashboard (my reports, claims, notifications) — login required
admin.html               Admin panel (approve reports/claims, manage users) — login required
css/                     navbar.css (shared sidebar styles) + one CSS file
                          per HTML page (home.css, index.css, admin.css, etc.)
                          — every page's styling lives in its own matching file
js/                      supabase-client.js (your keys go here), auth.js, and one file per page
images/                  Logo and login illustration
backend/                 schema.sql (the database) + BACKEND-README.md, so the
                          backend can be reviewed or submitted on its own
```

> **Note:** `backend/schema.sql` is the single copy of the database script — it's not
> loaded by the site itself, it's the file you paste into Supabase's SQL Editor once
> (see Part 1 below). The `backend/` folder exists so the backend can be reviewed or
> submitted on its own, separate from the rest of the site.

---

## PART 1 — Set up Supabase (database + auth + storage)

1. Go to https://supabase.com and sign in (or create a free account).
2. Click **New Project**. Give it a name like `panpacific-lost-found`, set a database
   password (save it somewhere safe), pick a region close to you, and click **Create**.
   Wait a minute or two while it provisions.
3. In the left sidebar, click the **SQL Editor** icon, then **New query**.
4. Open `backend/schema.sql` from this project, copy the **entire file**, paste it into
   the SQL editor, and click **Run**. This creates the `profiles`, `items`, `claims`,
   and `notifications` tables, the security rules (RLS), and a storage bucket for
   photos — nothing runs automatically until you do this yourself.
5. In the left sidebar, go to **Authentication → Providers**, and confirm **Email**
   is enabled (it is by default).
6. (Recommended) Go to **Authentication → Settings** and, under **Email**, turn off
   "Confirm email" only if you want students to log in immediately after registering
   without clicking a confirmation link — otherwise leave it on for real deployments.
7. Go to **Project Settings → API**. You'll see two values you need:
   - **Project URL**
   - **anon / public key**

   Keep this tab open — you'll paste these into the frontend next.

### Making your first Admin account
Because Admins can't self-register, do this once:
1. Register a normal account on your site (as Student or Staff) using your own
   `@panpacificu.edu.ph` email.
2. In Supabase, go to **SQL Editor** and run:
   ```sql
   update profiles set role = 'admin' where email = 'yourname@panpacificu.edu.ph';
   ```
3. Log out and back in — you'll now see **Admin Panel** in your account menu.
   From then on, that Admin can promote other users to Admin from the Users tab.

---

## PART 2 — Connect the frontend to Supabase

1. Open `js/supabase-client.js` in a code editor (VS Code, Notepad++, etc.).
2. Replace:
   ```js
   const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
   const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";
   ```
   with the **Project URL** and **anon / public key** you copied in Part 1, step 7.
3. Save the file.

That's it — no other file needs to change. Every page reads these two values from
this one file.

---

## PART 3 — Deploy the frontend to Netlify

**Option A — Drag and drop (fastest, no GitHub needed)**
1. Go to https://app.netlify.com and sign in (or create a free account).
2. Click **Add new site → Deploy manually**.
3. Drag your whole project folder (the one containing `index.html`) into the
   upload box.
4. Netlify uploads it and gives you a live URL like `https://random-name.netlify.app`
   within a few seconds. Open it and test the site.
5. To update the site later, make your edits locally, then drag the folder in
   again the same way — it replaces the previous version.

**Option B — Connect to GitHub (better for ongoing work)**
1. Create a new repository on GitHub and push this project folder to it.
2. In Netlify, click **Add new site → Import an existing project**, choose
   **GitHub**, and pick your repository.
3. Leave **Build command** blank and set **Publish directory** to `/` (the
   project root, since there's no build step).
4. Click **Deploy site**. Every time you push new commits to GitHub, Netlify
   automatically redeploys.

**(Optional) Custom domain**
In Netlify, go to **Site settings → Domain management → Add a domain** if the
university has a domain/subdomain to point at the site.

---

## PART 4 — Test it end-to-end
1. Visit your Netlify URL — you should land on the login page.
2. Register with a `@panpacificu.edu.ph` email — try a non-matching email first
   to confirm it's rejected. Notice the registration form only offers **Student**
   or **Staff** — there's no way to self-register as Admin.
3. Log in and report a lost item — fill in a category, description, location,
   and a photo. It shows status **Pending** until an Admin approves it.
4. While still logged in as this non-admin account, open **Lost Items** and
   find your own report. Notice you only see its ID code (like `#L-024`),
   category, date, and status — no photo, location, or description, even
   though you're the one who submitted it and it's still pending.
5. Make yourself an Admin (see Part 1), log in as that account, and open the
   **Admin Panel → Pending Reports** tab. Confirm the Admin view shows the
   full private details (photo, location, description) and approve the report.
6. From a second account, report a found item in the **same category and
   location**, within a few days of the lost report's date, and get it approved.
7. Back in the Admin Panel's **Possible Matches** tab, the two reports should
   appear paired up. Click **Notify Owner** to alert the person who lost the item.
8. Log back in as the person who lost the item. Their dashboard notification
   bell should show 1 unread — clicking it opens the matched found item.
9. On that item, submit a claim — describe the item, its characteristics,
   and where/when you lost it, **without** being shown the real details first.
10. As Admin, open the **Claims** tab and compare the claimant's blind answers
    side-by-side against the real item record before approving. Approving marks
    the item **Claimed**; once it's physically handed back, use **Mark Returned**
    to close the report.
11. Check the **Activity History** tab — it should show every action taken
    above, in order.

---

## PART 5 — (Optional) Turn on real email notifications
By default, notifications only show up as a bell icon inside the site. To
also send a real email to a Student/Staff/Admin's university address
whenever they get a notification (report approved/rejected, possible
match, claim submitted/approved/rejected, item returned):

1. Go to https://brevo.com and create a free account (300 emails/day
   free — plenty for a school project; double-check Brevo's current
   free-tier limit on their site, since it can change).
2. In Brevo, go to **Senders, Domains & Dedicated IPs → Senders → Add a
   Sender**, and verify ONE email address you actually own (your own
   Gmail, or your own `@panpacificu.edu.ph` inbox both work). Brevo
   emails you a confirmation link — click it to finish verifying.
   Unlike a full domain, this only takes a couple of minutes and needs
   no DNS access.
3. In Brevo, go to **SMTP & API → API Keys → Generate a new API key**,
   and copy the key it gives you.
4. In Supabase, go to **SQL Editor → New query**, and run this ONE line
   yourself, with your real key pasted in:
   ```sql
   select vault.create_secret('your_real_key_here', 'brevo_api_key');
   ```
   This is the only place your API key needs to go — it's stored
   encrypted in Supabase's Vault, not left in plain text anywhere.
5. Open `backend/schema.sql`, find this line inside
   `send_notification_email()`:
   ```sql
   sender_email text := 'YOUR_VERIFIED_BREVO_SENDER_EMAIL_HERE';
   ```
   and replace it with the exact email address you verified in step 2.
   This must match exactly, or Brevo will reject the request. Re-run
   the full `schema.sql` in Supabase's SQL Editor afterward so the
   change is saved.
6. That's it. The trigger in `backend/schema.sql` (see "11. EMAIL
   NOTIFICATIONS" near the end of the file) automatically emails
   whoever a notification is for. Once your one sender email is
   verified, it can email ANY recipient — including every student and
   staff account — with no per-recipient setup needed.
7. Test it: trigger any notification (e.g. approve a report) for an
   account other than your own, and check the recipient's inbox (and
   spam folder) within a minute or two.

**Skipping this part is fine** — the site works completely normally
without it; notifications simply stay bell-only until you set this up.

---

## Notes
- Passwords are never handled by this frontend directly — Supabase Auth hashes
  and stores them securely.
- The real privacy boundary is `items_view` (defined in `backend/schema.sql`),
  not the frontend — it returns `null` for private fields (photo, location,
  description, contact info) to anyone who isn't the report's owner or an
  Admin, so the data never reaches the browser in the first place. See
  `backend/BACKEND-README.md` for the full explanation.
- Photos live in a **private** storage bucket — there's no public image URL,
  only temporary signed links generated for an authorized viewer.
- The **Possible Matches** tab in the Admin Panel pairs up lost/found reports
  only when they share the same location, the same category, AND were
  reported within a week of each other — see `isMatch()` in `js/admin.js`.
- The **Users** tab lets Admin flag a suspicious account, and automatically
  shows a warning badge next to anyone who's filed 3+ claims in the last
  30 days — both are meant to help Admin spot fraud patterns, not just
  individual claims.
- The moment a claim is submitted, every Admin gets a bell notification
  automatically — this happens via a database trigger (see
  `notify_admins_of_new_claim()` in `backend/schema.sql`), not frontend
  code, so it can't be skipped or faked by a Student's browser.
- If something isn't loading, open your browser's DevTools console (F12) —
  Supabase errors (wrong keys, RLS blocking a query, etc.) show up there.