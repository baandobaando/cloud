import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, test } from 'node:test'
import { cleanTitle, guessGenres, parseEpisodeNumber, planEpisodes, signCdnUrl, type BunnyVideo } from './bunny.ts'

const video = (title: string, extra: Partial<BunnyVideo> = {}): BunnyVideo => ({
  guid: crypto.randomUUID(),
  title,
  length: 90,
  width: 1080,
  height: 1920,
  status: 4,
  dateUploaded: '2026-10-04T07:00:00',
  collectionId: 'c1',
  availableResolutions: '1080p',
  ...extra,
})

describe('parseEpisodeNumber', () => {
  test('reads the usual title shapes', () => {
    assert.equal(parseEpisodeNumber('after-my-ex-wife-had-me-sterilized ep62'), 62)
    assert.equal(parseEpisodeNumber('100-compatibility ep7'), 7)
    assert.equal(parseEpisodeNumber('Episode 012'), 12)
    assert.equal(parseEpisodeNumber('ep001.mp4'), 1)
    assert.equal(parseEpisodeNumber('Show E5'), 5)
    assert.equal(parseEpisodeNumber('no number here'), null)
  })

  test('does not mistake digits in the series name for the episode', () => {
    assert.equal(parseEpisodeNumber('365-nights-with-the-mafia-king ep3'), 3)
    assert.equal(parseEpisodeNumber('after-13-no-shows ep21'), 21)
  })
})

describe('planEpisodes', () => {
  test('orders by episode number, renumbers without gaps and reports missing ones', () => {
    const plan = planEpisodes([video('s ep3'), video('s ep1'), video('s ep10'), video('s ep2'), video('s ep5', { status: 3 })])
    assert.deepEqual(plan.episodes.map((e) => e.sourceNumber), [1, 2, 3, 10])
    assert.deepEqual(plan.episodes.map((e) => e.number), [1, 2, 3, 4])
    assert.deepEqual(plan.missing, [4, 5, 6, 7, 8, 9])
    assert.equal(plan.pending, 1)
  })

  test('keeps one video per episode, preferring the highest resolution', () => {
    const low = video('s ep1', { height: 720 })
    const high = video('s ep1', { height: 1920 })
    const plan = planEpisodes([low, high])
    assert.equal(plan.episodes.length, 1)
    assert.equal(plan.episodes[0].video.guid, high.guid)
  })
})

describe('titles and genres', () => {
  test('fixes all-caps collection names', () => {
    assert.equal(cleanTitle("A MOTHER'S WRATH"), "A Mother's Wrath")
    assert.equal(cleanTitle('  Accidental   Vows '), 'Accidental Vows')
  })

  test('guesses sensible genres', () => {
    assert.deepEqual(guessGenres('Accidentally Sexting the Mafia Don'), ['Mafia'])
    assert.ok(guessGenres('After I Remarried, My Wolf Men Brothers Went Mad').includes('Werewolf & Fantasy'))
    assert.deepEqual(guessGenres('Zzz'), ['Revenge'])
  })
})

describe('signCdnUrl', () => {
  const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  test('directory token (sha256) embeds the token in the path so HLS segments inherit it', () => {
    const url = signCdnUrl({ path: '/vid/playlist.m3u8', expires: 1800000000, tokenPath: '/vid/', key: 'k', mode: 'sha256', host: 'h.b-cdn.net' })
    const expected = b64url(crypto.createHash('sha256').update('k' + '/vid/' + '1800000000' + 'token_path=/vid/').digest())
    assert.equal(url, `https://h.b-cdn.net/bcdn_token=${expected}&token_path=%2Fvid%2F&expires=1800000000/vid/playlist.m3u8`)
  })

  test('file token (hmac) uses query parameters and the HS256 prefix', () => {
    const url = signCdnUrl({ path: '/vid/thumbnail.jpg', expires: 1800000000, key: 'k', mode: 'hmac', host: 'h.b-cdn.net' })
    const expected = 'HS256-' + b64url(crypto.createHmac('sha256', 'k').update('/vid/thumbnail.jpg' + '1800000000').digest())
    assert.equal(url, `https://h.b-cdn.net/vid/thumbnail.jpg?token=${expected}&expires=1800000000`)
  })
})
