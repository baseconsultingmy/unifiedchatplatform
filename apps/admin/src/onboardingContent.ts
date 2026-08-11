/** Industry-aware onboarding copy for Resources academy + booklet. */

export type OnboardingAction = {
  to?: string;
  href?: string;
  label: string;
  primary?: boolean;
  download?: boolean;
  external?: boolean;
};

export type OnboardingDetail = {
  title: string;
  steps: string[];
  note?: string;
  link?: { label: string; href: string };
};

export type OnboardingLesson = {
  id: string;
  title: string;
  summary: string;
  image: string;
  overview: string[];
  details?: OnboardingDetail[];
  tip?: string;
  actions: OnboardingAction[];
};

export type OnboardingIndustry = "health_beauty" | "fnb" | "retail" | "general";

export function buildOnboardingLessons(opts: {
  industry: OnboardingIndustry;
  shopName: string;
  country: string;
  currency: string;
  catalogLabel: string;
  roomsLabel: string;
}): OnboardingLesson[] {
  const { industry, shopName, country, currency, catalogLabel, roomsLabel } = opts;
  const isFnb = industry === "fnb";
  const isRetail = industry === "retail";
  const isHealth = industry === "health_beauty" || industry === "general";

  const lessons: OnboardingLesson[] = [
    {
      id: "welcome",
      title: "Welcome",
      summary: `Setup path for ${shopName} (${isFnb ? "Food & Beverage" : isRetail ? "Retail" : "Health & Beauty"} · ${country}/${currency}).`,
      image: "/guides/booklet/guide-visual-hero.png",
      overview: [
        isFnb
          ? "You will build a menu, connect chat/Grab if needed, then practice POS + Orders."
          : isRetail
            ? "You will add products, connect chat if needed, then practice POS."
            : "You will add services, set artists/rooms, connect LINE, then practice bookings + POS.",
        "Open each lesson, follow the detailed steps, then tap the amber button into the real screen.",
        "Progress saves on this tablet.",
      ],
      tip: "Use landscape on a tablet. Pull down later to refresh lists.",
      actions: [
        {
          href: `/guides/booklet/index.html?industry=${industry}`,
          label: "Open detailed web guide",
          external: true,
        },
        {
          href: "/guides/BaseApp-Shop-Onboarding-Booklet.pdf",
          label: "Download PDF",
          download: true,
        },
      ],
    },
    {
      id: "catalog",
      title: isFnb ? "Build your menu" : isRetail ? "Add products" : "Add services",
      summary: isFnb
        ? "Menu items power POS and Grab. Start with bestsellers."
        : isRetail
          ? "Products power POS. Start with 5–15 SKUs."
          : "Services power bookings and POS. Include duration and deposits when needed.",
      image: "/guides/booklet/guide-visual-catalog.png",
      overview: [
        `Open profile menu → ${catalogLabel}.`,
        isFnb
          ? "Add Food / Drinks items with prices."
          : isRetail
            ? "Add product name, category, price."
            : "Add name, category, duration, price, optional deposit.",
        "Save 5–15 items for beta, then refine.",
      ],
      details: isFnb
        ? [
            {
              title: "Create a menu item",
              steps: [
                "Tap your avatar (top-right) → Menu.",
                "Fill Name (e.g. Iced latte).",
                "Category: Food, Drinks, Snacks, or Combos (or type your own).",
                `Price in ${currency} (walk-in / POS price).`,
                "Tap Save. The item appears in the list and on POS.",
              ],
            },
            {
              title: "Add customisations (modifiers)",
              steps: [
                "On a saved item, open Customisations.",
                "Create a group (e.g. Ice or Size).",
                "Add options (Normal ice / Less ice) with optional price deltas.",
                "Set min/max select and whether required.",
                "Save — staff will pick these on POS.",
              ],
              note: "Do this for drinks first; food can wait.",
            },
            {
              title: "Ready for Grab later",
              steps: [
                "Finish the BaseApp menu before connecting Grab.",
                "Settings → Grab → Connect Grab → Publish menu.",
                "Incoming Grab tickets appear under Orders.",
              ],
            },
          ]
        : isRetail
          ? [
              {
                title: "Create a product",
                steps: [
                  "Avatar → Products.",
                  "Name (e.g. Serum 30ml).",
                  "Category (General / Skincare / Merchandise).",
                  `Price in ${currency}.`,
                  "Save — sell from POS with quantity.",
                ],
              },
            ]
          : [
              {
                title: "Create a service / package",
                steps: [
                  "Avatar → Services.",
                  "Name (e.g. Small line tattoo / Haircut).",
                  "Category: Treatments, Tattoo, Add-ons, Packages…",
                  "Duration in minutes (used for booking slots).",
                  `Price in ${currency}.`,
                  "Deposit (optional) — leave 0 if you take full payment later.",
                  "Save.",
                ],
                note: "Packages = longer duration + higher price. Add-ons = short duration.",
              },
              {
                title: "What customers will see",
                steps: [
                  "LINE/WhatsApp booking lists active services.",
                  "POS shows the same list for walk-ins.",
                  "Inactive items stay hidden from new bookings.",
                ],
              },
            ],
      tip: `Currency is ${currency} from country ${country}. Ask Master Admin to change country if wrong.`,
      actions: [{ to: "/services", label: `Open ${catalogLabel}`, primary: true }],
    },
  ];

  if (isHealth) {
    lessons.push({
      id: "rooms",
      title: `${roomsLabel} & bookings`,
      summary: "Artists and rooms prevent double-booking on the day board.",
      image: "/guides/booklet/booklet-step-bookings.png",
      overview: [
        `Add at least one artist under ${roomsLabel}.`,
        "Add a room/bay if you use stations.",
        "Create one practice booking on the Bookings tab.",
      ],
      details: [
        {
          title: `Add staff (${roomsLabel})`,
          steps: [
            `Avatar → ${roomsLabel}.`,
            "Type = Artist / therapist (or Person).",
            "Name = the person who takes appointments.",
            "Save. Repeat for each artist.",
          ],
        },
        {
          title: "Add a room / bay",
          steps: [
            `Still on ${roomsLabel}.`,
            "Type = Room / bay.",
            "Name = e.g. Bay A / Room 1.",
            "Save.",
          ],
          note: "Skip rooms if everyone shares one open floor.",
        },
        {
          title: "Create a practice booking",
          steps: [
            "Top tab → Bookings → New.",
            "Customer name + phone (WhatsApp/LINE number is fine).",
            "Pick a service you created.",
            "Assign artist (and room if you use one).",
            "Pick start time → Create booking.",
            "Open the booking → try Mark paid / Complete when ready.",
          ],
        },
      ],
      actions: [
        { to: "/resources", label: `Open ${roomsLabel}`, primary: true },
        { to: "/bookings", label: "Open Bookings" },
      ],
    });
  }

  lessons.push({
    id: "line",
    title: "Connect LINE (detailed)",
    summary:
      "Create a Messaging API channel, copy three secrets, point the webhook at BaseApp, then test with menu / book.",
    image: "/guides/booklet/guide-visual-line.png",
    overview: [
      "You need a LINE Official Account + LINE Developers channel.",
      "Copy Channel ID, Channel secret, Channel access token.",
      "Set webhook → paste into BaseApp Settings → test.",
    ],
    details: [
      {
        title: "A. Create / open LINE Developers",
        steps: [
          "On a laptop, open https://developers.line.biz and log in (LINE account).",
          "If new: create a Provider (your shop or company name).",
          "Create a channel → choose Messaging API.",
          "Fill channel name / description / category → agree to terms → Create.",
          "If you already have an Official Account, you can link it when prompted.",
        ],
        link: { label: "Open LINE Developers", href: "https://developers.line.biz" },
      },
      {
        title: "B. Find Channel ID & Channel secret",
        steps: [
          "Open your Messaging API channel.",
          "Basic settings tab.",
          "Channel ID — long number; Copy.",
          "Channel secret — click Show / Copy (keep private).",
        ],
        note: "These identify your shop to BaseApp. Never post them in public chat.",
      },
      {
        title: "C. Issue a Channel access token",
        steps: [
          "Still in the channel → Messaging API tab.",
          "Scroll to Channel access token.",
          "If empty: Issue (long-lived) or Issue channel access token.",
          "Copy the token once — store it safely.",
          "If you re-issue later, paste the new token into BaseApp again.",
        ],
      },
      {
        title: "D. Turn on the webhook",
        steps: [
          "Messaging API tab → Webhook settings.",
          "Webhook URL = https://api.baseapp.asia/v1/webhooks/line",
          "Update → Verify (should succeed after BaseApp has your secret).",
          "Enable Webhook = On.",
          "Use webhooks = Enabled.",
          "Optional: disable auto-reply / greeting messages so BaseApp can answer.",
        ],
        note: "Verify may fail until you save the secret in BaseApp — do step E, then Verify again.",
      },
      {
        title: "E. Paste into BaseApp",
        steps: [
          "In admin: avatar → Settings → LINE Messaging.",
          "Paste Channel ID.",
          "Paste Channel secret.",
          "Paste Channel access token.",
          "LIFF ID is optional — skip for beta.",
          "Tap Save LINE only (or save the full Settings form).",
          "Confirm status shows token / secret on file.",
        ],
      },
      {
        title: "F. Smoke test",
        steps: [
          "Add your Official Account from a personal LINE app.",
          "Send: menu   or   book",
          "You should get a package / booking flow reply.",
          "In BaseApp open Chat — the conversation should appear.",
        ],
        note: "No reply? Re-check webhook Enabled, exact URL, and that ID/secret/token are from the same channel.",
      },
    ],
    tip: "Thailand shops: do LINE before WhatsApp. WhatsApp is optional.",
    actions: [{ to: "/settings", label: "Open Settings · LINE", primary: true }],
  });

  if (isFnb) {
    lessons.push({
      id: "grab",
      title: "Grab Food (optional)",
      summary: "Connect after your BaseApp menu exists. Orders land in the Orders tab.",
      image: "/guides/booklet/guide-visual-pos.png",
      overview: [
        "Settings → Grab → Connect Grab.",
        "Finish activation / paste merchant ID.",
        "Publish menu → watch Orders.",
      ],
      details: [
        {
          title: "Connect & publish",
          steps: [
            "Finish at least a few menu items in BaseApp first.",
            "Settings → Grab panel → Connect Grab.",
            "Open the activation link; complete outlet linking in Grab.",
            "Paste Grab merchant ID if Settings asks for it → Save.",
            "Publish menu.",
            "Top tab → Orders to accept / prepare / complete tickets.",
          ],
          note: "Skip Grab entirely until dine-in POS is comfortable.",
        },
      ],
      actions: [
        { to: "/settings", label: "Open Grab settings", primary: true },
        { to: "/orders", label: "Open Orders" },
      ],
    });
  }

  lessons.push({
    id: "pos",
    title: isFnb ? "Practice POS + orders" : "Practice a walk-in sale",
    summary: isFnb
      ? "Ring up a walk-in, then learn the Orders queue for Grab."
      : "Ring up one ticket so staff know cash / QR before opening day.",
    image: "/guides/booklet/guide-visual-pos.png",
    overview: [
      "Top tab → POS → tap items → Charge.",
      "Take Cash or QR.",
      isHealth ? "Also try one booking from the Bookings tab." : "Optional: connect WhatsApp later in Settings.",
    ],
    details: [
      {
        title: "Walk-in on POS",
        steps: [
          "Top tab → POS.",
          "Tap catalog tiles to build the ticket (adjust qty if shown).",
          isFnb
            ? "Add order note / table if prompted."
            : "Confirm order → customer or walk-in.",
          "Payment → Cash (enter tendered) or QR.",
          "Finish the receipt. Optional WhatsApp send if WA is connected.",
        ],
      },
      ...(isFnb
        ? [
            {
              title: "Orders queue (Grab / delivery)",
              steps: [
                "Top tab → Orders.",
                "New ticket → Accept → Preparing → Ready → Complete.",
                "Reject only if you cannot fulfill.",
              ],
            } satisfies OnboardingDetail,
          ]
        : []),
      ...(isHealth
        ? [
            {
              title: "Quick booking reminder",
              steps: [
                "Bookings → New for appointments.",
                "POS for walk-in / add-ons / retail-style extras.",
              ],
            } satisfies OnboardingDetail,
          ]
        : []),
      {
        title: "WhatsApp (optional)",
        steps: [
          "Settings → WhatsApp / Meta.",
          "Copy Callback URL + Verify token into Meta Developer → WhatsApp → Configuration.",
          "Subscribe to messages.",
          "Paste Phone number ID + permanent token (+ WABA ID) into BaseApp → Save.",
          "Ask BaseApp to Publish booking Flow on your shop.",
        ],
        note: "Do this after LINE if you only need one chat channel for beta.",
      },
    ],
    actions: [
      { to: "/pos", label: "Open POS", primary: true },
      ...(isFnb ? [{ to: "/orders", label: "Open Orders" } satisfies OnboardingAction] : []),
      ...(isHealth ? [{ to: "/bookings", label: "Open Bookings" } satisfies OnboardingAction] : []),
      { to: "/settings", label: "Channels in Settings" },
    ],
  });

  return lessons;
}
