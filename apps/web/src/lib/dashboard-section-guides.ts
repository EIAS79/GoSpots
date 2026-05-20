/** Staff-facing copy for dashboard page headers */
export const DASHBOARD_SECTION_GUIDES = {
  overview: {
    title: "Overview",
    description:
      "Your live venue snapshot — occupancy, revenue hints, and quick links to daily work.",
    capabilities: [
      "See how busy the venue is right now.",
      "Jump to operations, reservations, or finance from one place.",
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
      "Set how many building floors you have for dining seating (default 1).",
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
      "Alerts about trials, subscriptions, reservations, tables, billing, and team sign-ins. Nothing is deleted — archive items when you are done with them.",
    capabilities: [
      "Filter by date, section, and read status.",
      "Mark items read or unread, or mark all as read.",
      "Archive selected items or everything matching your filter.",
      "Open archived via the archive icon in the header — unarchive to restore to your inbox.",
      "Open linked pages (subscription, staff, etc.) from a notification.",
    ],
  },
  audit: {
    title: "Audit log",
    description:
      "A tamper-resistant history of sensitive changes — who did what, when, and in which area of the dashboard. Owners, managers, and staff can view and export; only the platform developer can delete entries.",
    capabilities: [
      "Filter by date, section, action type, or search text.",
      "Expand entries to see technical details.",
      "Export the log to CSV for compliance or internal review.",
      "You cannot delete audit rows — archive is not available here by design.",
    ],
  },
  subscription: {
    title: "Subscription & plan",
    description:
      "Your VenueFlow plan controls features, staff seats, and trial access. Compare tiers before upgrading or downgrading.",
    capabilities: [
      "See your current plan, trial days left, and unlocked features.",
      "Compare Starter, Standard, Pro, and marketing add-ons.",
      "Understand which tools unlock when you upgrade.",
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
  playBilling: {
    title: "Play billing",
    description:
      "Collect payment for game reservations — amounts are automatic from Gaming setup rates and how long the guest played.",
    capabilities: [
      "In progress lists live and checked-in bookings from Reservations.",
      "Awaiting payment shows finished sessions not yet marked paid.",
      "Paid groups by day; totals feed Finance reports (days, weeks, months).",
      "Staff only taps Mark paid — no duplicate booking entry here.",
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
