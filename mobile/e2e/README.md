# Real-iPhone smoke test (BrowserStack)

Drives the app on a real iPhone: home, series page, playing an episode, player controls (skip, mute), the episode
picker, swiping to the next episode, double-tap skip and closing the player. Saves screenshots to `e2e/shots/` and
records a video in the BrowserStack dashboard.

```bash
cd mobile/e2e
npm i webdriverio@9
# Upload a build (the .ipa from EAS) once; later runs use the custom id "bingetube":
curl -u "$BROWSERSTACK_USERNAME:$BROWSERSTACK_ACCESS_KEY" -X POST https://api-cloud.browserstack.com/app-automate/upload -F file=@BingeTube.ipa -F custom_id=bingetube
BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=… node smoke.mjs
```

Options: `DEVICE` (default iPhone 15), `OS` (default 17), `APP` (default `bingetube`), `NAME` (session name).
