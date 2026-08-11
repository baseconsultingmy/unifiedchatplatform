(() => {
  /** Host → nation / region pill (locked under BaseApp). */
  const REGIONS = {
    "": { pill: "ASIA", label: "Asia", host: "baseapp.asia" },
    www: { pill: "ASIA", label: "Asia", host: "www.baseapp.asia" },
    my: { pill: "MALAYSIA", label: "Malaysia", host: "my.baseapp.asia" },
    sg: { pill: "SINGAPORE", label: "Singapore", host: "sg.baseapp.asia" },
    id: { pill: "INDONESIA", label: "Indonesia", host: "id.baseapp.asia" },
    th: { pill: "THAILAND", label: "Thailand", host: "th.baseapp.asia" },
    ph: { pill: "PHILIPPINES", label: "Philippines", host: "ph.baseapp.asia" },
    vn: { pill: "VIETNAM", label: "Vietnam", host: "vn.baseapp.asia" },
  };

  function resolveRegion() {
    const params = new URLSearchParams(window.location.search);
    const override = (params.get("region") || "").toLowerCase();
    if (override && REGIONS[override]) return REGIONS[override];
    if (override === "asia") return REGIONS[""];

    const host = (window.location.hostname || "").toLowerCase();
    const parts = host.split(".");
    // my.baseapp.asia → my ; baseapp.asia → "" ; localhost → ""
    let sub = "";
    if (parts.length >= 3 && parts.slice(-2).join(".") === "baseapp.asia") {
      sub = parts[0] === "www" ? "www" : parts[0];
    }
    return REGIONS[sub] || REGIONS[""];
  }

  const region = resolveRegion();
  document.documentElement.dataset.region = region.pill;

  document.querySelectorAll("[data-region-pill]").forEach((el) => {
    el.textContent = region.pill;
  });

  document.querySelectorAll("[data-region-footer]").forEach((el) => {
    el.textContent = `${region.host} · ${region.label}`;
  });

  const desc = document.querySelector('meta[name="description"]');
  if (desc && region.pill !== "ASIA") {
    desc.setAttribute(
      "content",
      `BaseApp ${region.label} — one chat inbox, one POS, one order book for small businesses.`,
    );
  }

  if (/index\.html?$/.test(location.pathname) || location.pathname === "/") {
    document.title = `BaseApp ${region.pill} — One Chat. One POS. One Order.`;
  } else if (document.title.includes("BaseApp") || document.title.includes("BASE")) {
    document.title = document.title
      .replace(/BASE App/g, "BaseApp")
      .replace(/BaseApp(?! )/, `BaseApp ${region.pill}`);
  }

  const overlay = document.getElementById("how");
  if (overlay) {
    const openers = document.querySelectorAll("[data-open='how']");
    const closers = overlay.querySelectorAll("[data-close]");

    const open = () => {
      overlay.hidden = false;
      document.body.style.overflow = "hidden";
    };
    const close = () => {
      overlay.hidden = true;
      document.body.style.overflow = "";
    };

    openers.forEach((el) => el.addEventListener("click", open));
    closers.forEach((el) => el.addEventListener("click", close));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });
  }

  // Make ONE typography fill the same height as the 3 function rows
  const fitOne = () => {
    const word = document.querySelector(".one-word");
    const products = document.querySelector(".products");
    if (!word || !products) return;
    if (window.matchMedia("(max-width: 860px)").matches) {
      word.style.fontSize = "";
      return;
    }
    const target = products.getBoundingClientRect().height;
    if (target < 80) return;
    let lo = 40;
    let hi = Math.min(320, target * 1.2);
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      word.style.fontSize = `${mid}px`;
      const h = word.getBoundingClientRect().height;
      if (h > target) hi = mid;
      else lo = mid;
    }
    word.style.fontSize = `${lo}px`;
  };

  fitOne();
  window.addEventListener("resize", () => {
    window.clearTimeout(window.__baseFitOne);
    window.__baseFitOne = window.setTimeout(fitOne, 80);
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitOne);
  }
})();
