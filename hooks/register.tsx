// Quiet Sky: a backdrop behind the chat in the Claude desktop app.
//
// /quiet-sky       turns it on, for every project
// /quiet-sky off   clears it
//
// The choice is kept in the plugin's store, so a new session starts with it, and a session that is already open
// takes a change made elsewhere at its next turn. The scene itself is built in scene.ts.

import type { EngineInterface, Register } from 'claude-code'

import { ASTEROID_COUNT, GLASS, PLANET_NAMES, pairFor, quietSkySvg, rocksFor, withFreshAppear } from './scene'
import type { PlanetPair } from './scene'

const PLUGIN = 'quiet-sky'
const COMMAND = 'quiet-sky'
// A scene's name is this, its two planets and its two asteroids: quiet-sky-earth-saturn-0-2. The app hands the name back when it asks for the backdrop to be drawn.
const SCENE_PREFIX = 'quiet-sky-'
/** What a scene's name holds: the conversation's two planets and its two asteroids. */
type Sky = { pair: PlanetPair; rocks: readonly [number, number] }
const ON_KEY = 'on'

/** What a set comes to: whether any window says it draws the backdrop. */
type BackdropAnswer = { isDrawn: boolean }
type Backdrop = { id: string; glass: typeof GLASS }
/** The engines this mod may meet, for the type checker alone: the theme noun or the older call may be absent. */
type AnyEngine = {
  theme?: { set(args: unknown): Promise<BackdropAnswer>; clear(): Promise<unknown> }
  ui: { toast: EngineInterface['ui']['toast']; backdrop?(args: Backdrop | undefined): Promise<BackdropAnswer> }
}

// The scene this session has set, by name. It starts over on a reload; session.start then sets it again.
let shown: string | undefined
// How many times a window has joined this session. Each join gets the scene with a coming-in animation of its own,
// so the fade starts over on every switch to the session and not on a redraw for a resized window.
let joins = 0
const built = new Map<string, string>()

/** The sky a scene's name holds, or nothing where the name is not one of ours. */
function skyOfScene(name: string | undefined): Sky | undefined {
  if (name === undefined || !name.startsWith(SCENE_PREFIX)) return undefined
  const [first, second, third, fourth, ...rest] = name.slice(SCENE_PREFIX.length).split('-')
  const upper = PLANET_NAMES.find(planet => planet === first)
  const lower = PLANET_NAMES.find(planet => planet === second)
  const rockA = Number(third)
  const rockB = Number(fourth)
  const isRock = (which: number): boolean => Number.isInteger(which) && which >= 0 && which < ASTEROID_COUNT

  if (upper === undefined || lower === undefined || rest.length > 0) return undefined
  if (third === undefined || fourth === undefined || !isRock(rockA) || !isRock(rockB) || rockA === rockB) return undefined

  return { pair: [upper, lower], rocks: [rockA, rockB] }
}

function sceneOf(name: string, sky: Sky): string {
  const ready = built.get(name)
  if (ready !== undefined) return ready
  const source = quietSkySvg(sky.pair, sky.rocks)
  built.set(name, source)

  return source
}

/** The name of this conversation's scene: its planets and asteroids come from the session's id, so they stay the same for the whole conversation. */
async function sceneName($: EngineInterface): Promise<string> {
  let conversation = ''
  try {
    conversation = (await $.session.id()) ?? ''
  } catch {
    // An engine that gives no id: every conversation then shares one pair.
  }

  return `${SCENE_PREFIX}${pairFor(conversation).join('-')}-${rocksFor(conversation).join('-')}`
}

/**
 * Whether a failed call means "this engine has no such call or shape", so the next way may be tried.
 * Reaching for a call the engine lacks throws a TypeError; a shape it does not know it refuses by name.
 */
function isNotThisEnginesWay(error: unknown, member?: string): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.message.includes('does not know the attribute') || (member !== undefined && error.message.includes(member))))
  )
}

/**
 * Sets the backdrop by whichever call this engine has, the newest first: the theme noun with the window's kind beside
 * the backdrop, the theme noun with it inside, or the older call on the ui noun. Each call is made on the spot inside
 * its own try: the engine loads a module only where calls on its handle are made directly, never read or passed.
 */
async function setBackdrop($: AnyEngine, backdrop: Backdrop): Promise<BackdropAnswer> {
  try {
    return await $.theme!.set({
      backdrop: { scene: backdrop.id, id: backdrop.id, glass: backdrop.glass },
      overrideColorScheme: 'dark',
    })
  } catch (error) {
    if (!isNotThisEnginesWay(error, 'overrideColorScheme')) throw error
  }

  try {
    return await $.theme!.set({ backdrop: { id: backdrop.id, glass: backdrop.glass, colorScheme: 'dark' } })
  } catch (error) {
    if (!isNotThisEnginesWay(error)) throw error
  }

  try {
    return await $.ui.backdrop!({ id: backdrop.id, glass: backdrop.glass })
  } catch (error) {
    if (!isNotThisEnginesWay(error)) throw error
  }

  return { isDrawn: false }
}

/** Clears the session's backdrop, whichever mod set it: called only on the person's ask or to take our own away. */
async function clearBackdrop($: AnyEngine): Promise<void> {
  try {
    await $.theme!.clear()

    return
  } catch (error) {
    if (!isNotThisEnginesWay(error)) throw error
  }

  try {
    await $.ui.backdrop!(undefined)
  } catch (error) {
    if (!isNotThisEnginesWay(error)) throw error
  }
}

/**
 * Brings this session's window to what the store says. Nothing is asked of the engine where the window already
 * agrees, and a clear is made only over a backdrop this session set itself, so another mod's theme is left alone.
 */
async function follow($: EngineInterface): Promise<BackdropAnswer | undefined> {
  const isOn = (await $.store.get(ON_KEY)) === true
  const wanted = isOn ? await sceneName($) : undefined

  if (wanted === shown) return undefined

  if (wanted === undefined) {
    await clearBackdrop($)
    shown = undefined

    return undefined
  }

  // Built before the app is told of it: when the app then asks for the drawing, the answer is ready and the
  // backdrop is on screen as early as the app allows.
  const sky = skyOfScene(wanted)
  if (sky !== undefined) sceneOf(wanted, sky)

  const set = await setBackdrop($, { id: wanted, glass: GLASS })
  shown = wanted

  return set
}

/** Runs a step that must never cost a person their start or their prompt: a fault is told in one dim line of the transcript. */
async function quietly($: EngineInterface, step: () => Promise<unknown>): Promise<void> {
  try {
    await step()
  } catch (error) {
    try {
      await $.ui.log(`the backdrop could not be set (${error instanceof Error ? error.message : String(error)})`)
    } catch {
      // An engine without that call: nothing more to tell.
    }
  }
}

async function run($: EngineInterface, args: string): Promise<string> {
  const word = args.trim().toLowerCase()

  if (word === 'off') {
    await $.store.set(ON_KEY, false)
    // Asked for by the person, so the clear is made even where this session never set the backdrop itself.
    await clearBackdrop($)
    shown = undefined

    return 'Quiet Sky is off. Other open sessions clear at their next turn.'
  }

  if (word !== '' && word !== 'on') {
    return `Try /${COMMAND} or /${COMMAND} off.`
  }

  await $.store.set(ON_KEY, true)

  const set = await follow($)
  const sky = skyOfScene(shown)
  const said = sky === undefined ? 'Quiet Sky is on.' : `Quiet Sky is on. This conversation's planets: ${sky.pair.join(' and ')}.`

  return set?.isDrawn === false ? `${said} If nothing shows, this window may not draw backdrops yet.` : said
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Stars and two wandering ASCII planets behind the chat, a different pair in each conversation: alone it turns the backdrop on; "off" clears it.',
      })
    } catch (error) {
      void $.ui.toast(`quiet-sky: /${COMMAND} is not available (${String(error)})`)
    }

    await quietly($, () => follow($))

    return next(e)
  })

  // A turn's start: an open session takes a change made in another session.
  on('prompt.submit', async ($, e, next) => {
    await quietly($, () => follow($))

    return next(e)
  })

  // A window joins the session (someone switches to it): the app asks for the backdrop right after (about 30 ms,
  // measured 2026-11-16) and gets the scene with a fade of its own for this join.
  on('session.attach', (_, e, next) => {
    joins += 1

    return next(e)
  })

  // The theme itself is not set again when a window joins: the engine keeps the session's theme
  // and a window that attaches later draws it by itself. Setting it again on `session.attach` was tried (2026-11-16) and
  // did not make the backdrop appear any sooner.

  on('command.run', { command: COMMAND }, async ($, e) => {
    try {
      return { text: await run($, e.args ?? '') }
    } catch (error) {
      return { text: `Quiet Sky could not be changed: ${error instanceof Error ? error.message : String(error)}` }
    }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    // Only a desktop window has room behind the chat, and only its table has `Svg`.
    if (e.props.plugin !== PLUGIN || e.surface !== 'desktop') {
      return next(e)
    }

    const props: { scene?: unknown; id?: unknown } = e.props
    // The scene's name comes under `scene` on the newest engines and under `id` on the ones before them.
    const name = typeof props.scene === 'string' ? props.scene : typeof props.id === 'string' ? props.id : undefined

    const sky = skyOfScene(name)

    if (name === undefined || sky === undefined) {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    return <Svg isInteractive alt={`Quiet Sky: stars on a dark background, with ${sky.pair.join(' and ')} as small ASCII planets and two asteroids`} source={withFreshAppear(sceneOf(name, sky), joins)} />
  })
}
