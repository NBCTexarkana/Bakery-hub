# Texarkana Bakery Hub: setup guide

What's in this folder:

| Folder / file | What it is |
|---|---|
| `web/` | The app your team opens (goes on Vercel) |
| `web/config.js` | The one file you edit, with your Supabase address and public key |
| `supabase/1-schema.sql` | Creates the database, roles and privacy rules |
| `supabase/functions/toast-sync/` | Pulls sales and labor from Toast |
| `supabase/functions/invite-user/` | Lets managers invite staff from inside the app |
| `supabase/3-schedule-toast-sync.sql` | Makes the Toast pull run every 15 minutes |

Plan on about 45 minutes. Do the steps in order.

---

## Step 1: Create the database (Supabase)

1. Open your `bakery-hub` project at supabase.com.
2. In the left menu click **SQL Editor**, then **New query**.
3. Open `supabase/1-schema.sql` in Notepad (Windows) or TextEdit (Mac), copy everything, paste it in, and click **Run**. It should say "Success. No rows returned."

## Step 2: Create your own login (you become the owner)

The first account created is automatically the **owner**, so do this before anyone else signs up.

1. Left menu: **Authentication**, then **Users**, then **Add user**, then **Create new user**.
2. Enter your email and a password, and check **Auto Confirm User**. Click **Create user**.

## Step 3: Add the two server functions

**toast-sync**
1. Left menu: **Edge Functions**, then **Deploy a new function**, then **Via Editor**.
2. Name it exactly `toast-sync`.
3. Delete the sample code, paste in everything from `supabase/functions/toast-sync/index.ts`, and click **Deploy**.
4. Open the function's settings and turn **off** "Verify JWT" (sometimes called "Enforce JWT verification"). The function checks who's calling it on its own.

**invite-user**
1. Repeat with the name `invite-user` and the code from `supabase/functions/invite-user/index.ts`. You can leave "Verify JWT" on for this one.

**Secrets.** In **Edge Functions**, then **Secrets**, add these one at a time:

| Name | Value |
|---|---|
| `TOAST_API_HOST` | The **API Access URL** from your Toast credentials screen |
| `TOAST_CLIENT_ID` | Your Toast client ID |
| `TOAST_CLIENT_SECRET` | Your Toast client secret |
| `TOAST_RESTAURANT_GUID` | Your location's ID: the long ID with dashes listed under locations on the Toast credentials screen. If you can't find it, ask Toast support for your "restaurant GUID". |
| `SYNC_KEY` | Make up a long random password, for example from your password manager. Save it; you'll use it again in Step 6. |
| `STORE_TIMEZONE` | `America/Chicago` (optional, this is the default) |

These values stay on Supabase's servers. They never go in the app or on GitHub.

## Step 4: Put the app on GitHub

1. Open `web/config.js` in Notepad or TextEdit.
2. In Supabase go to **Project Settings**, then **API Keys** (or **API**). Copy:
   - your **Project URL** (like `https://abcd1234.supabase.co`) into `SUPABASE_URL`
   - the **publishable** key (or the **anon public** key) into `SUPABASE_KEY`

   Never use the **secret** or **service_role** key here.
3. Save the file.
4. On github.com, open your `bakery-hub` repository and click **Add file**, then **Upload files**. Drag in the `web` and `supabase` folders and this guide, then click **Commit changes**.

## Step 5: Publish the app (Vercel)

1. At vercel.com click **Add New**, then **Project**, then **Import** next to `bakery-hub`. If it isn't listed, click "Adjust GitHub App Permissions" and allow the repository.
2. Set **Root Directory** to `web`. Leave Framework as "Other".
3. Click **Deploy**. When it finishes you'll get an address like `bakery-hub-xyz.vercel.app`. That's your app.

Then tell Supabase where the app lives:

1. In Supabase go to **Authentication**, then **URL Configuration**.
2. Set **Site URL** to your Vercel address, like `https://bakery-hub-xyz.vercel.app`.
3. Add the same address under **Redirect URLs** and click **Save**.

## Step 6: Turn on the automatic Toast pull

1. Open `supabase/3-schedule-toast-sync.sql` in Notepad or TextEdit.
2. Replace `YOUR-PROJECT-REF` with the ID from your Project URL (the `abcd1234` part).
3. Replace `YOUR-SYNC-KEY` with the SYNC_KEY you made in Step 3.
4. Paste it into **SQL Editor** in Supabase and click **Run**.

To check that it's working, sign into the app, open **Sales** and click **Sync now**. Today's numbers should appear within a few seconds. If there's a problem, the message under the title says what's wrong.

## Step 7: Add your team

**Recommended: create accounts directly (no email setup needed).**

1. In Supabase go to **Authentication**, then **Users**, then **Add user**, then **Create new user**.
2. Enter the person's email and a temporary password, and check **Auto Confirm User**.
3. Give them the app address and their temporary password. They can change it under **Team**, then **Edit my profile**.
4. In the app go to **Team**, tap their name, and set their name, position and access. Make Reece and Rylee **Manager**; only the owner can do that.

**Optional: email invites and "Forgot password".** The app's **Invite team member** button and the "Forgot your password?" link both send emails. Supabase's built-in email only sends to a few addresses and is limited to a handful of emails an hour. To use these for your whole team, connect an email service in **Authentication**, then **Emails**, then **SMTP Settings**. Resend has a free plan, or you can use your business email's SMTP settings.

---

## Who can do what

| | Owner | Managers (Reece, Rylee) | Staff |
|---|---|---|---|
| See calendar, schedule, inventory, orders | ✓ | ✓ | ✓ |
| Change calendar, schedule, inventory, orders | ✓ | ✓ | |
| Team board: read and post | ✓ | ✓ | ✓ |
| Managers-only board | ✓ | ✓ | |
| Private messages | Only the two people in each conversation can read them. No one else can, including the owner. | | |
| Sales and labor | ✓ | ✓ | |
| Make someone a manager | ✓ | | |

When someone leaves, open **Team**, tap their name and uncheck **Active**. That keeps them out of the app and removes them from the schedule. To shut off their login completely, also delete them under Supabase's **Authentication**, then **Users**.

## About the sales numbers

- **Net sales** is each check's pre-tax amount after discounts. Voided and deleted orders and checks are left out.
- **Labor cost** is regular hours times hourly wage, plus overtime hours times wage times 1.5, taken from the Toast time clock. Salaried staff without an hourly wage in Toast aren't counted. People still clocked in are counted up to the current minute.
- **Labor %** is labor cost divided by net sales. The green target is set in `web/config.js` (`LABOR_TARGET_PCT`, 25 by default).
- For the first week, compare a few days against Toast's own sales and labor reports. If anything is off, send me the two numbers and I'll adjust the calculation.

## Making changes later

To update the app, edit the files in GitHub (or upload new versions). Vercel republishes automatically within a minute.
