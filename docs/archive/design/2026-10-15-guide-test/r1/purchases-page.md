# r1 · purchases-page — builder report

## What it built
A YouCoded **Page** "Purchases" (dollar icon): Spent so far (month total, vs last month same day, one split bar by category), Needs a category (unsorted purchases with "Pick a category"; choice applies to later ones from that place), Categories (10 cards: amount, count, share, "$41 more than September"; click filters), Every purchase (filter chips; row's category pill moves it), Banks (status, "Connect another bank"). Data from banks via the app's Plaid connection, read-only. Category colours reuse tag colours as dots/bars only.
States: normal, `#category`, `#add` (cash purchase form), `#empty` ("See where your money goes" + "Connect a bank"), `#loading`, `#reconnect` (amber notice, "Sign in to Discover"), `#failed` (red notice replaces total, Try again), phone.
References named: Home page, analytics page, Session details' Tags, Backup & sync / Games → Friends notices.
App change: `page-theme.ts` gives pages the tag colours.
It noticed the hidden Money page left a dangling screen name (`pages/page/page-money`) in its copy — a side effect of hiding it, not a real bug.

## Guide-gap notes
Not available: the builder's answer was cut off twice and it could not resend. Judge from the pictures only.
