function _(id) {
  return document.getElementById(id);
}

function reportErr(e) {
  _("err").textContent = e;
}

window.onerror = function(e) {
  reportErr(e);
};

function GET(url, type) {
  return new Promise(function(resolve, reject) {
    let r = new XMLHttpRequest();
    r.open("GET", url);
    r.timeout = 60000;
    r.responseType = type;
    r.onreadystatechange = function() {
      if (r.readyState != r.DONE) {
        return;
      }
      if (r.status == 200) {
        resolve(r.response);
      } else {
        reject(new Error("HTTP response return non-success code " + r.status));
      }
    };
    r.send();
  });
}

NodeList.prototype.asArray = function() {
  let r = [];
  for (let e of this) {
    r.push(e);
  }
  return r;
};

function splitBuildID(buildid) {
  return {
    y: buildid.slice(0, 4),
    m: buildid.slice(4, 6),
    d: buildid.slice(6, 8),
    h: buildid.slice(8, 10),
    min: buildid.slice(10, 12),
    sec: buildid.slice(12, 14),
  };
}

let kTxtFinder = /^firefox.*win32.txt$/;
let kRevFinder = /https:\/\/hg\.mozilla.*\/([0-9a-f]{12}|[0-9a-f]{40})$/m;
function findRevForBuild(buildid, channel, row) {
  let b = splitBuildID(buildid);
  let url = "http://ftp.mozilla.org/pub/mozilla.org/firefox/nightly/" + b.y + "/" + b.m + "/" + [b.y, b.m, b.d, b.h, b.min, b.sec, channel].join("-") + "/";

  return findRevForBuildDir(url, channel, row);
}

function findRevForBuildDir(url, channel, row) {
  let buildLink = row.querySelector(".builddir");
  buildLink.href = url;
  buildLink.textContent = "build dir";
  return GET(url, "document").then(function(doc) {
    let links = doc.querySelectorAll("a").asArray().filter(function(link) {
      return kTxtFinder.test(link.textContent.trim());
    });
    if (links.length != 1) {
      throw new Error("win32.txt link not found at URL: " + url);
    }
    return GET(links[0].href, "text").then(function(r) {
      let m = kRevFinder.exec(r);
      if (m == null) {
        throw new Error("Couldn't find revision ID at URL: " + links[0].href);
      }
      let rev = m[1];
      let revLink = row.querySelector(".revision");
      revLink.textContent = rev;
      revLink.href = m[0];
      return rev;
    });
  });
}

function monthString(m) {
  return ("00" + m.toString()).slice(-2);
}

function findPrevBuild(buildid, channel, row) {
  let b = splitBuildID(buildid);
  let directoryUrl = "https://ftp.mozilla.org/pub/mozilla.org/firefox/nightly/" + b.y + "/" + b.m + "/";
  return GET(directoryUrl, "document").then(function(doc) {
    let links = doc.querySelectorAll("a").asArray().filter(function(link) {
      return link.textContent.trim().endsWith(channel + "/");
    });
    let target = [b.y, b.m, b.d, b.h, b.min, b.sec, channel].join("-") + "/";
    for (let i in links) {
      let link = links[i];
      if (link.textContent.trim() == target) {
        if (i == 0) {
          // Find the month *before* this one
          let year = b.y;
          let month = b.m - 1;
          if (month == 0) {
            year -= 1;
            month = 12;
          }
          return findLastBuild(year, monthString(month), channel, row);
        }
        return findRevForBuildDir(links[i - 1].href, channel, row);
      }
    }
    throw new Error("Couldn't find build in directory listing: " + directoryUrl);
  });
}

function findNextBuild(buildid, channel, row) {
  let b = splitBuildID(buildid);
  let directoryUrl = "https://ftp.mozilla.org/pub/mozilla.org/firefox/nightly/" + b.y + "/" + b.m + "/";
  return GET(directoryUrl, "document").then(function(doc) {
    let links = doc.querySelectorAll("a").asArray().filter(function(link) {
      return link.textContent.trim().endsWith(channel + "/");
    });
    let target = [b.y, b.m, b.d, b.h, b.min, b.sec, channel].join("-") + "/";
    for (let i in links) {
      let link = links[i];
      if (link.textContent.trim() == target) {
        if (i == links.length - 1) {
          // Find the month *after* this one
          let year = parseInt(b.y);
          let month = parseInt(b.m) + 1;
          if (month == 13) {
            year += 1;
            month = 1;
          }
          return findFirstBuild(year, monthString(month), channel, row);
        }
        return findRevForBuildDir(links[i - 1].href, channel, row);
      }
    }
    throw new Error("Couldn't find build in directory listing: " + directoryUrl);
  });
}

function findLastBuild(year, month, channel, row) {
  let directoryUrl = "https://ftp.mozilla.org/pub/mozilla.org/firefox/nightly/" + year + "/" + month + "/";
  return GET(directoryUrl, "document").then(function(doc) {
    let links = doc.querySelectorAll("a").asArray().filter(function(link) {
      return link.textContent.trim().endsWith(channel + "/");
    });
    if (links.length == 0) {
      throw new Error("Couldn't find any builds in directory listing: " + directoryUrl);
    }
    return findRevForBuildDir(links[links.length - 1].href, channel, row);
  });
}

function findFirstBuild(year, month, channel, row) {
  let directoryUrl = "https://ftp.mozilla.org/pub/mozilla.org/firefox/nightly/" + year + "/" + month + "/";
  return GET(directoryUrl, "document").then(function(doc) {
    let links = doc.querySelectorAll("a").asArray().filter(function(link) {
      return link.textContent.trim().endsWith(channel + "/");
    });
    if (links.length == 0) {
      throw new Error("Couldn't find any builds in directory listing: " + directoryUrl);
    }
    return findRevForBuildDir(links[0].href, channel, row);
  });
}

let kBuildID = /^\d{14}$/;
function generateLink() {
  reportErr("");
  let r = new XMLHttpRequest();
  let good = _("lastGood").value.trim();
  let bad = _("firstBad").value.trim();
  let channel = _("channel").value;

  let goodRevision = null;
  let badRevision = null;

  if (good != "" && !kBuildID.test(good)) {
    reportErr("Last-good buildid has unknown format. Expected YYYYMMDDhhmmss");
    return;
  }
  if (bad != "" && !kBuildID.test(bad)) {
    reportErr("First-bad buildid has unknown format. Expected YYYYMMDDhhmmss");
    return;
  }
  if (good == "" && bad == "") {
    reportErr("Enter either a known-good or known-bad revision to start.");
    return;
  }

  let p1, p2;
  if (good == "") {
    p1 = findPrevBuild(bad, channel, _("good")).then(function(v) {
      goodRevision = v;
    });
  } else {
    p1 = findRevForBuild(good, channel, _("good")).then(function(v) {
      goodRevision = v;
    });
  }

  if (bad == "") {
    findNextBuild(good, channel, _("bad")).then(function(v) {
      badRevision = v;
    });
  } else {
    p2 = findRevForBuild(bad, channel, _("bad")).then(function(v) {
      badRevision = v;
    });
  }
  Promise.all([p1, p2]).then(
    function() {
      presentLink(goodRevision, badRevision, channel);
    },
    function(e) {
      reportErr(e);
    });
}

function presentLink(good, bad, channel) {
  let base;
  if (channel.startsWith("mozilla-central")) {
    base = 'https://hg.mozilla.org/mozilla-central/';
  } else if (channel.startsWith("mozilla-aurora")) {
    base = 'https://hg.mozilla.org/releases/mozilla-aurora/';
  } else {
    throw new Error("Unrecognized channel: " + channel);
  }
  let url = base + "pushloghtml?fromchange=" + good + "&tochange=" + bad;
  let link = _("theLink");
  link.textContent = url;
  link.href = url;
}
