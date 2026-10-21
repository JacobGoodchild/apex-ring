# Switching on online play

Apex Ring's world leaderboards, friends list and live **Race with friends** rooms all run on
[Supabase](https://supabase.com), a hosted database with a free tier. The game already has the
code for all of it. It stays "under construction" until you give it a Supabase project. It takes
about 10 minutes and costs nothing.

## 1. Make a Supabase project
1. Go to supabase.com and sign up (GitHub login works).
2. Click **New project**. Pick any name (e.g. `apex-ring`), set a database password (keep it
   somewhere safe; the game never needs it), and choose the region nearest you (e.g. London).
3. Wait a minute or two while it starts up.

## 2. Create the tables
1. In the project, open **SQL Editor** (left sidebar) and click **New query**.
2. Open `supabase/schema.sql` from this repo, copy all of it, paste it in, and click **Run**.
   You should see "Success. No rows returned".

This makes three tables:
- **profiles:** driver name and friend code.
- **laps:** lap times.
- **friends:** who is friends with whom.

It also turns on safety rules: everyone can read the leaderboards, but each player can only add
their own laps and change their own profile.

## 3. Turn on guest sign-in
Players don't need an email or password. Each phone signs in as an anonymous guest the first
time it goes online.
1. Open **Authentication > Sign In / Providers** (on some dashboards: **Authentication > Providers**).
2. Turn on **Allow anonymous sign-ins** and save.

## 4. Let live rooms work
Race rooms use Supabase **Realtime** "broadcast" messages. No tables are needed.
1. Open **Realtime > Settings**.
2. Make sure **Allow public access** (public channels) is **on**. If your project only allows
   private channels, rooms won't connect.

## 5. Put the project's address and key in the game
1. Open **Project Settings > API** (or the **Connect** button at the top).
2. Copy the **Project URL** (looks like `https://abcdefghijkl.supabase.co`).
3. Copy the **anon public** key. Don't use the `service_role` / secret key: that one must never
   go in the game.
4. Paste them into `src/onlineconfig.js`:
   ```js
   export const ONLINE = {
     url: "https://abcdefghijkl.supabase.co",
     anonKey: "eyJhbGciOi...",
   };
   ```
5. Commit and push to `main`. The deploy runs the tests and publishes the update. Phones get it
   on their next launch.

The anon key is meant to be public. Everything it can do is limited by the rules from step 2,
so it's safe in the game's code.

Or just send me the URL and the anon key, and I'll put them in and push.

## How players use it (Menu > Online)
- **Global:** the world top 100 for each track. Your best lap uploads automatically whenever you
  set a new personal best.
- **Friends:** your friend code (like `APX-7K2Q`). Type a friend's code and press **Add**; you
  both see each other on the Friends leaderboard.
- **Race:** live races with friends.
  1. One player taps **Make a room** and sends the 5-letter room code to the others.
  2. They type it and tap **Join**. Everyone in the room is listed with their car.
  3. The host picks the track with ‹ ›, then presses **Start race**. Everyone gets the
     countdown together.
  4. During the race you see your friends' real cars where they are on the track, and the
     position counter includes them.
  5. When the race ends, **Menu** takes you back to the room for another go.
- **Profile:** set the driver name shown on the boards.

## Good to know
- **Free tier limits:** about 200 people connected to rooms at once, plenty of database for lap
  times, and the project pauses after a week with no visits (one click in the dashboard wakes
  it up).
- **Collisions:** friends' cars are "ghosts" you can't crash into. Over a phone connection
  that's what keeps it fair and smooth.
- **Cheating:** the database rejects lap times under 10 seconds or over 30 minutes. A
  determined cheater could still post a fake lap. If that ever matters, the next step would be
  a server check (a Supabase Edge Function).
- **Syncing progress between devices** (coins, cars) isn't built yet. It would need a proper
  account with an email, and the button still says "under construction".
