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

  let stats = {
    accepted: 0,
    friends: 0,
    tries: 0,
    fails: 0,
    scrolls: 0,
    lastHTTPCodes: [],
    cycles: 0
  };

  const acceptInviteButtonSelector = '[data-control-name="accept"]';

  const invtationLink =
    "https://www.linkedin.com/voyager/api/growth/normInvitations";

  function logStats() {
    logUpdate(
      `\nStats:`,
      `\n👥 friend request sent ${stats.tries}`,
      `\n💚 friended: ${stats.friends}`,
      `\n💔 failed: ${stats.fails}`,
      `\n⬇️  scrolled: ${stats.scrolls}`,
      `\n🌐 last HTTP codes: ${stats.lastHTTPCodes.slice(-3)}`,
      `\n💛 invitations accepted: ${stats.accepted}`,
      `\n🔁 cycles: ${stats.cycles}`
    );
  }

  function codeIsOk(code) {
    return /2\d{2}/.test(code);
  }

  page.on("request", request => {
    if (request.resourceType() === "xhr") {
      if (request.url() === invtationLink) {
        stats.tries++;
        logStats();
      }
    }
  });

  page.on("response", response => {
    if (response.request().resourceType() === "xhr") {
      if (response.request().url() === invtationLink) {
        // check status code to match 2xx
        if (codeIsOk(response.status())) {
          stats.friends++;
        } else {
          stats.fails++;
        }
        stats.lastHTTPCodes.push(response.status());

        if (stats.lastHTTPCodes.length > 20) {
          stats.lastHTTPCodes.shift();
        }

        logStats();
      }
    }
  });

  //todo: impl ctrl+c interruption here?
  while (stats.cycles < 10) {
    // ACCEPT INVITATIONS
    while (await page.$(acceptInviteButtonSelector)) {
      page.click(acceptInviteButtonSelector);
      // todo: add total available
      logUpdate(
        "\naccepting incoming invitations",
        `\n💛 invitations accepted: ${++stats.accepted}`
      );
      await delay();
    }

    console.log("---");

    // SEND INVITATIONS
    while (stats.lastHTTPCodes.filter(c => !codeIsOk(c)).length < 10) {
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
            stats.scrolls++;
            logUpdate();
          }
        });

      await delay();
    }

    //todo: wait 1 hr
    const oneHour = 60 * 60 * 1000;
    stats.cycles++;

    await delay(oneHour);
  }

  await browser.close();

  console.log("done");
})();
