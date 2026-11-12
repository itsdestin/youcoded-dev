# Phone checklist (about 15 minutes, real phone)

Your computer needs a build that includes the branch `session/phone-followups` (or the Dev copy), with the phone paired.
A. Browser approval (#205)
1. Computer, private test chat: "Use the browser to open example.com and click the first link."
2. Phone, open that chat: card "Let the assistant click and type on example.com?" Yes/Always allow/No. Tap Yes → continues. FAIL: no card / tap does nothing.
3. Ask for something that posts (test contact form): card "A final step" Yes/No. Tap No → assistant says you declined.
4. "open a site and wait for me to sign in": phone shows message + only "I can't do this". Tap → stops waiting.
5. Close phone app while a question waits, reopen chat: card still there.
6. Note whether phone chimes/turns red (expected no).
B. Disconnects (#182, #99, #113a)
7. Lock phone 5+ min, unlock: reconnects in seconds, Send works.
8. Sleep computer a minute, wake: phone recovers within ~1 min, no re-pairing; paired devices shows ONE row.
9. Open very long chat on phone: newest messages quick. Terminal view mid-output: no stray "[0m"/garbled colours.
10. First open after clearing: note white flash before sign-in.
C. Other
11. (#113c) From phone add a folder to saved folders; allowed? surprising?
12. (#117b) Start voice typing, connect to another computer mid-speech: mic stops and says voice typing is off. FAIL: keeps listening.
13. (#139) Tap through Projects tabs, Settings, New session at phone width: note anything clipped/too small.
