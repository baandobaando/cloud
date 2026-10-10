import type { VideoPlayer } from 'expo-video'

/**
 * Makes sure only one episode is ever audible: the player that starts playing becomes the current one and every other
 * player is paused and muted.
 */
const players = new Set<VideoPlayer>()
let current: VideoPlayer | null = null

const quiet = (p: VideoPlayer) => {
  try {
    p.pause()
    p.muted = true
  } catch {
    // Already released.
  }
}

export function register(p: VideoPlayer) {
  players.add(p)
  return () => {
    quiet(p)
    players.delete(p)
    if (current === p) current = null
  }
}

/** Call right before playing: silences every other player. */
export function claim(p: VideoPlayer) {
  for (const other of players) if (other !== p) quiet(other)
  current = p
}

/** Silences one player (e.g. a page that is no longer on screen). */
export function silence(p: VideoPlayer) {
  quiet(p)
  if (current === p) current = null
}
