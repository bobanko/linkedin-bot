const puppeteer = require("puppeteer");
const logUpdate = require("log-update");

const credentials = require("./credentials");

function delay(time = 1000) {
  return new Promise(resolve => setTimeout(resolve, time));
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log("🌐 browser launched");

  await page.setViewport({ width: 1280, height: 800 });

  const navigationPromise = page.waitForNavigation();

  await page.goto("https://www.linkedin.com/uas/login");

  console.log("🔐 log in...");

  await page.waitForSelector(".login__form");
  await page.type(".login__form #username", credentials.username);
  await page.type(".login__form #password", credentials.password);
  await page.click("button[type=submit]");

  await navigationPromise;

  await page.waitForSelector(".profile-rail-card__member-photo");

  console.log("🔑 logged in");

  await page.goto("https://www.linkedin.com/mynetwork/");

  const inviteButtonSelector = '[data-control-name="invite"]';
  await page.waitForSelector(inviteButtonSelector);

  console.log("👥 /network/ page ready");

  // ACCEPT INVITATIONS
  let accepted = 0;
  const acceptInviteButtonSelector = '[data-control-name="accept"]';

  while (await page.$(acceptInviteButtonSelector)) {
    page.click(acceptInviteButtonSelector);
    // todo: add total available
    logUpdate(
      "\naccepting incoming invitations",
      `\n💛 invitations accepted: ${++accepted}`
    );
    await delay();
  }

  console.log("");

  // SEND INVITATIONS
  let friends = 0;
  let tries = 0;
  let fails = 0;
  let scrolls = 0;
  let lastHTTPCodes = [];

  const invtationLink =
    "https://www.linkedin.com/voyager/api/growth/normInvitations";

  page.on("request", request => {
    if (request.resourceType() === "xhr") {
      if (request.url() === invtationLink) {
        tries++;
        logStats();
      }
    }
  });

  function logStats() {
    logUpdate(
      `\nStats:`,
      `\n👥 friend request sent ${tries}`,
      `\n💚 friended: ${friends}`,
      `\n💔 failed: ${fails}`,
      `\n⬇️  scrolled: ${scrolls}`,
      `\n🌐 last HTTP codes: ${lastHTTPCodes.slice(-3)}`
    );
  }

  function codeIsOk(code) {
    return /2\d{2}/.test(code);
  }

  page.on("response", response => {
    if (response.request().resourceType() === "xhr") {
      if (response.request().url() === invtationLink) {
        // check status code to match 2xx
        if (codeIsOk(response.status())) {
          friends++;
        } else {
          fails++;
        }
        lastHTTPCodes.push(response.status());

        if (lastHTTPCodes.length > 20) {
          lastHTTPCodes.shift();
        }

        logStats();
      }
    }
  });

  while (lastHTTPCodes.filter(c => !codeIsOk(c)).length < 10) {
    await page.waitForSelector(inviteButtonSelector);

    page.click(inviteButtonSelector);

    // https://www.linkedin.com/voyager/api/growth/normInvitations

    page
      .evaluate(() => {
        const html = document.querySelector("html");

        if (html.scrollHeight < 2000) {
          html.scrollTop = html.scrollHeight;
          return true;
        }
      })
      .then(isScrolled => {
        if (isScrolled) {
          scrolls++;
          logUpdate();
        }
      });

    await delay();
  }

  await browser.close();

  console.log("done");
})();
