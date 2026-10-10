import { remote } from 'webdriverio'
import fs from 'node:fs'
// Real-iPhone smoke test on BrowserStack App Automate. See README.md in this folder.
const user = process.env.BROWSERSTACK_USERNAME, key = process.env.BROWSERSTACK_ACCESS_KEY
if (!user || !key) throw new Error('Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY')
const out = new URL('./shots/', import.meta.url).pathname; fs.mkdirSync(out, { recursive: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const driver = await remote({
  protocol: 'https', hostname: 'hub-cloud.browserstack.com', port: 443, path: '/wd/hub', logLevel: 'error',
  capabilities: {
    platformName: 'ios',
    'appium:app': process.env.APP || 'bingetube',
    'appium:deviceName': process.env.DEVICE || 'iPhone 15',
    'appium:platformVersion': process.env.OS || '17',
    'appium:automationName': 'XCUITest',
    'appium:autoAcceptAlerts': true,
    'bstack:options': { userName: user, accessKey: key, projectName: 'BingeTube', buildName: 'App smoke test', sessionName: process.env.NAME || 'smoke', video: true, networkLogs: true, appiumVersion: '2.6.0' },
  },
})
let n = 0
const shot = async (name) => { const f = `${out}${String(++n).padStart(2, '0')}-${name}.png`; fs.writeFileSync(f, Buffer.from(await driver.takeScreenshot(), 'base64')); log('shot', name) }
const tap = async (label, timeout = 15000) => { const el = await driver.$(`-ios predicate string:label == "${label}" OR name == "${label}"`); await el.waitForExist({ timeout }); await el.click(); log('tap', label) }
const tapContains = async (text, timeout = 15000) => { const el = await driver.$(`-ios predicate string:label CONTAINS "${text}"`); await el.waitForExist({ timeout }); await el.click(); log('tap~', text) }
const { width, height } = await driver.getWindowSize()
const swipeUp = () => driver.action('pointer', { parameters: { pointerType: 'touch' } }).move({ x: Math.round(width / 2), y: Math.round(height * 0.8) }).down().pause(80).move({ duration: 250, x: Math.round(width / 2), y: Math.round(height * 0.2) }).up().perform()
const tapAt = (x, y) => driver.action('pointer', { parameters: { pointerType: 'touch' } }).move({ x: Math.round(x), y: Math.round(y) }).down().pause(60).up().perform()
const step = async (name, fn) => { try { await fn(); return true } catch (e) { log('STEP FAILED', name, e.message.split('\n')[0]); await shot(`fail-${name}`).catch(() => {}); return false } }

try {
  await driver.pause(6000); await shot('home')
  await step('open-series', async () => { await tapContains('Info'); await driver.pause(3500); await shot('series') })
  await step('play', async () => { await tapContains('Play episode'); await driver.pause(10000); await shot('watch-playing-1') ; await driver.pause(5000); await shot('watch-playing-2') })
  await step('controls', async () => { await tapAt(width / 2, height * 0.45); await driver.pause(800); await shot('watch-controls') })
  await step('skip-forward', async () => { await tap('Forward 10 seconds', 4000); await driver.pause(800); await shot('watch-after-skip') })
  await step('mute', async () => { await tapAt(width / 2, height * 0.45); await driver.pause(600); await tap('Mute', 4000); await driver.pause(600); await shot('watch-muted'); await tap('Unmute', 4000) })
  await step('episodes-sheet', async () => { await tapAt(width / 2, height * 0.45); await driver.pause(600); await tapContains('Episodes', 4000); await driver.pause(1500); await shot('episodes-sheet'); await tapContains('Episode 3', 5000); await driver.pause(8000); await shot('watch-ep3') })
  await step('swipe-next', async () => { await swipeUp(); await driver.pause(8000); await shot('watch-after-swipe') })
  await step('double-tap-skip', async () => { await tapAt(width * 0.85, height * 0.45); await driver.pause(120); await tapAt(width * 0.85, height * 0.45); await driver.pause(300); await shot('watch-double-tap') })
  await step('close-player', async () => { await tapAt(width / 2, height * 0.45); await driver.pause(600); await tap('Close player', 4000); await driver.pause(2000); await shot('back-to-series') })
} finally {
  log('session', driver.sessionId)
  await driver.deleteSession()
}
