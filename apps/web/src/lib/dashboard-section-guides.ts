/** Staff-facing copy for dashboard page headers */
export const DASHBOARD_SECTION_GUIDES = {
  overview: {
    title: "Overview",
    description:
      "Your live venue snapshot — occupancy, revenue hints, and quick links to daily work.",
    capabilities: [
      "See how busy the venue is right now.",
      "Jump to reservations, orders, or finance from one place.",
      "Check subscription status and trial time remaining.",
    ],
  },
  settings: {
    title: "Shop settings",
    description:
      "Venue profile, marketing display name, address, publish toggle, and regional preferences. Edits save automatically after 2 seconds.",
    capabilities: [
      "Set dashboard venue name and customer-facing display name.",
      "Add address, city, country, phone, and email.",
      "Publish your venue on the marketing browse page.",
      "Set dashboard language and venue currency.",
      "Use the currency converter for multi-currency planning.",
    ],
  },
  gallery: {
    title: "Gallery",
    description:
      "Marketing cover image and extra photos on your public venue page at /venue/your-slug.",
    capabilities: [
      "Upload the main cover used on marketing and your public profile.",
      "Add gallery photos customers browse on your venue page.",
      "Promote any gallery shot to the marketing cover.",
    ],
  },
  notifications: {
    title: "Notifications",
    description:
      "Alerts about trials, subscriptions, reservations, tables, billing, and team sign-ins. Archive to tidy your inbox; owners can permanently delete.",
    capabilities: [
      "Filter by date, section, and read status.",
      "Mark items read or unread, or mark all as read.",
      "Archive selected items or everything matching your filter.",
      "Export the current filter to CSV.",
      "Owners can permanently delete selected or all matching notifications.",
    ],
  },
  audit: {
    title: "Audit log",
    description:
      "A history of sensitive changes — who did what, when, and in which area of the dashboard. Export anytime; only the venue owner can delete entries.",
    capabilities: [
      "Filter by date, section, action type, or search text.",
      "Expand entries to see technical details.",
      "Export the log to CSV for compliance or internal review.",
      "Select rows (or select all) — owners can permanently delete.",
    ],
  },
  reviews: {
    title: "Reviews",
    description:
      "Guest ratings and comments from your public venue page. See who reviewed you, when, their score, and the full text — hide or delete anything that should not stay public.",
    capabilities: [
      "Browse reviews with guest name, date, rating, and comment.",
      "Filter by published or hidden status.",
      "Hide a review from the public page or publish it again.",
      "Delete spam or abusive reviews permanently.",
    ],
  },
  subscription: {
    title: "Subscription & packs",
    description:
      "Your venue pack and add-ons control which modules are unlocked, staff seats, and trial access. Compare packs before changing your subscription.",
    capabilities: [
      "See your current pack, trial days left, and unlocked modules.",
      "Compare venue packs and marketing add-ons.",
      "Understand which tools unlock when you change packs or add modules.",
    ],
  },
  menu: {
    title: "Menu",
    description:
      "Your live venue menu — sections, items, prices, meal periods, optional stock, and photos guests will see.",
    capabilities: [
      "Create sections (Drinks, Food, etc.) with breakfast, lunch, dinner, or custom hours.",
      "Add items with description, price, and up to two photos (8 MB upload each; stored compressed).",
      "Track stock per item when you sell limited quantities.",
      "Let items inherit section hours or set their own availability window.",
    ],
  },
  hours: {
    title: "Hours & schedule",
    description:
      "Weekly opening hours and one-off closures or special hours for events and holidays.",
    capabilities: [
      "Set open/close times for each day of the week.",
      "Mark regular closed days (e.g. Sunday).",
      "Add closure dates or special hours for private events.",
    ],
  },
  notes: {
    title: "Shift notes",
    description:
      "Leave handoff notes for the next person on duty — title, details, day/time, and how urgent it is.",
    capabilities: [
      "See who wrote each note and their role.",
      "Mark importance: info, normal, important, or urgent.",
      "Set the shift day and time the note is about.",
      "Archive notes when they’re no longer needed (data stays in history).",
    ],
  },
  playBilling: {
    title: "Game billing",
    description:
      "Collect payment for game sessions — booked and walk-in. Sessions move here automatically when they end.",
    capabilities: [
      "In progress shows live bookings and walk-ins currently playing.",
      "Awaiting payment lists finished sessions — mark paid when you collect.",
      "Edit time, amount, or apply a percentage discount before payment.",
      "Add walk-ins for guests who showed up without a reservation.",
      "Paid totals feed Finance reports.",
    ],
  },
  gameBilling: {
    title: "Game billing",
    description:
      "Collect payment for game sessions — booked and walk-in. Sessions move here automatically when they end.",
    capabilities: [
      "In progress shows live bookings and walk-ins currently playing.",
      "Awaiting payment lists finished sessions — mark paid when you collect.",
      "Edit time, amount, or apply a percentage discount before payment.",
      "Add walk-ins for guests who showed up without a reservation.",
      "Paid totals feed Finance reports.",
    ],
  },
  orders: {
    title: "Menu orders",
    description:
      "Kitchen / counter tickets from your menu. New orders start in Preparing; mark Handed off only after the guest receives the order.",
    capabilities: [
      "New orders appear in Preparing automatically.",
      "Add menu lines, adjust qty and price, cancel or restore individual lines.",
      "Handed to customer moves a ticket to history and counts toward sales; Back to preparing if you tapped too early.",
      "Optional: mark if the table was reserved and add a reservation fee (leave empty when free).",
      "Sales-by-item reports include completed tickets plus quick-sale transactions.",
    ],
  },
  staff: {
    title: "Employee accounts",
    description:
      "Invite employees with personal setup links — you never set their passwords. Each seat is one person; only one active session per employee.",
    capabilities: [
      "Create employee logins and share activation links.",
      "Reset a setup link if an invite expires.",
      "Assign roles and fine-grained permissions.",
      "Deactivate accounts when someone leaves.",
    ],
  },
} as const;
