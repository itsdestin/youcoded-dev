# Cache measurement (main chats; follow-up turns = turn index >= 1)
anthropic: main chats 10, turns 134, 2026-10-20..2026-11-02
chatgpt: main chats 156, turns 3044, 2026-09-05..2026-10-26
local: main chats 91, turns 261, 2026-07-14..2026-10-27
openrouter: main chats 208, turns 923, 2026-07-15..2026-10-28

## Follow-up turns by provider x era (and today = since 2026-09-30)
| provider | slice | turns | chats | hit turns | hit% | input from cache % | full-miss turns | miss% |
|---|---|---|---|---|---|---|---|---|
| chatgpt | pre | 205 | 27 | 193/205 | 94 | 79 | 116/205 | 57 |
| chatgpt | mid | 736 | 39 | 704/736 | 96 | 74 | 468/736 | 64 |
| chatgpt | post | 1949 | 77 | 1936/1949 | 99 | 99 | 103/1949 | 5 |
| chatgpt | today | 1683 | 69 | 1671/1683 | 99 | 99 | 91/1683 | 5 |
| openrouter | pre | 590 | 124 | 528/590 | 89 | 92 | 166/437 | 38 |
| openrouter | mid | 103 | 20 | 99/103 | 96 | 95 | 27/103 | 26 |
| openrouter | post | 29 | 7 | 28/29 | 97 | 96 | 16/29 | 55 |
| openrouter | today | 29 | 7 | 28/29 | 97 | 96 | 16/29 | 55 |
| local | pre | 144 | 48 | 21/144 | 15 | 84 | 3/22 | 14 |
| local | mid | 22 | 8 | 22/22 | 100 | 93 | 2/22 | 9 |
| local | post | 4 | 3 | 4/4 | 100 | 77 | 1/4 | 25 |
| local | today | 4 | 3 | 4/4 | 100 | 77 | 1/4 | 25 |
| anthropic | post | 124 | 6 | 123/124 | 99 | 99 | 11/124 | 9 |
| anthropic | today | 124 | 6 | 123/124 | 99 | 99 | 11/124 | 9 |

## Events, post-fix era (>= 2026-09-25), follow-up turns
| provider | event | turns | full-miss | miss% | input from cache % |
|---|---|---|---|---|---|
| chatgpt | model switch | 3 | 3/3 | 100 | 72 |
| chatgpt | after compaction/clear | 21 | 2/21 | 10 | 99 |
| chatgpt | expectedRebuild flag | 22 | 6/22 | 27 | 99 |
| chatgpt | first turn after app launch (since 10-20) | 19 | 7/19 | 37 | 95 |
| chatgpt | no app launch between (since 10-20) | 515 | 14/515 | 3 | 99 |
| chatgpt | gap <5m, no other event | 1477 | 46/1477 | 3 | 99 |
| chatgpt | gap 5-60m, no other event | 372 | 21/372 | 6 | 99 |
| chatgpt | gap >1h, no other event | 56 | 23/56 | 41 | 97 |
| openrouter | model switch | 1 | 1/1 | 100 | 69 |
| openrouter | after compaction/clear | 2 | 1/2 | 50 | 95 |
| openrouter | expectedRebuild flag | 3 | 2/3 | 67 | 95 |
| openrouter | no app launch between (since 10-20) | 23 | 12/23 | 52 | 96 |
| openrouter | gap <5m, no other event | 16 | 6/16 | 38 | 97 |
| openrouter | gap 5-60m, no other event | 9 | 7/9 | 78 | 94 |
| openrouter | gap >1h, no other event | 1 | 1/1 | 100 | 94 |
| local | no app launch between (since 10-20) | 1 | 0/1 | 0 | 100 |
| local | gap <5m, no other event | 4 | 1/4 | 25 | 77 |
| anthropic | model switch | 1 | 1/1 | 100 | 0 |
| anthropic | after compaction/clear | 2 | 0/2 | 0 | 99 |
| anthropic | expectedRebuild flag | 5 | 2/5 | 40 | 99 |
| anthropic | first turn after app launch (since 10-20) | 2 | 1/2 | 50 | 92 |
| anthropic | no app launch between (since 10-20) | 114 | 8/114 | 7 | 99 |
| anthropic | gap <5m, no other event | 81 | 1/81 | 1 | 100 |
| anthropic | gap 5-60m, no other event | 28 | 0/28 | 0 | 100 |
| anthropic | gap >1h, no other event | 8 | 7/8 | 88 | 92 |

## OpenRouter per model, post era, follow-up turns (models with >= 10 follow-ups)
| model | turns | chats | turns with any cache read | input from cache % | full-miss | unexplained full-miss (gap<5m, same model, no event) | per-100 unexplained excess tokens |
|---|---|---|---|---|---|---|---|
| ~deepseek/deepseek-flash-latest | 24 | 2 | 24/24 | 96 | 12/24 | 3/12 | 2754367 |

## Unexplained full misses per provider (post era): same model, no compaction/rebuild/launch, gap under provider TTL
| provider | eligible follow-ups | unexplained full misses | rate | extra full-price input tokens per 100 follow-ups | median prevCtx of those |
|---|---|---|---|---|---|
| chatgpt | 1796 | 63 | 4% | 1012736 | 238434 |
| openrouter | 16 | 6 | 38% | 2472697 | 123589 |
| local | 4 | 1 | 25% | 295450 | 10894 |
| anthropic | 81 | 1 | 1% | 249131 | 309721 |

## Turns reporting zero cache read (all eras, follow-ups with I>=4096)
chatgpt: 57/2890 zero-read; with write>0: 0
openrouter: 48/695 zero-read; with write>0: 38
local: 1/48 zero-read; with write>0: 0
anthropic: 1/124 zero-read; with write>0: 123
OpenRouter post-era models whose follow-ups never reported a cache read: []

Specialist child sessions: 1206 sessions, 2605 turns, of which follow-ups 1399; first-turn input from cache %: 88
  chatgpt specialist first turns (post): 652, input from cache 96%
  openrouter specialist first turns (post): 24, input from cache 95%

## OpenRouter since #464 reached the app (2026-09-11), follow-ups
| event | turns | chats | full-miss | miss% | input from cache % |
|---|---|---|---|---|---|
| all follow-ups | 132 | 27 | 43/132 | 33 | 95 |
| model switch | 2 | 2 | 2/2 | 100 | 34 |
| after compaction/clear | 7 | 5 | 4/7 | 57 | 91 |
| expectedRebuild flag | 12 | 9 | 9/12 | 75 | 92 |
| turn that ran a helper (Task), no other event | 8 | 2 | 1/8 | 12 | 98 |
| turn without helper, no other event, gap<5m | 81 | 23 | 15/81 | 19 | 96 |
| gap <5m, no other event | 89 | 24 | 16/89 | 18 | 97 |
| gap 5-60m, no other event | 25 | 12 | 15/25 | 60 | 92 |
| gap >1h, no other event | 5 | 5 | 3/5 | 60 | 91 |

## OpenRouter BEFORE #464 (no session_id, no Anthropic markers), follow-ups
| event | turns | chats | full-miss | miss% | input from cache % |
|---|---|---|---|---|---|
| all follow-ups | 590 | 124 | 166/437 | 38 | 92 |
| model switch | 16 | 15 | 8/11 | 73 | 83 |
| after compaction/clear | 2 | 1 | 1/2 | 50 | 85 |
| turn that ran a helper (Task), no other event | 19 | 11 | 7/19 | 37 | 91 |
| turn without helper, no other event, gap<5m | 427 | 113 | 95/309 | 31 | 94 |
| gap <5m, no other event | 446 | 114 | 102/328 | 31 | 94 |
| gap 5-60m, no other event | 93 | 49 | 38/72 | 53 | 90 |
| gap >1h, no other event | 34 | 27 | 17/25 | 68 | 82 |

## ChatGPT post era (>= 2026-09-25), follow-ups
| event | turns | chats | full-miss | miss% | input from cache % |
|---|---|---|---|---|---|
| all follow-ups | 1949 | 77 | 103/1949 | 5 | 99 |
| model switch | 3 | 3 | 3/3 | 100 | 72 |
| after compaction/clear | 21 | 11 | 2/21 | 10 | 99 |
| expectedRebuild flag | 22 | 14 | 6/22 | 27 | 99 |
| first turn after app launch, gap<30m | 5 | 3 | 1/5 | 20 | 93 |
| first turn after app launch, gap>=30m | 14 | 6 | 6/14 | 43 | 95 |
| turn that ran a helper (Task), no other event | 492 | 45 | 32/492 | 7 | 99 |
| turn without helper, no other event, gap<5m | 985 | 76 | 14/985 | 1 | 99 |
| gap <5m, no other event | 1477 | 76 | 46/1477 | 3 | 99 |
| gap 5-60m, no other event | 372 | 47 | 21/372 | 6 | 99 |
| gap >1h, no other event | 56 | 25 | 23/56 | 41 | 97 |

## Anthropic (direct, custom provider) all, follow-ups
| event | turns | chats | full-miss | miss% | input from cache % |
|---|---|---|---|---|---|
| all follow-ups | 124 | 6 | 11/124 | 9 | 99 |
| model switch | 1 | 1 | 1/1 | 100 | 0 |
| after compaction/clear | 2 | 2 | 0/2 | 0 | 99 |
| expectedRebuild flag | 5 | 3 | 2/5 | 40 | 99 |
| first turn after app launch, gap>=30m | 2 | 2 | 1/2 | 50 | 92 |
| turn that ran a helper (Task), no other event | 8 | 3 | 1/8 | 12 | 99 |
| turn without helper, no other event, gap<5m | 73 | 6 | 0/73 | 0 | 100 |
| gap <5m, no other event | 81 | 6 | 1/81 | 1 | 100 |
| gap 5-60m, no other event | 28 | 4 | 0/28 | 0 | 100 |
| gap >1h, no other event | 8 | 4 | 7/8 | 88 | 92 |

## Local since 2026-09-11 (cache_n recorded), follow-ups
| event | turns | chats | full-miss | miss% | input from cache % |
|---|---|---|---|---|---|
| all follow-ups | 26 | 11 | 3/26 | 12 | 91 |
| turn without helper, no other event, gap<5m | 25 | 10 | 3/25 | 12 | 91 |
| gap <5m, no other event | 25 | 10 | 3/25 | 12 | 91 |
| gap 5-60m, no other event | 1 | 1 | 0/1 | 0 | 91 |

## OpenRouter per model, since 2026-09-11 vs before (follow-ups)
| model | slice | turns | chats | any cache read | input from cache % | full-miss | unexplained miss (gap<5m, same model, no event) |
|---|---|---|---|---|---|---|---|
| ~deepseek/deepseek-flash-latest | since 09-11 | 47 | 7 | 47/47 | 96 | 20/47 | 8/30 |
| ~openai/gpt-sol-latest | since 09-11 | 21 | 2 | 21/21 | 99 | 1/21 | 0/20 |
| deepseek/deepseek-v4.1-flash | since 09-11 | 19 | 3 | 19/19 | 94 | 7/19 | 2/9 |
| ~z-ai/glm-flash-latest | since 09-11 | 12 | 2 | 9/12 | 79 | 6/12 | 3/8 |
| ~deepseek/deepseek-v4-flash-latest | since 09-11 | 11 | 3 | 11/11 | 95 | 3/11 | 0/8 |
| ~openai/gpt-terra-latest | since 09-11 | 8 | 1 | 8/8 | 94 | 1/8 | 0/5 |
| ~deepseek/deepseek-v4-flash-latest | before | 219 | 49 | 207/219 | 90 | 100/191 | 57/131 |
| moonshotai/kimi-k3 | before | 115 | 27 | 113/115 | 96 | 12/45 | 7/33 |
| openai/gpt-6-astra | before | 35 | 7 | 34/35 | 98 | 2/35 | 0/30 |
| openai/gpt-5.6-luna | before | 27 | 11 | 25/27 | 96 | 2/21 | 0/17 |
| google/gemini-3.7-flash | before | 27 | 2 | 25/27 | 93 | 11/26 | 10/22 |
| openai/gpt-5.6-terra | before | 26 | 4 | 26/26 | 98 | 4/26 | 2/22 |
| stealth/ox-alpha | before | 22 | 3 | 16/22 | 84 | 7/18 | 5/15 |
| openai/gpt-5.6-sol | before | 16 | 6 | 11/16 | 97 | 1/11 | 0/10 |
| qwen/qwen3.8-max | before | 16 | 6 | 16/16 | 92 | 6/14 | 4/12 |
| x-ai/grok-4.5 | before | 14 | 2 | 14/14 | 73 | 0/0 | 0/0 |
| openai/gpt-3.5-turbo | before | 12 | 2 | 0/12 | 0 | 0/0 | 0/0 |
| z-ai/glm-5.2 | before | 12 | 5 | 12/12 | 93 | 3/9 | 3/8 |
| deepseek/deepseek-v4.1-flash | before | 12 | 2 | 12/12 | 96 | 2/12 | 1/7 |
| qwen/qwen3.8-27b | before | 11 | 1 | 0/11 | 0 | 11/11 | 0/0 |
| x-ai/grok-4.6 | before | 11 | 1 | 11/11 | 97 | 1/11 | 0/5 |

Models with follow-ups but never any cache read (excluded from unexplained counts): [('openrouter', 'anthropic/claude-opus-4.8'), ('openrouter', 'openai/gpt-3.5-turbo'), ('openrouter', 'qwen/qwen3.6-35b-a3b'), ('openrouter', 'qwen/qwen3.8-27b')]

## Cost of unexplained full misses (extra full-price input tokens), per 100 follow-ups
| provider | slice | follow-ups | eligible (detector usable, no explaining event) | unexplained misses | rate | extra full-price tokens / 100 follow-ups | same, as % of all input |
|---|---|---|---|---|---|---|---|
| chatgpt | post | 1949 | 1796 | 63 | 4% | 1,012,736 | 0.2% |
| openrouter | since 09-11 | 132 | 89 | 16 | 18% | 3,747,919 | 1.6% |
| openrouter | before 09-11 | 590 | 315 | 89 | 28% | 4,020,267 | 3.4% |
| anthropic | all | 124 | 81 | 1 | 1% | 249,131 | 0.0% |
| local | since 09-11 | 26 | 26 | 3 | 12% | 206,919 | 4.0% |

## ChatGPT request-level diagnostics (private-diagnostics/chatgpt-cache/requests*.jsonl)
records 11414, 2026-09-28..2026-10-17
| era | purpose | prefix change vs previous request in lane | requests | miss (<50% cached) | miss% | input from cache % |
|---|---|---|---|---|---|---|
| post | chat | ALL | 6182 | 68 | 1 | 99 |
| post | chat | append | 6117 | 32 | 1 | 99 |
| post | chat | baseline (new lane) | 31 | 30 | 97 | 0 |
| post | chat | edit | 5 | 4 | 80 | 18 |
| post | chat | identical | 28 | 2 | 7 | 98 |
| post | specialist | ALL | 5060 | 355 | 7 | 96 |
| post | specialist | append | 4802 | 149 | 3 | 98 |
| post | specialist | baseline (new lane) | 127 | 123 | 97 | 1 |
| post | specialist | edit | 125 | 82 | 66 | 40 |
| post | specialist | identical | 6 | 1 | 17 | 95 |
| post | summary | ALL | 5 | 0 | 0 | 100 |
| post | summary | baseline (new lane) | 4 | 0 | 0 | 100 |
