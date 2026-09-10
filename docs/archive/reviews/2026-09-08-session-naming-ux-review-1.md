# Session naming — first-time UX review 1

- U1 rejected — Session terminology matches the existing session strip and user’s requested settings vocabulary; broad conversation/session terminology changes are outside this preview. Original finding: Expected the naming settings and rename dialog to use the same everyday term as the conversation / They use “SESSION NAMING”, “Rename session”, and “Session name”, while the explanation says “conversation”; use “Conversation naming”, “Rename conversation”, and “Name” — Assistant settings and Rename session — `scratch/naming-ux-8c/midnight/assistant-settings.png`, `scratch/naming-ux-11/midnight/rename-menu.png`
- U2 accepted — Applied shorter explanation. Original finding: Expected a short explanation of what saving does / “Saving a name keeps it yours. Automatic naming won’t replace it.” repeats the same promise; shorten to “Automatic naming won’t change this name.” — Rename session — `scratch/naming-ux-11/midnight/rename-menu.png`
- U3 accepted — Shortened to “Keeps a short name from your first message. No AI needed.” to avoid implying the entire message is the title. Original finding: Expected a plain description of Basic naming / “Uses your opening request as the name, then keeps it. No AI calls. This is the default.” is wordy and “AI calls” is technical; propose “Keeps your first message as the name. No AI needed. Default.” — Assistant settings, Basic naming — `scratch/naming-ux-8c/midnight/assistant-settings.png`
- U4 rejected — Existing step-guard wording is unrelated to naming; no expansion into other settings in this preview. Original finding: Expected nearby settings to be understandable without developer knowledge / “Step guard” and “Pause after this many tool-loop steps (rounds), not each parallel tool call. Other safety checks still apply. Choose None to run without this guard.” introduce unexplained technical terms; propose “Pause after this many steps” with “The assistant pauses after this many rounds of work. Choose None for no limit.” — Assistant settings, below naming — `scratch/naming-ux-12/midnight/ai-naming.png`

## Task outcome

Partially completed on the simulated backend at desktop 1440×900 in Midnight. Found Settings → Assistant settings → General → Session naming, changed Basic to AI, opened the naming-model picker, and selected GPT-5 · OpenRouter; the final screenshot visibly confirms that selection. Opened the conversation tab’s right-click menu and Rename session dialog after the parent announced its fix. A Save name attempt changed the displayed title to `fix chat scroll stickBiology revision`, because the kit keyboard select-all attempt did not replace the existing text; this is not established as a product defect. The tab’s tooltip still read `fix chat scroll stick` in the control dump. The follow-up selector targeting the intended name therefore missed, and the final rename screenshot was unverified, so no rename success or automatic-restoration success is claimed. Stopped at the parent’s time cap before retrying replacement or returning the conversation to automatic naming. Narrow layout, touch, high-density screens, persistence across reloads, generated titles, and help popovers were not reviewed. No visible clipping was found in the inspected naming controls or rename dialog; this does not establish wider visual coverage.

## Evidence and limitations

The initial workbench toolbar page embedded the app in an iframe, so the kit dump listed only toolbar controls. Subsequent shots used the iframe’s observed URL `http://127.0.0.1:5343/?mode=workbench&child=1&view=app&scenario=default&latency=150`; no app code was inspected. Selector misses and the probe timeout are test-navigation limitations, not product findings. The parent reported a dialog fix during the run; the dialog was subsequently observed open, and no regression is inferred from that change. No source edits or app start/stop/restarts were made.

Commands and actual output:

```text
node scripts/ui-review/shot.mjs scratch/naming-ux-8.json scratch/naming-ux-8c
ok   midnight/assistant-settings (8 contrast fails)
1/1 shots verified.

node scripts/ui-review/shot.mjs scratch/naming-ux-10.json scratch/naming-ux-11
ok   midnight/ai-naming (8 contrast fails)
ok   midnight/rename-menu (7 contrast fails)
2/2 shots verified.

node scripts/ui-review/shot.mjs scratch/naming-ux-10.json scratch/naming-ux-12
ok   midnight/ai-naming (8 contrast fails)
MISS midnight/rename-menu — MISSING "[title='Biology revision']"; MISSING "Rename session…"; expect failed: js:document.body.textContent.includes('Rename')
1/2 shots verified.
```

The kit's contrast counts include background UI; they are not automatically findings against the naming surfaces. Refer to manifests in those output directories for the exact runs. The scratch plan `naming-ux-10.json` was edited for an intended retry after the last run but was not executed again because the parent stopped exploration; the manifests are the authoritative executed evidence.
