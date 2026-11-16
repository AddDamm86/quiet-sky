// Tests of the backdrop through the engine: the machine beneath is the test's own (a store, a session id, and a theme
// noun that records what it is asked). They cover: nothing is set while the store says off; the command turns it on
// with the glass and a scene named after this conversation's two planets, once; another conversation gets its own
// pair; off clears; an unknown word changes nothing; the Backdrop hook draws a scene for a desktop window and passes
// on a name that is not ours; and the pairs spread over all the planets while each scene fits the app's limit.

import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { ASTEROID_COUNT, KEEP_CLEAR, PLANET_NAMES, pairFor, quietSkySvg, roamOf, rocksFor, trackOf, withFreshAppear } from './scene'

/** The scene name a conversation gets: its planets, then its asteroids. */
const sceneFor = (conversation: string): string => `quiet-sky-${pairFor(conversation).join('-')}-${rocksFor(conversation).join('-')}`

const START = { cwd: 'C:/projects/demo', surface: 'desktop', isInteractive: true } as const
const GLASS = { blur: 0, tint: '#191919', opacity: 0.45 }

type World = { sets: { backdrop?: { scene?: string; id?: string; glass?: unknown } }[]; clears: number; logs: string[]; session: string }

function world(on: On, session = 'conversation-one'): World {
  const w: World = { sets: [], clears: 0, logs: [], session }
  // The theme noun is newer than the types some checkouts hold, so its two events are named loosely here.
  const loosely = on as unknown as (name: string, hook: (handle: unknown, e: never) => unknown) => void
  mock.store(on)
  on('session.id', () => ({ value: w.session }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('command.register', () => ({ value: { command: 'quiet-sky' } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', (_, e) => {
    w.logs.push(e.text)
    return { value: undefined }
  })
  loosely('theme.set', (_, e) => {
    w.sets.push(e)
    return { value: { isDrawn: true } }
  })
  loosely('theme.clear', () => {
    w.clears += 1
    return { value: undefined }
  })
  return w
}

test('off by default: a session start sets nothing', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  expect(w.sets.length).toBe(0)
  expect(w.clears).toBe(0)
  expect(w.logs).toEqual([])
})

test("the command turns it on once with this conversation's pair, an unknown word changes nothing, off clears", async ($, on) => {
  const w = world(on)
  const [upper, lower] = pairFor('conversation-one')
  await $.session.start(START)

  const turnedOn = await $.command.run({ command: 'quiet-sky', args: '' } as never)
  expect(turnedOn.text).toBe(`Quiet Sky is on. This conversation's planets: ${upper} and ${lower}.`)
  expect(w.sets.length).toBe(1)
  expect(w.sets[0]!.backdrop?.scene).toBe(sceneFor('conversation-one'))
  expect(w.sets[0]!.backdrop?.glass).toEqual(GLASS)

  const again = await $.command.run({ command: 'quiet-sky', args: 'on' } as never)
  expect(again.text).toBe(turnedOn.text)
  expect(w.sets.length).toBe(1)

  const unknown = await $.command.run({ command: 'quiet-sky', args: 'moon' } as never)
  expect(unknown.text).toBe('Try /quiet-sky or /quiet-sky off.')
  expect(w.sets.length).toBe(1)

  const off = await $.command.run({ command: 'quiet-sky', args: 'off' } as never)
  expect(off.text).toContain('Quiet Sky is off')
  expect(w.clears).toBe(1)
  expect(w.logs).toEqual([])
})

test('another conversation gets its own pair at its next turn', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  await $.command.run({ command: 'quiet-sky', args: '' } as never)

  // 'conversation-two' is checked below to hash to a different pair than 'conversation-one'
  w.session = 'conversation-two'
  await $.prompt.submit({ text: 'hello' } as never)
  expect(pairFor('conversation-two')).not.toEqual(pairFor('conversation-one'))
  expect(w.sets.length).toBe(2)
  expect(w.sets[1]!.backdrop?.scene).toBe(sceneFor('conversation-two'))
})

test('the Backdrop hook draws a scene for a desktop window and passes on a name that is not ours', async ($, on) => {
  world(on)
  const mount = (scene: string) => $.ui.mount({
    plugin: 'quiet-sky',
    component: 'Backdrop',
    surface: 'desktop',
    props: { plugin: 'quiet-sky', scene, id: scene, glass: GLASS },
  } as never)

  const ours = await mount('quiet-sky-earth-saturn-0-2')
  expect(await ours.find({ type: 'Svg' } as never)).toBeDefined()
  await ours.unmount()

  // not ours: a planet that is not in the list, the same asteroid twice, no asteroids at all
  for (const name of ['quiet-sky-earth-pluto-0-2', 'quiet-sky-earth-saturn-1-1', 'quiet-sky-earth-saturn']) {
    const other = await mount(name)
    expect(await other.find({ type: 'Svg' } as never)).toBe(undefined)
    await other.unmount()
  }
})

test('a conversation gets two different asteroids, the same every time, and every asteroid is used', () => {
  const used = new Set<number>()
  for (let at = 0; at < 200; at += 1) {
    const [first, second] = rocksFor(`local_${at.toString(16)}-conversation`)
    expect(first).not.toBe(second)
    for (const which of [first, second]) {
      expect(which).toBeGreaterThanOrEqual(0)
      expect(which).toBeLessThan(ASTEROID_COUNT)
      used.add(which)
    }
  }
  expect(rocksFor('abc')).toEqual(rocksFor('abc'))
  expect(used.size).toBe(ASTEROID_COUNT)
})

test('no asteroid ever enters the part kept clear, or sinks behind the prompt below it', () => {
  for (const which of [0, 1]) {
    const { points, reach } = roamOf(which)
    points.forEach(([fromX, fromY], at) => {
      const [toX, toY] = points[(at + 1) % points.length]!
      for (let step = 0; step <= 100; step += 1) {
        const x = fromX + ((toX - fromX) * step) / 100
        const y = fromY + ((toY - fromY) * step) / 100
        const isBesideTheBox = x + reach > KEEP_CLEAR.left && x - reach < KEEP_CLEAR.right
        // beside the box an asteroid must be wholly above it: under the box lies the prompt
        if (isBesideTheBox) expect(y + reach).toBeLessThan(KEEP_CLEAR.top)
        expect(y + reach).toBeLessThan(KEEP_CLEAR.bottom)
      }
    })
  }
})

test('pairs are two different planets, the same for the same conversation, and spread over all eight', () => {
  const seen = new Set<string>()
  const planets = new Set<string>()
  for (let at = 0; at < 400; at += 1) {
    const [upper, lower] = pairFor(`local_${at.toString(16)}-conversation`)
    expect(upper).not.toBe(lower)
    expect(PLANET_NAMES).toContain(upper)
    expect(PLANET_NAMES).toContain(lower)
    seen.add(`${upper}-${lower}`)
    planets.add(upper)
    planets.add(lower)
  }
  expect(pairFor('abc')).toEqual(pairFor('abc'))
  expect(planets.size).toBe(8)
  // 56 ordered pairs exist; 400 conversations should reach nearly all of them
  expect(seen.size).toBeGreaterThan(48)
})

test('no planet ever enters the part kept clear for the app\'s boxes, and the two places never touch', () => {
  const yAt = (track: ReturnType<typeof trackOf>, x: number): number =>
    track.from.y + ((track.to.y - track.from.y) * (x - track.from.x)) / (track.to.x - track.from.x)
  let highestOfLower = Infinity
  let lowestOfUpper = -Infinity
  for (const name of PLANET_NAMES) {
    for (const which of [0, 1]) {
      const track = trackOf(name, which)
      for (let x = Math.min(track.from.x, track.to.x); x <= Math.max(track.from.x, track.to.x); x += 10) {
        const y = yAt(track, x)
        const isBesideTheBox = x + track.reachAcross > KEEP_CLEAR.left && x - track.reachAcross < KEEP_CLEAR.right
        if (isBesideTheBox) expect(y + track.reachDown).toBeLessThan(KEEP_CLEAR.top)
        if (which === 0) lowestOfUpper = Math.max(lowestOfUpper, y + track.reachDown)
        else highestOfLower = Math.min(highestOfLower, y - track.reachDown)
      }
    }
  }
  expect(lowestOfUpper).toBeLessThan(highestOfLower)
})

test('a scene holds exactly its two planets, the Moon only with Earth, and fits the limit', () => {
  const withEarth = quietSkySvg(['earth', 'saturn'])
  const without = quietSkySvg(['mars', 'jupiter'])
  for (const source of [withEarth, without]) {
    // two asteroids and two planets
    expect(source.split('<g class="p ').length - 1).toBe(4)
    expect(source.split('<g class="p w').length - 1).toBe(2)
    expect(source).toContain('@keyframes roam0{')
    expect(source).toContain('@keyframes roam1{')
    expect(source).toContain('@keyframes drift0{')
    expect(source).toContain('@keyframes drift1{')
    expect(source.split('class="bob"').length - 1).toBeGreaterThan(1)
    // everything on the background is in the one group that starts unseen: the first 0.6 s of 3.6 s show the plain window
    expect(source).toContain(`<rect width="1600" height="1000" fill="#191919"/>\n<g class="in">`)
    expect(source).toContain('.in{animation:qs-appear 3.6s ease-in both}')
    expect(source).toContain('@keyframes qs-appear{0%,16.67%{opacity:0}100%{opacity:1}}')
    // for a window that joins, the same scene with a fade under a name of its own, and nothing else changed
    const fresh = withFreshAppear(source, 7)
    expect(fresh).toContain('.in{animation:qs-appear-7 3.6s ease-in both}')
    expect(fresh).toContain('@keyframes qs-appear-7{0%,16.67%{opacity:0}100%{opacity:1}}')
    expect(fresh.length).toBe(source.length + 2 * '-7'.length)
    expect(withFreshAppear(source, 8)).not.toBe(fresh)
    expect(source.length).toBeLessThan(131072)
  }
  expect(withEarth).toContain('<g class="mx" style="--across:104px;--deep:24px">')
  expect(without).not.toContain('class="mx"')
  expect(withEarth).toBe(quietSkySvg(['earth', 'saturn']))
})
