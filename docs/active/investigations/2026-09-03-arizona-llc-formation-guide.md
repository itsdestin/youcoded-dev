---
title: Forming and running YouCoded's Arizona LLC
status: active
created: 2026-09-03
---

# Forming and running YouCoded's Arizona LLC

Written for Destin, 2026-09-03, from the state's own instructions and 2026 walkthroughs. Sources
are at the end. Personal details (addresses, the choices from the decision deck) live in the
private brain, not here: `~/system/legal/filing-worksheet.md`.

The state site changed in January 2026. The old eCorp portal is gone; everything now happens at
the **Arizona Business Center**, https://arizonabusinesscenter.azcc.gov. Older guides still say
eCorp; ignore them.

## What this costs and how long it takes

| Step | Cost | Time |
|---|---|---|
| Articles of Organization (the filing that creates the company) | $50, or $85 expedited | 2–3 weeks, or 1–2 business days |
| Statutory agent service (optional, keeps your address off the public record) | $49–$125 a year | opens same day |
| Newspaper notice | $0 in Maricopa or Pima County; $60–$120 elsewhere | within 60 days of approval |
| EIN (the company's tax ID) | $0 | 10 minutes online, instant |
| Owner agreement (Claude drafts it) | $0 | same day |
| Business bank account | $0 a month at Mercury / Relay / Bluevine | 1–2 days |
| Annual state report | none. Arizona LLCs file nothing yearly | |

## Have these ready before you start

1. Your driver's license or passport. Since July 2026 the state verifies every user's ID once, at
   account creation, with a photo.
2. A Visa or Mastercard. The fee page still lists only those two.
3. The company email: `destin@youcoded.ai` (it forwards to your Gmail).
4. Your phone, for the six-digit login code the state emails or texts every time.
5. The decisions from the deck: name, agent, addresses, speed.

## Part 1. Creating the company (about 30 minutes)

### Check the name

https://arizonabusinesscenter.azcc.gov/nameavailability, then Business Search with "Contains".
Both need a CAPTCHA, which is why Claude could not do this for you. Arizona ignores punctuation
and the "LLC" ending when comparing names, so "YouCoded LLC" and "YouCoded, LLC" are the same name
to the state. If it is free, do not pay to reserve it. Just file.

### Create the account

https://arizonabusinesscenter.azcc.gov/register. Choose Individual, your name and email, verify
the email, set a password, mailing address, pick email or text for the login code, then the
photo-ID check.

### File the Articles of Organization

Dashboard, Filings, Business, Domestic, **Domestic Limited Liability Company** (not PLLC, which is
for licensed professions like law or medicine). Then, screen by screen:

| Screen | What to enter |
|---|---|
| Was the name reserved? | No |
| Designator and name | pick "LLC" from the dropdown, type the name exactly as you want it printed (punctuation included), Check Availability |
| Business email | destin@youcoded.ai |
| Effective date | today |
| Duration | Perpetual |
| Character of business | "any legal purpose" (code 999999 in the list) |
| Principal address | your choice from the deck. Street address, no PO Box. **Public.** |
| Management structure | **Member-Managed** |
| Add Principal | Individual, Destin Moss, title Member, your address |
| Statutory agent | your choice from the deck. If you picked a service, sign up with them first; they give you the exact name and address to type, then accept the appointment from their side |
| Document upload | skip it on the $85 path. On the $50 path you must upload the signed acceptance form (M002) here |
| Organizer | Individual, Destin Moss |
| Signature | title "Organizer", tick the perjury affirmation |
| Authorized Filers | **Opt In**. Only your account can then file changes to the company. This is the anti-fraud lock; take it |
| Cart | choose regular or expedited, pay |

What each of those words means: the **principal** is the owner. The **organizer** is whoever
submits the form, which is also you. **Member-managed** means the owner runs the company directly
with no separate managers. The **statutory agent** is the person or business with an Arizona street
address who agrees to receive lawsuits and state mail for the company; the state rejects the filing
if that person has not clicked accept before an examiner looks at it.

### After approval

The state emails you. Download three things from the dashboard: the Approval Letter, the stamped
Articles (Business Search, your company, View Document), and the Notice of Publication. Put them in
a folder; the bank and Apple will ask for the Articles.

**Newspaper notice.** If the agent's address is in Maricopa or Pima County, the state posts the
notice itself at arizonabusinesscenter.azcc.gov/publicnotice and you do nothing. Anywhere else,
publish the wording from the approval letter three times in a general newspaper in that county
within 60 days. There is no stated penalty for missing it and it is not a ground for dissolving
the company, but do it anyway; it is cheap and every lawyer expects to see it.

## Part 2. The same week

### EIN, the company's tax ID (free, ten minutes)

https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number
The application is open Monday to Friday 6 a.m. to 1 a.m. Eastern, shorter hours at weekends,
and times out after 15 idle minutes. Answers: legal structure **LLC**, members **1**, state
Arizona, it will tell you the company is a "disregarded entity" (meaning the IRS ignores it and
taxes you directly; that is normal and what you want), reason **Started a new business**, you are
the responsible party (your SSN goes here), the company's street address and your phone, the
legal name, start month September 2026, No to vehicles, gambling, excise, alcohol, employees,
category "Other" then describe as software. Choose **receive the letter online** and save the PDF
(it is called CP 575). Banks want that exact document. Never pay a site to "get your EIN"; the IRS
is the only issuer and it is free.

### Owner agreement (operating agreement)

Not filed with anyone. It is the document that says the company has one owner, who it is, that
the owner runs it, and how money moves. Banks ask for it and it is your first piece of evidence
that the company is separate from you if anyone ever sues. Claude drafts it from a standard
Arizona single-member template; you print, sign and date it, and keep it with the Articles.

### Bank account

Open it in the company's name, with the EIN, before any money moves. Mercury and Relay are free
with no minimums and open online in a day or two; they want the stamped Articles, the EIN letter,
your ID, and (Mercury) the owner agreement. A branch bank works too but usually charges $10–$15 a
month unless you keep a balance. Get the debit card. From that moment, every company expense goes
on that card and every dollar in (donations, later subscriptions) lands in that account.

### Then the rest of the launch list

D-U-N-S number, Apple, Google, Azure signing, DMCA agent, trademark: those are in the plan doc's
checklist, `docs/active/investigations/2026-09-03-formalization-costs-and-risks.md`, and each
one now gets filled in with the company's name and EIN.

## Part 3. Rules of the road

### Keeping the protection (the whole point of the LLC)

An LLC is a wall between the company's debts and your savings. Courts knock the wall down when
the company was really just you wearing a costume: the legal words are "alter ego" plus "an
injustice would result". Arizona law says forgetting formalities alone is not enough to lose it,
but the pattern courts punish is always the same: mixed money and no records. So:

**Do**
- One company bank account and card. Company money in, company expenses out, nothing personal.
- Pay yourself by moving money from the company account to your personal one and noting it as an
  owner draw. That is the only way money should cross the line.
- Keep books. A spreadsheet with date, amount, what and why is enough at this size. Keep receipts.
- Put enough money in at the start to cover the company's foreseeable bills for a few months.
  Courts look at whether it was "thin" at formation, not later.
- Put the full legal name on the website footer, the Terms, the Privacy page, invoices, and
  receipts: "<legal name> LLC, an Arizona limited liability company" (and, if the legal name is not YouCoded, "YouCoded is a product of <legal name> LLC").
- Sign everything as the company, not as yourself: **"<legal name> LLC, by Destin Moss, Member"**.
  Signing a bare "Destin Moss" on a contract makes you personally the party.
- Contracts, subscriptions, the domain, the app store accounts: in the company's name, paid from
  the company card.
- Once real revenue starts, consider technology errors-and-omissions insurance, roughly
  $500–$1,300 a year for a one-person software company, and general liability at $230–$385.

**Don't**
- Don't pay personal things from the company card, or company things from your personal card
  "just this once". If it happens, reimburse and write it down.
- Don't personally guarantee company debts unless you must.
- Don't let the company account sit at zero while it has obligations.
- Don't move company money to yourself while a dispute is live. A single-member owner in
  Colorado lost his protection for exactly that.

### Taxes, in plain terms

- **Federal.** The company does not file its own return. Its profit or loss goes on your personal
  return as Schedule C. On top of income tax you owe **self-employment tax**, 15.3% of net profit,
  once net profit passes $400 in a year; half of it is deductible. If you expect to owe more than
  $1,000 in tax for the year, you pay estimates quarterly (April 15, June 15, September 15,
  January 15). At tiny revenue this does not trigger.
- **Donations are income.** Buy Me a Coffee money is taxable business income, not gifts, because
  it supports a business. Stripe (which runs Buy Me a Coffee payouts) sends the 1099-K.
- **Arizona income tax** is a flat 2.5% on the same profit, on your personal state return. No
  separate company return, no yearly company fee.
- **Arizona sales tax (called TPT).** Only matters once you *sell* something. Arizona does tax
  software subscriptions (a 2023 court case, *ADP v. Arizona Department of Revenue*). Free app plus
  donations means no TPT license today. When paid tiers arrive, sell through a merchant of record
  (Paddle or Lemon Squeezy); they are legally the seller and file the sales tax in every state and
  country, and Arizona law then excuses you from registering. Stripe alone does not do this; with
  plain Stripe you would need the $12 TPT license and monthly filings.
- **S-corp election.** A tax trick that saves self-employment tax once profit is roughly $60,000
  to $80,000 a year, at the cost of running payroll and a separate return. Not now. Revisit when
  profit gets there.
- **Federal ownership report (BOI).** Permanently gone for US companies as of August 2026.
  Anyone emailing you about a "required BOI filing" is selling something.

### City rules

Arizona has no state business license. Cities differ, and only for the city you are actually in:

| City | General business license for a home software business |
|---|---|
| Phoenix, Tempe | none |
| Mesa, Glendale | yes, $25 to open + $25 a year |
| Scottsdale | yes, $12 + $50 a year |
| Gilbert | yes, about $50 a year |
| Chandler | yes, annual registration plus a home-business zoning clearance (fee unclear, $2 to $45) |
| Tucson | yes, plus a signed home-occupation form (about $25 to open, $45–$50 a year) |
| Flagstaff | yes, $8, plus a home-occupation permit |

Every city allows a quiet home office (no signs, no customer traffic, no outside employees)
without a special permit; Tucson and Chandler want the form saying so.

### What Arizona wants from you later

- **Nothing yearly.** No annual report, no fee.
- **Changes within 30 days.** New agent or address: a $5 Statement of Change. Adding or removing
  an owner: Articles of Amendment, $25.
- **Attestation of existence.** A new anti-fraud rule: each January, if the company has filed
  nothing for two years, the state emails a notice asking you to confirm the company still exists.
  Ignore it for 60 days and the company goes "pending inactive", then dissolved 120 days later.
  Keep the company email current and answer that email.
- **Trade name.** Only needed if the company trades under a name other than its legal one. $10 for
  five years at azsos.gov.

## Part 4. Moving what already exists into the company

The domain, the GitHub organisation, the Buy Me a Coffee page, the Cloudflare account and the
code are yours personally today. Moving them is mostly a one-page **assignment letter** (Claude
drafts it): you, personally, assign the listed assets to the company as your opening
contribution; you sign once as yourself and once as the company. Then, service by service:

- **Domain and Cloudflare.** No transfer needed; the letter is enough. Put the company name and
  card on the Cloudflare billing profile.
- **GitHub.** No ownership-transfer button exists for organisations. Keep your login as owner,
  put the company on the billing page, and the letter covers the rest.
- **Buy Me a Coffee.** Payouts run through Stripe. In the Stripe settings switch the account type
  from individual to company and enter the EIN and legal name (it re-verifies), then point payouts
  at the company bank account. From then on the donation income is the company's.
- **Existing Anthropic, Apple, Google accounts.** Open the new developer accounts in the
  company's name from the start rather than converting personal ones.

## Sources

- Portal launch and eCorp shutdown: https://www.azcc.gov/news/home/2026/01/08/arizona-business-center---acc-s-new-online-business-filing-portal-to-debut-january-12--2026
- ID verification from July 2026: https://azcc.gov/news/home/2026/07/13/acc-corporations-division-announces-new-online-verification-aimed-at-preventing-business-filing-fraud
- Filing walkthroughs (2026): https://www.llcuniversity.com/arizona-llc/forms/ and https://www.keytlaw.com/arizona-llc-articles-of-organization/
- Fee schedule (rev. March 2026): https://azcc.gov/docs/default-source/corps-files/fee-schedules/fee-schedule-llcs.pdf
- Processing times: https://azcc.gov/docs/default-source/corps-files/document-processing-times.pdf and https://www.llcuniversity.com/how-long-does-it-take-to-get-an-llc-in-arizona/
- Name rules and distinguishability: https://www.azleg.gov/ars/29/03112.htm , https://azcc.gov/corporations/determining-distinguishability
- Statutory agent statute: https://www.azleg.gov/ars/29/03115.htm ; prices https://www.arizonaregisteredagent.com/ , https://www.llcuniversity.com/arizona-llc/registered-agent/
- Publication rule: https://www.azleg.gov/ars/29/03201.htm , https://www.llcuniversity.com/arizona-llc/publication-requirements/
- Anti-fraud policies incl. attestation: https://www.keytlaw.com/azllclaw/2025/12/new-acc-rules/
- No annual report; changes: https://azcc.gov/faqs/BusinessServicesFAQs , https://www.azleg.gov/ars/29/03202.htm
- EIN: https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number , https://www.llcuniversity.com/irs/apply-for-ein-for-llc-online/
- Single-member LLC taxation: https://www.irs.gov/businesses/small-businesses-self-employed/single-member-limited-liability-companies ; SE tax https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes ; estimates https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes
- Donations taxable: https://www.thetaxadviser.com/news/2024/aug/taxability-crowdfunding-distributions/ , https://help.buymeacoffee.com/en/articles/8039657-understanding-the-tax-process-on-buy-me-a-coffee
- Arizona 2.5% flat tax: https://taxfoundation.org/location/arizona/ ; TPT license https://www.azleg.gov/ars/42/05005.htm ; marketplace facilitator https://www.azleg.gov/ars/42/05043.htm ; SaaS taxable https://www.swlaw.com/publication/saas-remains-subject-to-tpt-in-arizona/ ; Paddle as merchant of record https://www.paddle.com/help/start/intro-to-paddle/how-paddle-is-able-to-take-on-your-vat-and-tax-responsibilities
- City licenses: Phoenix https://www.phoenix.gov/administration/departments/cityclerk/programs-services/license-services.html ; Tempe https://www.tempe.gov/government/financial-services/sales-tax-licensing/general-business-license ; Mesa https://www.mesaaz.gov/business/licensing/mesa-general-business-license ; Chandler https://www.chandleraz.gov/business/tax-and-license/business-registration ; Scottsdale https://www.scottsdaleaz.gov/licenses ; Glendale https://www.glendaleaz.gov/Work/Licensing-Sales-Tax/Business-Licenses ; Tucson https://www.tucsonaz.gov/Departments/Business-Services-Department/Apply-for-a-Business-License ; Flagstaff https://www.flagstaff.az.gov/3513/Business-Licenses
- Operating agreement statute and template: https://www.azleg.gov/ars/29/03105.htm , https://www.llcuniversity.com/arizona-llc/operating-agreement/
- Banks: https://support.mercury.com/hc/en-us/articles/28770957425172-Gathering-your-documents , https://relayfi.com/pricing , https://www.bluevine.com/business-checking
- Liability shield: https://www.azleg.gov/ars/29/03304.htm , https://www.robertdmitchell.com/article/piercing-corporate-veil/ , https://goodmanlaw.com/pierceveil/ , https://www.keytlaw.com/azllclaw/martin-v-freeman/ , signing https://www.rocketlawyer.com/business-and-contracts/starting-a-business/form-an-llc/legal-guide/how-to-sign-documents-on-behalf-of-an-llc ; insurance https://www.insureon.com/technology-business-insurance/software-developers/cost
- BOI eliminated: https://corpgov.law.harvard.edu/2026/08/27/fincen-permanently-eliminates-boi-reporting-requirements-for-us-companies-and-us-persons/
- Trade name: https://azsos.gov/business/tntm
- Asset assignment: https://www.llcuniversity.com/websites/transfer-ownership-of-domain-name-to-llc ; GitHub https://docs.github.com/en/organizations/managing-organization-settings/transferring-organization-ownership ; Cloudflare https://developers.cloudflare.com/fundamentals/manage-domains/move-domain/
