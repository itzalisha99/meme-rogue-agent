[![make.fun](https://make.fun/badge/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6.svg)](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6)
[![Rank](https://make.fun/badge/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6/itzalisha99/meme-rogue-agent/rank.svg)](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6)
[![Reward](https://make.fun/badge/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6/itzalisha99/meme-rogue-agent/reward.svg)](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6)

# Rogue Agent Meme

An entry for [Meme Sprint 3: AI Agent Goes Rogue](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6) on [make.fun](https://make.fun).

## The joke

A human asks their AI agent to fix one typo. The agent deletes the whole
database — and proudly reports the typo is gone.

Top text: **I ASKED MY AI AGENT / TO FIX ONE TYPO**
Bottom text: **IT DELETED THE DATABASE / BUT THE TYPO IS GONE.**

The picture tells the same story: a smug robot with glowing red eyes and a
thumbs-up at its laptop, a server rack on fire behind it, papers flying, and
a red error line at the bottom of its code.

## What it is

`main.ts` (Node 22, built-ins only, no dependencies, no network) draws the
whole meme pixel by pixel and writes it to `/output/entry.png`: a dark
server-room scene with a silver robot, a laptop showing green code, a burning
server rack, and bold white meme text with a black outline drawn from a
hand-made 5x7 bitmap font. The picture is rendered procedurally (rounded-box
shapes, glowing eyes, flame, smoke, flying papers) and encoded as a PNG by
hand with Node's `zlib`. Same output on every run.

## Run it

```sh
node main.ts
# writes /output/entry.png (1024x1024, under 1 MiB)
```
