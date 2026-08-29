// A tient la camera ; B peut-il l ouvrir en meme temps ?
const { chromium } = require('playwright');
(async () => {
  const eA = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const eB = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const pA = eA.contexts()[0].pages().find((x) => /salorie\.com/.test(x.url()));
  const pB = eB.contexts()[0].pages().find((x) => /salorie\.com/.test(x.url()));

  const prise = await pA.evaluate(async () => {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); window.__flux = s; return 'A tient la camera'; }
    catch (e) { return 'A echoue : ' + e.name; }
  });
  console.log('  ' + prise);
  const b = await pB.evaluate(async () => {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); return 'B obtient AUSSI la camera'; }
    catch (e) { return 'B ECHOUE : ' + e.name + ' — ' + e.message.slice(0, 70); }
  });
  console.log('  ' + b);
  await pA.evaluate(() => { window.__flux?.getTracks().forEach((t) => t.stop()); });
  await eA.close(); await eB.close();
})();
