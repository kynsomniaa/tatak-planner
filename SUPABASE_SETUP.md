# Supabase setup for CpE Pathfinder

The app remains in local preview mode until these steps are completed. Username-only accounts intentionally have no email recovery.

## 1. Create the project

1. Sign in at `https://supabase.com/dashboard`.
2. Create a new project in an organization you control.
3. Save the database password in a password manager. Do not put it in this repository.
4. Wait for the project to finish provisioning.

## 2. Configure username-only password authentication

Supabase password authentication normally uses email or phone. CpE Pathfinder maps each username to an internal, non-deliverable account address that is never shown to students.

1. Open **Authentication → Providers → Email**.
2. Keep email/password authentication enabled.
3. Turn **Confirm Email** off. An internal username account has no inbox, so confirmation must be disabled.
4. Keep public sign-ups enabled when you are ready for students.

There is no password reset flow. If a password is forgotten, the account and its private plan cannot be recovered through email.

## 3. Apply the database migration

From the project directory:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The migration at `supabase/migrations/202608160001_initial.sql` creates profiles, private workspaces, ratings, reports, moderation functions, and Row Level Security policies.

## 4. Connect the app

Open the project's **Connect** dialog or **Settings → API Keys**. Copy only:

- Project URL
- Publishable key (`sb_publishable_...`)

Create `.env.local` in the project root:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Never use a secret key, legacy `service_role` key, or database password in the app. Restart Expo after adding the environment values.

## 5. Create and promote Kynsomnic

Do this before sharing the public registration link so nobody else can claim the username.

1. Open the connected app.
2. Register `Kynsomnic` and privately choose its password.
3. In the Supabase SQL Editor, run this data update:

```sql
update public.profiles
set role = 'admin'
where lower(username::text) = 'kynsomnic';
```

4. Sign out and sign back in. Settings should show `Cloud account · admin`.

The password is never placed in source code or shared with Codex.

## 6. Verify

1. Create a second test username.
2. Confirm each account sees only its own plan.
3. Mark a course Passed or Retake and publish a rating.
4. Confirm the other account can see the rating but cannot edit or delete it.
5. Report that rating and confirm `Kynsomnic` receives the moderation control.

Existing browser-local prototype accounts and plans do not migrate automatically.
