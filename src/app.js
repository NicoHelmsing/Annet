(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("siteData").textContent);
  var site = DATA.site, works = DATA.artworks;

  var T = {
    nl: {
      nav_work: "Werk", nav_about: "Over mij", nav_contact: "Contact",
      hero_a: "Schilderijen en tekeningen van",
      cta_work: "Bekijk het werk", cta_contact: "Stuur een bericht",
      work_title: "Werk", all: "Alles", for_sale: "Te koop",
      st_available: "Te koop", st_reserved: "Gereserveerd", st_sold: "Verkocht", st_nfs: "Niet te koop",
      on_request: "prijs op aanvraag", empty: "Er zijn hier nog geen werken.",
      about_title: "Over mij",
      contact_title: "Contact",
      contact_lede: "Heeft u interesse in een werk, wilt u iets laten maken, of het atelier bezoeken? Vul het formulier in. U krijgt persoonlijk antwoord.",
      email: "E-mail", phone: "Telefoon", place: "Plaats", instagram: "Instagram",
      f_name: "Uw naam", f_email: "Uw e-mailadres", f_phone: "Telefoonnummer", optional: "(mag leeg blijven)", f_message: "Uw bericht",
      privacy: "Uw gegevens worden alleen gebruikt om op uw bericht te antwoorden.",
      send: "Bericht versturen", sending: "Bezig met versturen…",
      sent: "Dank u wel! Uw bericht is verstuurd. U hoort zo snel mogelijk van mij.",
      send_err: "Het versturen is niet gelukt. Probeer het later nog eens",
      send_err_mail: ", of mail naar ",
      missing: "Vul de rood gemarkeerde velden in.",
      preview_sent: "Voorbeeld: in de echte website gaat dit bericht nu naar de e-mail van de kunstenaar.",
      no_form: "Het formulier is nog niet ingesteld.",
      interest: "Ik heb interesse in dit werk", similar: "Vraag naar vergelijkbaar werk",
      interest_msg: "Goedendag, ik heb interesse in het werk “{t}”. ",
      similar_msg: "Goedendag, ik zag het werk “{t}”. Maakt u ook iets vergelijkbaars? ",
      copy_link: "Link naar dit werk kopiëren", copied: "Link gekopieerd",
      prev: "Vorige", next: "Volgende", close: "Sluiten",
      footer_note: "Alle afbeeldingen op deze website zijn eigendom van de kunstenaar.",
      privacy_link: "Privacyverklaring", privacy_more: "Lees de privacyverklaring.",
      photo_of: "Foto", lang_btn: "EN", lang_label: "Switch to English"
    },
    en: {
      nav_work: "Work", nav_about: "About", nav_contact: "Contact",
      hero_a: "Paintings and drawings by",
      cta_work: "See the work", cta_contact: "Send a message",
      work_title: "Work", all: "All", for_sale: "For sale",
      st_available: "For sale", st_reserved: "Reserved", st_sold: "Sold", st_nfs: "Not for sale",
      on_request: "price on request", empty: "No works here yet.",
      about_title: "About me",
      contact_title: "Contact",
      contact_lede: "Interested in a work, a commission, or a studio visit? Fill in the form and you will get a personal reply.",
      email: "Email", phone: "Phone", place: "Location", instagram: "Instagram",
      f_name: "Your name", f_email: "Your email address", f_phone: "Phone number", optional: "(optional)", f_message: "Your message",
      privacy: "Your details are only used to reply to your message.",
      send: "Send message", sending: "Sending…",
      sent: "Thank you! Your message has been sent. I will reply as soon as I can.",
      send_err: "The message could not be sent. Please try again later",
      send_err_mail: ", or email ",
      missing: "Please fill in the fields marked in red.",
      preview_sent: "Preview: on the real website this message now goes to the artist's email.",
      no_form: "The form has not been set up yet.",
      interest: "I'm interested in this work", similar: "Ask about a similar work",
      interest_msg: "Hello, I am interested in the work “{t}”. ",
      similar_msg: "Hello, I saw the work “{t}”. Would you make something similar? ",
      copy_link: "Copy link to this work", copied: "Link copied",
      prev: "Previous", next: "Next", close: "Close",
      footer_note: "All images on this website are the property of the artist.",
      privacy_link: "Privacy statement", privacy_more: "Read the privacy statement.",
      photo_of: "Photo", lang_btn: "NL", lang_label: "Schakel naar Nederlands"
    }
  };

  var lang = "nl";
  try { if (localStorage.getItem("lang") === "en") lang = "en"; } catch (e) {}
  var filter = "all";
  var current = -1, currentImg = 0, visible = works.slice();

  function t(k) { return (T[lang] && T[lang][k]) || T.nl[k] || k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pick(w, key) { return (lang === "en" && w[key + "_en"]) ? w[key + "_en"] : w[key]; }
  function $(id) { return document.getElementById(id); }

  // English for the techniques Annet types in Dutch. Unknown words are shown as she wrote them.
  var TECH_EN = {
    "olieverf": "oil", "olieverfschilderij": "oil painting", "acryl": "acrylic", "acrylverf": "acrylic",
    "aquarel": "watercolour", "waterverf": "watercolour", "gouache": "gouache", "tempera": "tempera",
    "pastel": "pastel", "oliepastel": "oil pastel", "pastelkrijt": "pastel", "houtskool": "charcoal",
    "potlood": "pencil", "grafiet": "graphite", "kleurpotlood": "coloured pencil", "kleurpotloden": "coloured pencil",
    "inkt": "ink", "oostindische inkt": "Indian ink", "pen": "pen", "krijt": "chalk", "conté": "Conté",
    "gemengde techniek": "mixed media", "gemengde technieken": "mixed media", "collage": "collage",
    "schilderij": "painting", "schilderijen": "paintings", "tekening": "drawing", "tekeningen": "drawings",
    "schets": "sketch", "portret": "portrait", "ets": "etching", "linoleumsnede": "linocut", "linosnede": "linocut",
    "houtsnede": "woodcut", "zeefdruk": "screen print", "litho": "lithograph", "grafiek": "print", "beeld": "sculpture",
    "brons": "bronze", "keramiek": "ceramics", "klei": "clay",
    "doek": "canvas", "linnen": "linen", "paneel": "panel", "hout": "wood", "papier": "paper", "karton": "board",
    "board": "board", "op": "on", "en": "and", "met": "with"
  };
  function techText(s) {
    if (lang !== "en" || !s) return s;
    var low = s.toLowerCase().trim();
    if (TECH_EN[low]) return cap(TECH_EN[low], s);
    return s.split(/(\s+|,\s*|\/|\s*&\s*)/).map(function (part) {
      var k = part.toLowerCase(); return TECH_EN.hasOwnProperty(k) ? cap(TECH_EN[k], part) : part;
    }).join("");
  }
  function cap(en, orig) { return /^[A-ZÀ-Ý]/.test(orig) ? en.charAt(0).toUpperCase() + en.slice(1) : en; }

  function priceLine(w) {
    var st = w.status, txt = t("st_" + st);
    if (st === "available" || st === "reserved") {
      var p = w.price ? "€ " + Number(w.price).toLocaleString("nl-NL") : t("on_request");
      txt = txt + " · " + p;
    }
    return '<p class="price"><span class="dot ' + st + '" aria-hidden="true"></span>' + esc(txt) + "</p>";
  }
  function metaLine(w) {
    return [techText(w.technique), w.size, w.year].filter(Boolean).map(esc).join(" · ");
  }
  function labelHTML(w, tag) {
    var m = metaLine(w);
    return "<" + tag + ">" + esc(pick(w, "title")) + "</" + tag + ">" + (m ? '<p class="meta">' + m + "</p>" : "") + priceLine(w);
  }

  /* ---------- static text ---------- */
  function applyText() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-t]").forEach(function (el) { el.textContent = t(el.getAttribute("data-t")); });
    document.querySelectorAll("[data-site]").forEach(function (el) { el.textContent = site[el.getAttribute("data-site")] || ""; });
    document.querySelectorAll("[data-site-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-site-i18n");
      el.textContent = site[k + "_" + lang] || site[k + "_nl"] || "";
    });
    var lb = $("langBtn"); lb.textContent = t("lang_btn"); lb.setAttribute("aria-label", t("lang_label"));
    $("vClose").setAttribute("aria-label", t("close"));
    $("year").textContent = new Date().getFullYear();

    var paras = (lang === "en" && DATA.about.paragraphs_en.length) ? DATA.about.paragraphs_en : DATA.about.paragraphs;
    $("aboutBody").innerHTML = paras.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    var ph = DATA.about.photo;
    $("aboutPhoto").innerHTML = ph ? '<img src="' + esc(ph.src) + '" width="' + ph.w + '" height="' + ph.h + '" alt="' + esc(site.artistName) + ' in het atelier" loading="lazy">' : "";
    $("aboutPhoto").hidden = !ph;

    var d = [];
    if (site.email) d.push("<dt>" + t("email") + '</dt><dd><a href="mailto:' + esc(site.email) + '">' + esc(site.email) + "</a></dd>");
    if (site.phone) d.push("<dt>" + t("phone") + '</dt><dd><a href="tel:' + esc(site.phone.replace(/[^+\d]/g, "")) + '">' + esc(site.phone) + "</a></dd>");
    if (site.location) d.push("<dt>" + t("place") + "</dt><dd>" + esc(site.location) + "</dd>");
    if (site.instagram) d.push("<dt>" + t("instagram") + '</dt><dd><a href="https://instagram.com/' + esc(site.instagram.replace(/^@/, "")) + '" target="_blank" rel="noopener">@' + esc(site.instagram.replace(/^@/, "")) + "</a></dd>");
    $("direct").innerHTML = d.join(""); $("direct").hidden = !d.length;

    renderLegend(); renderFilters(); renderHero(); renderGallery();
    if (current >= 0 && $("viewer").open) fillViewer();
  }

  /* ---------- hero ---------- */
  function renderHero() {
    var fig = $("heroArt");
    var w = works.filter(function (x) { return x.featured; })[0] || works.filter(function (x) { return x.status === "available"; })[0] || works[0];
    if (!w) { fig.hidden = true; return; }
    var im = w.images[0];
    fig.innerHTML = '<button type="button" data-slug="' + esc(w.slug) + '" aria-label="' + esc(pick(w, "title")) + '"><img src="' + esc(im.l) + '" width="' + im.w + '" height="' + im.h + '" alt="' + esc(pick(w, "title")) + '" style="background:' + esc(im.color) + '"></button>' +
      '<figcaption class="label">' + labelHTML(w, "h3") + "</figcaption>";
  }

  /* ---------- filters ---------- */
  function techniques() {
    var seen = {}, out = [];
    works.forEach(function (w) { if (w.technique && !seen[w.technique]) { seen[w.technique] = 1; out.push(w.technique); } });
    return out;
  }
  function renderFilters() {
    var opts = [["all", t("all")]];
    if (works.some(function (w) { return w.status === "available"; }) && works.some(function (w) { return w.status !== "available"; })) opts.push(["sale", t("for_sale")]);
    var tech = techniques(); if (tech.length > 1) tech.forEach(function (x) { opts.push(["tech:" + x, techText(x)]); });
    var box = $("filters");
    box.setAttribute("aria-label", "Filter");
    box.hidden = opts.length < 2;
    box.innerHTML = opts.map(function (o) {
      return '<button type="button" class="chip" data-filter="' + esc(o[0]) + '" aria-pressed="' + (filter === o[0]) + '">' + esc(o[1]) + "</button>";
    }).join("");
  }
  function renderLegend() {
    var present = {}; works.forEach(function (w) { present[w.status] = 1; });
    $("legend").innerHTML = ["available", "reserved", "sold", "nfs"].filter(function (s) { return present[s]; }).map(function (s) {
      return '<span><span class="dot ' + s + '" aria-hidden="true"></span>' + t("st_" + s) + "</span>";
    }).join("");
  }

  /* ---------- gallery ---------- */
  function renderGallery() {
    visible = works.filter(function (w) {
      if (filter === "all") return true;
      if (filter === "sale") return w.status === "available";
      if (filter.indexOf("tech:") === 0) return w.technique === filter.slice(5);
      return true;
    });
    var g = $("gallery");
    if (!visible.length) { g.innerHTML = '<p class="empty">' + t("empty") + "</p>"; return; }
    g.innerHTML = visible.map(function (w, i) {
      var im = w.images[0];
      return '<figure class="work"><button type="button" data-slug="' + esc(w.slug) + '">' +
        '<img src="' + esc(im.s) + '" srcset="' + esc(im.s) + " " + im.sw + "w, " + esc(im.l) + " " + im.w + 'w" sizes="(max-width: 700px) 92vw, (max-width: 1100px) 46vw, 380px" width="' + im.w + '" height="' + im.h + '" alt="' + esc(pick(w, "title")) + '" loading="' + (i < 3 ? "eager" : "lazy") + '" style="background:' + esc(im.color) + '">' +
        '<figcaption class="label">' + labelHTML(w, "h3") + "</figcaption></button></figure>";
    }).join("");
  }

  /* ---------- viewer ---------- */
  var dlg = $("viewer");
  function openWork(slug, push) {
    var idx = visible.findIndex(function (w) { return w.slug === slug; });
    if (idx < 0) { filter = "all"; renderFilters(); renderGallery(); idx = visible.findIndex(function (w) { return w.slug === slug; }); }
    if (idx < 0) return;
    current = idx; currentImg = 0; fillViewer();
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
    if (push !== false) { try { history.replaceState(null, "", "#werk-" + slug); } catch (e) {} }
  }
  function fillViewer() {
    var w = visible[current]; if (!w) return;
    var im = w.images[currentImg] || w.images[0];
    var img = $("vImg"); img.src = im.l; img.width = im.w; img.height = im.h; img.alt = pick(w, "title"); img.style.background = im.color;
    $("vLabel").innerHTML = labelHTML(w, "h3").replace("<h3>", '<h3 id="vTitle">');
    var story = pick(w, "story"); $("vStory").textContent = story || ""; $("vStory").hidden = !story;
    $("vThumbs").innerHTML = w.images.length > 1 ? w.images.map(function (x, i) {
      return '<button type="button" data-img="' + i + '" aria-label="' + t("photo_of") + " " + (i + 1) + '" aria-current="' + (i === currentImg) + '"><img src="' + esc(x.s) + '" alt=""></button>';
    }).join("") : "";
    var forSale = w.status === "available" || w.status === "reserved";
    $("vInterest").textContent = forSale ? t("interest") : t("similar");
    $("vPrev").hidden = $("vNext").hidden = visible.length < 2;
  }
  function closeWork() {
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener("close", function () {
    current = -1;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) closeWork(); });
  $("vClose").addEventListener("click", closeWork);
  function step(d) { current = (current + d + visible.length) % visible.length; currentImg = 0; fillViewer(); try { history.replaceState(null, "", "#werk-" + visible[current].slug); } catch (e) {} }
  $("vPrev").addEventListener("click", function () { step(-1); });
  $("vNext").addEventListener("click", function () { step(1); });
  dlg.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input,textarea")) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
  $("vThumbs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-img]"); if (!b) return;
    currentImg = +b.getAttribute("data-img"); fillViewer();
  });
  $("vInterest").addEventListener("click", function () {
    var w = visible[current]; if (!w) return;
    var forSale = w.status === "available" || w.status === "reserved";
    var msg = (forSale ? t("interest_msg") : t("similar_msg")).replace("{t}", pick(w, "title"));
    $("f_message").value = msg; $("f_subject").value = pick(w, "title");
    closeWork();
    $("contact").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setTimeout(function () { $("f_name").focus({ preventScroll: true }); }, 450);
  });
  $("vShare").addEventListener("click", function () {
    var w = visible[current]; if (!w) return;
    var url = site.siteUrl ? site.siteUrl.replace(/\/$/, "") + "/werk/" + w.slug + "/" : location.href.split("#")[0] + "#werk-" + w.slug;
    var done = function () { toast(t("copied")); };
    var fail = function () { toast(url); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fail); else fail();
  });

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-slug]"); if (b) { openWork(b.getAttribute("data-slug")); return; }
    var f = e.target.closest("[data-filter]");
    if (f) { filter = f.getAttribute("data-filter"); renderFilters(); renderGallery(); }
  });
  $("langBtn").addEventListener("click", function () {
    lang = lang === "nl" ? "en" : "nl";
    try { localStorage.setItem("lang", lang); } catch (e) {}
    applyText();
  });

  function toast(msg) {
    var el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
    (dlg.open ? dlg : document.body).appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  /* ---------- contact form ---------- */
  var form = $("contactForm");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = $("formStatus"); status.className = "form-status"; status.textContent = "";
    var bad = [];
    ["f_name", "f_email", "f_message"].forEach(function (id) {
      var el = $(id), ok = el.value.trim() && (id !== "f_email" || /.+@.+\..+/.test(el.value));
      el.closest(".field").classList.toggle("invalid", !ok);
      el.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok) bad.push(el);
    });
    if (bad.length) { status.className = "form-status err"; status.textContent = t("missing"); bad[0].focus(); return; }
    if (form.botcheck.checked) return;

    var payload = {
      name: $("f_name").value.trim(), email: $("f_email").value.trim(), phone: $("f_phone").value.trim(),
      message: $("f_message").value.trim(),
      subject: "Website " + site.artistName + ($("f_subject").value ? ": " + $("f_subject").value : ""),
      from_name: "Website " + site.artistName
    };
    var okDone = function (msg) { status.className = "form-status ok"; status.textContent = msg; form.reset(); $("f_subject").value = ""; };

    if (DATA.preview) { okDone(t("preview_sent")); return; }
    if (!site.web3formsKey) {
      if (site.email) {
        location.href = "mailto:" + site.email + "?subject=" + encodeURIComponent(payload.subject) + "&body=" + encodeURIComponent(payload.message + "\n\n" + payload.name + "\n" + payload.phone);
      } else { status.className = "form-status err"; status.textContent = t("no_form"); }
      return;
    }
    var btn = $("sendBtn"); btn.disabled = true; btn.textContent = t("sending");
    payload.access_key = site.web3formsKey;
    fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.success) throw new Error(j.message); okDone(t("sent")); })
      .catch(function () {
        status.className = "form-status err";
        status.textContent = t("send_err") + (site.email ? t("send_err_mail") + site.email : "") + ".";
      })
      .then(function () { btn.disabled = false; btn.textContent = t("send"); });
  });

  /* ---------- start ---------- */
  applyText();
  var startSlug = window.OPEN_SLUG || (location.hash.indexOf("#werk-") === 0 ? decodeURIComponent(location.hash.slice(6)) : "");
  if (startSlug) openWork(startSlug, false);
})();
