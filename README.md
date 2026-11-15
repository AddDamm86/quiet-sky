# Quiet Sky

A deep-space backdrop behind the chat in the Claude desktop app: stars on the app's default dark background (`#191919`), and two of the eight planets as small ASCII globes that float in place, bobbing, and drift almost imperceptibly. Two asteroids roam freely behind them. Each conversation gets its own two planets and two asteroids and keeps them. Earth carries the Moon on a 16-second orbit. A few stars dip now and then, and a shooting star passes about every half minute.

## Install

It needs a version of the Claude desktop app that draws a plugin's backdrop behind the chat (built and tested against Claude Code engine 2.1.325). Clone it into your skills folder, where Claude Code loads plugins from:

```bash
git clone https://github.com/AddDamm86/quiet-sky "$HOME/.claude/skills/quiet-sky"
```

Then type `/reload-plugins` in a session, or open a new one.

## Use

- `/quiet-sky` turns it on, for every project, and names this conversation's two planets.
- `/quiet-sky off` clears it.

A new session starts with the saved choice. A session that is already open takes a change made elsewhere at its next turn.

## How it is built

- `hooks/scene.ts` builds the whole scene as one SVG string (up to about 46,000 characters; the app's limit is 131,072). No scripts: the motion is CSS animation.
- The planets are drawn on a fine grid of 4 by 6 cells in a 7-pixel font, so Jupiter is about 40 characters wide. Surface detail comes from layered noise mapped onto the globe, and every character is one Consolas has itself.
- The two planets come from the conversation's id (`pairFor`): the same conversation always gets the same two, and nothing is stored for it. There are 56 ordered pairs.
- The planets idle. Both rest in the upper half of the sky, the first higher than the second, and neither ever enters the lower middle, where the app shows its boxes with a question and buttons (`KEEP_CLEAR` in `scene.ts`, with a test). Each bobs up and down and tilts a little from side to side, a large planet more slowly than a small one, and drifts along its own fixed heading so slowly that it takes two hours to cross the scene. Past one edge it comes back in at the other.
- Two of four asteroids, also picked from the conversation's id, roam freely on closed paths: round the upper sky, across the planets' bands (they pass behind a planet) and down both sides. They too never enter the part kept clear, and stay above the prompt.
- When the system asks for reduced motion, everything stops and the planets and asteroids rest in their places.
- `hooks/register.tsx` registers the command, sets or clears the backdrop, and hands the scene to the app when it asks to draw the backdrop.
- The glass over the scene has no blur and a 45% tint of the background colour, so the artwork stays sharp behind the chat.

Something is always moving in this scene, so the window is redrawn all the time while it is on.

## What it stores

One value in the plugin's store: whether it is on. It reads the session's id to pick the planets, reads nothing of your prompts or replies, and sends nothing anywhere.

## Remove

`claude plugin disable quiet-sky@skills-dir` turns it off; deleting this folder removes it.

## License

MIT. The full text is in the LICENSE file beside this one.

## Checks

Run them with the desktop app's own engine binary, which is newer than `claude` on PATH and knows backdrops:
`<app engine> plugin validate .` and `<app engine> plugin test .`
