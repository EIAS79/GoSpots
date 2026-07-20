export type DictTree = { [key: string]: string | string[] | DictTree };

type LocaleBlocks = {
  subscription: DictTree;
  pack: DictTree;
  addon: DictTree;
  featureGate: DictTree;
  guide: DictTree;
};

export const deLocaleBlocks: LocaleBlocks = {
  subscription: {
    title: "Abo & Funktionen",
    paymentSubmitted:
      "Zahlung gesendet. Wenn Module noch gesperrt sind, warten Sie kurz auf den Webhook — dann aktualisieren.",
    setupTrial:
      "Funktionen für {pack} wählen und speichern — passende Dashboard-Bereiche werden freigeschaltet. Während der Testphase können Sie sie frei ändern.",
    setupPaid:
      "Wählen Sie unten die Funktionen für {pack}, speichern Sie, und starten Sie die Abrechnung, wenn Sie bereit sind. Bis dahin wird nichts berechnet.",
    trialHeadline: "{days}-tägige kostenlose Testphase · {left} {dayWord} übrig",
    day: "Tag",
    days: "Tage",
    trialBody:
      "Funktionen jederzeit hinzufügen/entfernen — die Sichtbarkeit aktualisiert sich beim Speichern. Bis zu {seats} Mitarbeiterplätze gratis mit Teamkonten. Nach {ends} wird alles abgeschaltet, bis Sie zahlen ({price}/Mon.) — keine Belastung ohne Checkout. Ihre Daten bleiben erhalten.",
    trialEndsFallback: "Ende der Testphase",
    trialEndedTitle: "Testphase beendet — Funktionen sind aus, bis Sie zahlen",
    trialEndedBody:
      "Passen Sie Ihren Plan unten bei Bedarf an und starten Sie dann die Abrechnung für {price}/Mon. Ohne Ihre Zustimmung wird nichts berechnet. Alle Daten sind noch da und kehren zurück, wenn Funktionen wieder aktiv sind.",
    activeTrial: "Aktive Testphase",
    paidActive: "Bezahlt · aktiv",
    featuresTotal: "Funktionen gesamt {price}/Mon.",
    staffSeats: " · Mitarbeiterplätze {used}/{limit}",
    employeeSeatsNone: " · Mitarbeiterplätze 0/0 (unter Teamkonten kaufen)",
    loadError: "Abo konnte nicht geladen werden.",
    venueType: "Venue-Typ",
    venueTypeHintTrial:
      "Kostenlos. Steuert Vorschläge — und aktualisiert mit den Funktionen unten die Dashboard-Sichtbarkeit beim Speichern.",
    venueTypeHintPaid:
      "Kostenlos. Steuert Vorschläge — Typ-/Funktionsänderungen im bezahlten Plan gelten ab dem nächsten Monat.",
    venueTypeHintDefault: "Kostenlos. Steuert Vorschläge.",
    featuresNeeded: "Benötigte Funktionen",
    featuresHintTrial:
      "Während der Testphase jederzeit hinzufügen oder entfernen. Speichern, um die Seitenleisten-Sichtbarkeit zu aktualisieren — Daten bleiben erhalten, auch wenn eine Funktion aus ist.",
    featuresHintPaid:
      "Änderungen gelten für den nächsten Abrechnungsmonat. Keine Rückerstattungen mitten im Zyklus; Daten bleiben, wenn Sie etwas abschalten.",
    featuresHintDefault:
      "Wählen Sie, wofür Sie zahlen. Bis Sie unten die Abrechnung starten, wird nichts berechnet.",
    suggestedBanner:
      "Vorschlag für Ihren Venue-Typ — speichern, um passende Dashboard-Bereiche freizuschalten.",
    suggested: "Vorschlag",
    perMo: "/Mon.",
    perSeat: "/Platz",
    payToUnlockTitle: "Zahlen, um Module freizuschalten",
    payToUnlockBody:
      "Ihre Funktionsauswahl ist für den Checkout gespeichert. Seitenleisten-Bereiche bleiben ausgeblendet, bis die Zahlung erfolgreich ist und das Abo wieder aktiv ist.",
    pendingTitle: "Änderungen für den nächsten Abrechnungsmonat geplant",
    pendingBody:
      "Dieser Zeitraum ist bereits bezahlt — keine Rückerstattungen oder Kürzungen mitten im Zyklus. Neue Funktionen / Plätze gelten{when}{thenPrice}. Der aktuelle Zugang bleibt bis dahin. Ihre Daten werden nie gelöscht.",
    pendingOn: " am {date}",
    pendingPeriodEnd: " zum Periodenende",
    pendingThen: " · dann {price}/Mon.",
    checkoutReadyTitle: "Funktionen bereit für den Checkout",
    checkoutReadyBody:
      "Gespeicherte Auswahl{pricePart}. Schließen Sie die Zahlung ab, um diese Module im Dashboard freizuschalten.",
    checkoutPricePart: " · {price}/Mon.",
    employeeSeats: "Mitarbeiterplätze",
    seatsHintTrial:
      "Während der Testphase gratis — max. {max} Logins. Danach kaufen Sie Plätze ({price}/Platz).",
    seatsHintPaid:
      "Wählen Sie, wie viele Logins Sie kaufen, und erstellen Sie dann Konten unter Mitarbeiter. {price} × Plätze / Monat.",
    trialSeats: "Test · {used}/{max}",
    seatErrorTrial:
      "1–{max} Mitarbeiterplätze setzen oder Teamkonten ausschalten.",
    seatErrorPaid:
      "Anzahl der zu kaufenden Mitarbeiterplätze setzen (mindestens 1) oder Teamkonten ausschalten.",
    saveError: "Funktionen konnten nicht gespeichert werden.",
    savedScheduled:
      "Für den nächsten Abrechnungsmonat geplant. Aktueller Zugang bis dahin unverändert.",
    savedOk: "Gespeichert. Seitenleisten-Sichtbarkeit aktualisiert — Ihre Daten wurden behalten.",
    scheduleNext: "Für nächsten Monat planen",
    saveFeatures: "Funktionen speichern",
    selectOne: "Wählen Sie mindestens eine Funktion, um fortzufahren.",
    featureDetails: "Funktionsdetails",
    billingTitle: "Abrechnung",
    billingBody:
      "Zahlungen laufen über Lemon Squeezy (Merchant of Record) — Multi-Währungs-Checkout, MwSt./Steuern für Sie erledigt. Ihr Paket + Add-ons: {price}/Mon.",
    billingManageHint:
      "Zahlungsmethode, Rechnungen oder Kündigung im Lemon-Squeezy-Portal verwalten. Hier gespeicherte Paketänderungen gelten ab der nächsten Abrechnungsperiode.",
    billingNotConfigured:
      "Abrechnungsschlüssel sind in der API noch nicht gesetzt. Fügen Sie LEMON_SQUEEZY_*-Umgebungsvariablen hinzu, um den Checkout zu aktivieren.",
    manageBilling: "Abrechnung verwalten",
    addPayment: "Zahlungsmethode hinzufügen",
    activate: "Abo aktivieren",
    billingFailed: "Abrechnungsaktion fehlgeschlagen.",
    viewOnlyFinance:
      "Nur Ansicht — bitten Sie einen Admin um Schreibzugriff auf Transaktionen, um Datensätze zu bearbeiten.",
  },
  pack: {
    gaming: {
      name: "Gaming-Venue",
      tagline: "Stationen, Live-Kartenbuchungen und Spielabrechnung.",
    },
    dining: {
      name: "Restaurant",
      tagline: "Tische, digitale Buchung, Speisekarte und Küchenbons.",
    },
    bar: {
      name: "Bar & Lounge",
      tagline: "Speisekarte, leichte Reservierungen und Thekenverkauf.",
    },
    hotel_fb: {
      name: "Hotel F&B",
      tagline: "Restaurantbetrieb plus Mitarbeiterplätze für Hotelteams.",
    },
    mixed: {
      name: "Gemischte Venue",
      tagline: "Gaming-Fläche und Gastronomie unter einem Dach.",
    },
  },
  addon: {
    ops_alerts: {
      name: "Ops-Alerts, Audit & Bewertungen",
      tagline: "Benachrichtigungen, Aktivitätsprotokoll und Gästebewertungs-Posteingang.",
      details:
        "Schaltet Benachrichtigungen, Audit-Protokoll und Bewertungen frei. Buchungsalarme, Mitarbeiteraktionen und Gästebewertungen in einer Ops-Suite — Bewertungen im Dashboard filtern und verwalten.",
    },
    gaming_suite: {
      name: "Gaming-Floor-Suite",
      tagline: "Layout, Setup, Spielabrechnung und Spielreservierungen.",
      details:
        "Für Gaming-Venues: Floor-Map gestalten, Stationen/Tische konfigurieren, Spielreservierungen annehmen und Spielabrechnung / Session-Gebühren im Dashboard führen.",
    },
    menu_orders: {
      name: "Menü & Küchenbestellungen",
      tagline: "Katalog, Abschnitte und Küchenbons.",
      details:
        "Speise- und Getränkekarten aufbauen, Bestand und Abschnitte verwalten sowie Menübestellungen / Küchenbons bearbeiten. Ideal für Restaurants, Bars und Cafés.",
    },
    dining_floor: {
      name: "Gastronomie-Fläche & Buchungen",
      tagline: "Tischlayout und Restaurantreservierungen.",
      details:
        "Speisesäle und Tischlayouts gestalten, dann Restaurantreservierungen annehmen und verwalten. Funktioniert zusammen mit Menü & Küchenbestellungen, wenn Sie Speisen servieren.",
    },
    venue_presence: {
      name: "Venue-Seite & Entdeckung",
      tagline: "Öffentliche Venue-Seite plus Verzeichnisplatzierung.",
      details:
        "Veröffentlichen Sie Ihre Venue auf GoSpots mit einer eigenen öffentlichen Seite und schalten Sie Werbung / prominente Platzierung im Venue-Verzeichnis frei, damit mehr Gäste Sie finden.",
    },
    guest_chat: {
      name: "Gästenachrichten",
      tagline: "Live-Chat mit Gästen auf Ihrer Venue-Seite.",
      details:
        "Gäste starten einen privaten Chat im Uber-Stil von Ihrer öffentlichen Seite, warten bis Personal beitritt, dann schreiben sie in Echtzeit. Personal kann pausieren, beenden, wieder öffnen oder löschen; Gäste können um Aufmerksamkeit bitten.",
    },
    team_accounts: {
      name: "Teamkonten",
      tagline: "Mitarbeiterplätze — Preis pro Platz / Monat.",
      details:
        "Kaufen Sie so viele Mitarbeiterplätze, wie Sie brauchen (ab 0). Erstellen Sie dann einen Login pro Platz mit Rollen und Berechtigungen. Jeder Platz ist eine Person.",
    },
  },
  featureGate: {
    locked: "{title} ist gesperrt",
    body:
      "Dieses Modul ist nicht in Ihrem aktuellen Paket oder Add-ons enthalten. Schalten Sie {feature} unter Abo frei, um es zu nutzen.",
    cta: "Pakete & Module ansehen",
    labels: {
      notifications: "Benachrichtigungen",
      audit: "Audit-Protokoll",
      reviews: "Bewertungen",
      resource: "Floor & Setup",
      reservation: "Reservierungen",
      transaction: "Transaktionen",
      reports: "Berichte",
      menu: "Speisekarte",
      marketing: "Marketing",
      messaging: "Gästenachrichten",
      roles: "Rollen",
      memberships: "Team",
      notes: "Schichtnotizen",
    },
  },
  guide: {
    overview: {
      title: "Übersicht",
      description:
        "Ihr Live-Venue-Überblick — Auslastung, Umsatzhinweise und Schnelllinks zur täglichen Arbeit.",
      caps: [
        "Sehen, wie ausgelastet die Venue gerade ist.",
        "Von einem Ort zu Reservierungen, Bestellungen oder Finanzen springen.",
        "Abo-Status und verbleibende Testzeit prüfen.",
      ],
    },
    gallery: {
      title: "Galerie",
      description:
        "Marketing-Titelbild und weitere Fotos auf Ihrer öffentlichen Venue-Seite.",
      caps: [
        "Hauptcover für Marketing und öffentliches Profil hochladen.",
        "Galeriefotos hinzufügen, die Kunden auf Ihrer Venue-Seite durchsuchen.",
        "Jedes Galeriefoto zum Marketing-Cover machen.",
      ],
    },
    menu: {
      title: "Speisekarte",
      description:
        "Ihre Live-Speisekarte — Abschnitte, Artikel, Preise, Essenszeiten, optionaler Bestand und Fotos für Gäste.",
      caps: [
        "Abschnitte mit Frühstück, Mittag, Abendessen oder eigenen Zeiten anlegen.",
        "Artikel mit Beschreibung, Preis und Fotos hinzufügen.",
        "Bestand pro Artikel verfolgen, wenn Mengen begrenzt sind.",
      ],
    },
    notes: {
      title: "Schichtnotizen",
      description:
        "Übergabenotizen für die nächste Person im Dienst — Titel, Details, Tag/Uhrzeit und Dringlichkeit.",
      caps: [
        "Sehen, wer jede Notiz geschrieben hat und welche Rolle.",
        "Wichtigkeit markieren: Info, normal, wichtig oder dringend.",
        "Notizen archivieren, wenn sie nicht mehr nötig sind.",
      ],
    },
    reviews: {
      title: "Bewertungen",
      description:
        "Gästebewertungen und Kommentare von Ihrer öffentlichen Venue-Seite. Verstecken oder löschen, was nicht öffentlich bleiben soll.",
      caps: [
        "Bewertungen mit Gastname, Datum, Note und Kommentar durchsuchen.",
        "Nach veröffentlicht oder versteckt filtern.",
        "Eine Bewertung auf der öffentlichen Seite verstecken oder erneut veröffentlichen.",
        "Spam oder missbräuchliche Bewertungen dauerhaft löschen.",
      ],
    },
    notifications: {
      title: "Benachrichtigungen",
      description:
        "Hinweise zu Testphasen, Abos, Reservierungen, Tischen, Abrechnung und Team-Anmeldungen.",
      caps: [
        "Nach Datum, Bereich und Lesestatus filtern.",
        "Einträge als gelesen oder ungelesen markieren oder alle als gelesen.",
        "Ausgewählte Einträge oder alles zum Filter archivieren.",
      ],
    },
    audit: {
      title: "Audit-Protokoll",
      description:
        "Verlauf sensibler Änderungen — wer was wann und in welchem Dashboard-Bereich getan hat.",
      caps: [
        "Nach Datum, Bereich, Aktionstyp oder Suchtext filtern.",
        "Einträge aufklappen, um technische Details zu sehen.",
        "Protokoll als CSV für Compliance oder interne Prüfung exportieren.",
      ],
    },
    subscription: {
      title: "Abo & Funktionen",
      description:
        "Zahlen Sie nur für Funktionen, die Sie behalten. Ohne Checkout startet keine Belastung. Eine Funktion abschalten löscht Ihre Daten nie.",
      caps: [
        "Kostenlose Testphase — Funktionen jederzeit hinzufügen/entfernen; Seitenleiste aktualisiert sich beim Speichern.",
        "Bis zu 3 Mitarbeiter-Logins in der Testphase, wenn Teamkonten aktiv sind.",
        "Nach der Testphase: alle Funktionen bleiben aus, bis Sie zahlen — keine automatische Belastung.",
        "Im bezahlten Plan gelten Funktionsänderungen ab dem nächsten Abrechnungsmonat (keine Rückerstattungen mitten im Zyklus).",
      ],
    },
    playBilling: {
      title: "Spielabrechnung",
      description:
        "Zahlung für Spielsessions einziehen — gebucht und Walk-in. Sessions landen hier automatisch, wenn sie enden.",
      caps: [
        "In Bearbeitung zeigt laufende Buchungen und Walk-ins, die gerade spielen.",
        "Zahlung ausstehend listet beendete Sessions — als bezahlt markieren, wenn Sie kassieren.",
        "Zeit, Betrag oder Prozent-Rabatt vor der Zahlung bearbeiten.",
      ],
    },
    sessions: {
      title: "Reservierungen",
      description:
        "Buchungen für Tische, PCs, Bahnen und andere Einheiten — bestätigen, einchecken und den Tag managen.",
      caps: [
        "Heutigen Plan und kommende Reservierungen sehen.",
        "Buchungen erstellen, bearbeiten oder stornieren.",
        "Gäste einchecken und Einheiten freigeben, wenn sie gehen.",
      ],
    },
    orders: {
      title: "Menübestellungen",
      description: "Menübestellungen von Gästen und der Fläche verfolgen und erfüllen.",
      caps: [
        "Offene und abgeschlossene Bestellungen sehen.",
        "Bestellstatus aktualisieren, während Küche und Bar vorbereiten.",
        "Summen prüfen, die in die Finanzen einfließen.",
      ],
    },
    finance: {
      title: "Finanzen",
      description:
        "Umsatzübersicht, Transaktionsbuch, Verluste und Berichte — nicht der Ort für Küche oder Floor-Betrieb.",
      caps: [
        "Kombinierten Umsatz aus Menü, Spiel und Reservierungen sehen (schreibgeschützte Rollups).",
        "Schnelle Thekenverkäufe erfassen und Verluste tracken.",
        "1–90-Tage-Berichte mit Charts, Druck und CSV-Export ausführen.",
        "Menübestellungen und Spielabrechnung bleiben unter Betrieb; Reservierungen unter Reservierungen.",
      ],
    },
    staff: {
      title: "Mitarbeiterkonten",
      description: "Personal einladen, Rollen zuweisen und steuern, wer aufs Dashboard zugreifen darf.",
      caps: [
        "Mitarbeiter-Logins innerhalb Ihres Platzlimits erstellen.",
        "Berechtigungen nach Rolle zuweisen.",
        "Zugang deaktivieren, wenn jemand das Team verlässt.",
      ],
    },
    resources: {
      title: "Gaming-Setup",
      description: "Stationen, Bahnen, Tarife und Angebots-Konfiguration für spielbare Einheiten.",
      caps: [
        "Kategorien für PCs, Konsolen, Bowling und mehr anlegen.",
        "Tarife setzen, die Gäste bei der Buchung sehen.",
        "Verfügbare Einheiten verwalten.",
      ],
    },
    dining: {
      title: "Gastronomie-Layout",
      description: "Tische, Etagen und Sitzplan für Reservierungen und Service.",
      caps: [
        "Tische nach Etage oder Zone organisieren.",
        "Kapazität für Gruppenbuchungen setzen.",
        "Floor-Plan mit der realen Bestuhlung abstimmen.",
      ],
    },
    messages: {
      title: "Gästenachrichten",
      description: "Chat- und Kontaktformular-Nachrichten von Ihrer öffentlichen Venue-Seite.",
      caps: [
        "Auf Live-Gästechat antworten.",
        "Kontaktformular-Einsendungen prüfen.",
        "Gästegespräche in einem Posteingang halten.",
      ],
    },
  },
};

export const frLocaleBlocks: LocaleBlocks = {
  subscription: {
    title: "Abonnement et fonctionnalités",
    paymentSubmitted:
      "Paiement envoyé. Si des modules sont encore verrouillés, attendez quelques secondes le webhook — puis actualisez.",
    setupTrial:
      "Choisissez les fonctionnalités pour {pack} et enregistrez — les sections correspondantes du tableau de bord se débloquent. Vous pouvez les modifier librement pendant l’essai.",
    setupPaid:
      "Choisissez ci-dessous les fonctionnalités pour {pack}, enregistrez, puis lancez la facturation quand vous êtes prêt. Rien n’est facturé avant.",
    trialHeadline: "Essai gratuit de {days} jours · {left} {dayWord} restant(s)",
    day: "jour",
    days: "jours",
    trialBody:
      "Ajoutez/supprimez des fonctionnalités à tout moment — la visibilité se met à jour à l’enregistrement. Jusqu’à {seats} sièges employés gratuits avec Comptes d’équipe. Après {ends}, tout s’éteint jusqu’à paiement ({price}/mois) — aucun débit sans paiement. Vos données restent.",
    trialEndsFallback: "fin de l’essai",
    trialEndedTitle: "Essai terminé — fonctionnalités désactivées jusqu’au paiement",
    trialEndedBody:
      "Ajustez votre formule ci-dessous si besoin, puis lancez la facturation à {price}/mois. Rien n’est débité sans votre accord. Toutes vos données sont toujours là et reviennent quand les fonctionnalités se réactivent.",
    activeTrial: "Essai actif",
    paidActive: "Payé · actif",
    featuresTotal: "Fonctionnalités total {price}/mois",
    staffSeats: " · Sièges personnel {used}/{limit}",
    employeeSeatsNone: " · Sièges employés 0/0 (acheter dans Comptes d’équipe)",
    loadError: "Impossible de charger l’abonnement.",
    venueType: "Type d’établissement",
    venueTypeHintTrial:
      "Gratuit. Oriente les suggestions — et avec les fonctionnalités ci-dessous, met à jour la visibilité du tableau de bord à l’enregistrement.",
    venueTypeHintPaid:
      "Gratuit. Oriente les suggestions — les changements de type/fonctionnalités sur une formule payante prennent effet le mois suivant.",
    venueTypeHintDefault: "Gratuit. Oriente les suggestions.",
    featuresNeeded: "Fonctionnalités dont vous avez besoin",
    featuresHintTrial:
      "Ajoutez ou retirez à tout moment pendant l’essai. Enregistrez pour actualiser la barre latérale — les données sont conservées même si une fonctionnalité est désactivée.",
    featuresHintPaid:
      "Les modifications sont planifiées pour le mois de facturation suivant. Pas de remboursement en cours de cycle ; les données restent si vous désactivez quelque chose.",
    featuresHintDefault:
      "Choisissez ce que vous paierez. Rien n’est facturé tant que vous n’avez pas lancé la facturation ci-dessous.",
    suggestedBanner:
      "Suggéré pour votre type d’établissement — enregistrez pour débloquer les sections correspondantes.",
    suggested: "Suggéré",
    perMo: "/mois",
    perSeat: "/siège",
    payToUnlockTitle: "Payer pour débloquer les modules",
    payToUnlockBody:
      "Vos choix de fonctionnalités sont enregistrés pour le paiement. Les sections de la barre latérale restent masquées jusqu’à succès du paiement et réactivation de l’abonnement.",
    pendingTitle: "Modifications planifiées pour le mois de facturation suivant",
    pendingBody:
      "Cette période est déjà payée — pas de remboursement ni de réduction en cours de cycle. Nouvelles fonctionnalités / sièges appliqués{when}{thenPrice}. L’accès actuel reste jusqu’alors. Vos données ne sont jamais supprimées.",
    pendingOn: " le {date}",
    pendingPeriodEnd: " à la fin de la période",
    pendingThen: " · puis {price}/mois",
    checkoutReadyTitle: "Fonctionnalités prêtes pour le paiement",
    checkoutReadyBody:
      "Sélection enregistrée{pricePart}. Finalisez le paiement pour débloquer ces modules dans le tableau de bord.",
    checkoutPricePart: " · {price}/mois",
    employeeSeats: "Sièges employés",
    seatsHintTrial:
      "Gratuit pendant l’essai — max {max} connexions. Après l’essai, vous achetez des sièges ({price}/siège).",
    seatsHintPaid:
      "Choisissez combien de connexions acheter, puis créez les comptes dans Employés. {price} × sièges / mois.",
    trialSeats: "Essai · {used}/{max}",
    seatErrorTrial:
      "Définissez 1–{max} sièges employés, ou désactivez Comptes d’équipe.",
    seatErrorPaid:
      "Indiquez combien de sièges employés acheter (au moins 1), ou désactivez Comptes d’équipe.",
    saveError: "Impossible d’enregistrer les fonctionnalités.",
    savedScheduled:
      "Planifié pour le mois de facturation suivant. Accès actuel inchangé jusque-là.",
    savedOk: "Enregistré. Visibilité de la barre latérale mise à jour — vos données ont été conservées.",
    scheduleNext: "Planifier pour le mois prochain",
    saveFeatures: "Enregistrer les fonctionnalités",
    selectOne: "Sélectionnez au moins une fonctionnalité pour continuer.",
    featureDetails: "Détails des fonctionnalités",
    billingTitle: "Facturation",
    billingBody:
      "Les paiements passent par Lemon Squeezy (Merchant of Record) — paiement multi-devises, TVA/taxes gérées pour vous. Votre pack + options : {price}/mois.",
    billingManageHint:
      "Gérez le moyen de paiement, les factures ou l’annulation dans le portail Lemon Squeezy. Les changements de pack enregistrés ici s’appliquent à la période suivante.",
    billingNotConfigured:
      "Les clés de facturation ne sont pas encore configurées sur l’API. Ajoutez les variables LEMON_SQUEEZY_* pour activer le paiement.",
    manageBilling: "Gérer la facturation",
    addPayment: "Ajouter un moyen de paiement",
    activate: "Activer l’abonnement",
    billingFailed: "Échec de l’action de facturation.",
    viewOnlyFinance:
      "Lecture seule — demandez à un admin l’accès en écriture aux transactions pour modifier les enregistrements.",
  },
  pack: {
    gaming: {
      name: "Établissement gaming",
      tagline: "Stations, réservations sur carte live et facturation de jeu.",
    },
    dining: {
      name: "Restaurant",
      tagline: "Tables, réservation numérique, menu et tickets cuisine.",
    },
    bar: {
      name: "Bar & lounge",
      tagline: "Menu, réservations légères et ventes au comptoir.",
    },
    hotel_fb: {
      name: "Hôtel F&B",
      tagline: "Opérations restaurant plus sièges pour les équipes hôtelières.",
    },
    mixed: {
      name: "Établissement mixte",
      tagline: "Espace jeux et restauration sous le même toit.",
    },
  },
  addon: {
    ops_alerts: {
      name: "Alertes ops, audit et avis",
      tagline: "Notifications, journal d’activité et boîte d’avis clients.",
      details:
        "Débloque Notifications, Journal d’audit et Avis. Alertes de réservation, actions du personnel et notes clients dans une suite ops — filtrez et gérez les avis depuis le tableau de bord.",
    },
    gaming_suite: {
      name: "Suite espace jeux",
      tagline: "Plan, configuration, facturation de jeu et réservations.",
      details:
        "Pour les établissements gaming : concevoir le plan de salle, configurer stations/tables, prendre des réservations de jeu et gérer la facturation / les sessions depuis le tableau de bord.",
    },
    menu_orders: {
      name: "Menu et commandes cuisine",
      tagline: "Catalogue, sections et tickets cuisine.",
      details:
        "Créez des menus nourriture et boissons, gérez stock et sections, et traitez les commandes / tickets cuisine. Idéal pour restaurants, bars et cafés.",
    },
    dining_floor: {
      name: "Salle et réservations",
      tagline: "Plan de tables et réservations restaurant.",
      details:
        "Concevez salles et plans de tables, puis prenez et gérez les réservations restaurant. Fonctionne avec Menu et commandes cuisine lorsque vous servez à manger.",
    },
    venue_presence: {
      name: "Page du lieu et découverte",
      tagline: "Page publique du lieu plus placement dans l’annuaire.",
      details:
        "Publiez votre lieu sur GoSpots avec une page publique dédiée, et débloquez la publicité / le placement promu dans l’annuaire pour que plus de clients vous trouvent.",
    },
    guest_chat: {
      name: "Messagerie clients",
      tagline: "Chat en direct avec les clients sur votre page.",
      details:
        "Les clients démarrent un chat privé façon Uber depuis votre page publique, attendent que le personnel rejoigne, puis échangent en temps réel. Le personnel peut mettre en pause, terminer, rouvrir ou supprimer ; les clients peuvent solliciter l’attention.",
    },
    team_accounts: {
      name: "Comptes d’équipe",
      tagline: "Sièges employés — tarif par siège / mois.",
      details:
        "Achetez autant de sièges employés que nécessaire (à partir de 0). Créez ensuite une connexion par siège avec rôles et permissions. Chaque siège = une personne.",
    },
  },
  featureGate: {
    locked: "{title} est verrouillé",
    body:
      "Ce module n’est pas inclus dans votre pack ou options actuelles. Débloquez {feature} depuis Abonnement pour l’utiliser.",
    cta: "Voir packs et modules",
    labels: {
      notifications: "Notifications",
      audit: "Journal d’audit",
      reviews: "Avis",
      resource: "Plan et configuration",
      reservation: "Réservations",
      transaction: "Transactions",
      reports: "Rapports",
      menu: "Menu",
      marketing: "Marketing",
      messaging: "Messagerie clients",
      roles: "Rôles",
      memberships: "Équipe",
      notes: "Notes de service",
    },
  },
  guide: {
    overview: {
      title: "Aperçu",
      description:
        "Votre tableau de bord en direct — occupation, indices de revenus et raccourcis vers le travail quotidien.",
      caps: [
        "Voir à quel point le lieu est occupé en ce moment.",
        "Aller aux réservations, commandes ou finances depuis un seul endroit.",
        "Vérifier le statut d’abonnement et le temps d’essai restant.",
      ],
    },
    gallery: {
      title: "Galerie",
      description:
        "Image de couverture marketing et photos supplémentaires sur votre page publique.",
      caps: [
        "Téléverser la couverture principale pour le marketing et le profil public.",
        "Ajouter des photos de galerie que les clients parcourent sur votre page.",
        "Promouvoir n’importe quelle photo en couverture marketing.",
      ],
    },
    menu: {
      title: "Menu",
      description:
        "Votre menu en direct — sections, articles, prix, services, stock optionnel et photos visibles des clients.",
      caps: [
        "Créer des sections petit-déjeuner, déjeuner, dîner ou horaires personnalisés.",
        "Ajouter des articles avec description, prix et photos.",
        "Suivre le stock par article pour les quantités limitées.",
      ],
    },
    notes: {
      title: "Notes de service",
      description:
        "Laissez des notes de passation pour la personne suivante — titre, détails, jour/heure et urgence.",
      caps: [
        "Voir qui a écrit chaque note et son rôle.",
        "Marquer l’importance : info, normal, important ou urgent.",
        "Archiver les notes quand elles ne sont plus utiles.",
      ],
    },
    reviews: {
      title: "Avis",
      description:
        "Notes et commentaires des clients depuis votre page publique. Masquez ou supprimez ce qui ne doit pas rester public.",
      caps: [
        "Parcourir les avis avec nom, date, note et commentaire.",
        "Filtrer par publié ou masqué.",
        "Masquer un avis de la page publique ou le republier.",
        "Supprimer définitivement le spam ou les avis abusifs.",
      ],
    },
    notifications: {
      title: "Notifications",
      description:
        "Alertes sur essais, abonnements, réservations, tables, facturation et connexions d’équipe.",
      caps: [
        "Filtrer par date, section et statut de lecture.",
        "Marquer lu ou non lu, ou tout marquer comme lu.",
        "Archiver la sélection ou tout ce qui correspond au filtre.",
      ],
    },
    audit: {
      title: "Journal d’audit",
      description:
        "Historique des changements sensibles — qui a fait quoi, quand, et dans quelle zone du tableau de bord.",
      caps: [
        "Filtrer par date, section, type d’action ou texte de recherche.",
        "Développer les entrées pour voir les détails techniques.",
        "Exporter le journal en CSV pour la conformité ou la revue interne.",
      ],
    },
    subscription: {
      title: "Abonnement et fonctionnalités",
      description:
        "Ne payez que les fonctionnalités que vous gardez. Rien n’est facturé sans démarrer le paiement. Désactiver une fonctionnalité ne supprime jamais vos données.",
      caps: [
        "Essai gratuit — ajoutez/retirez des fonctionnalités à tout moment ; la barre latérale se met à jour à l’enregistrement.",
        "Jusqu’à 3 connexions employés pendant l’essai si Comptes d’équipe est activé.",
        "Après l’essai : toutes les fonctionnalités restent désactivées jusqu’au paiement — pas de débit automatique.",
        "Sur une formule payante, les changements de fonctionnalités s’appliquent le mois de facturation suivant (pas de remboursement en cours de cycle).",
      ],
    },
    playBilling: {
      title: "Facturation jeux",
      description:
        "Encaisser le paiement des sessions de jeu — réservées et walk-in. Les sessions arrivent ici automatiquement à la fin.",
      caps: [
        "En cours affiche les réservations et walk-ins qui jouent actuellement.",
        "En attente de paiement liste les sessions terminées — marquez payé à l’encaissement.",
        "Modifier durée, montant ou appliquer une remise en pourcentage avant paiement.",
      ],
    },
    sessions: {
      title: "Réservations",
      description:
        "Réservations pour tables, PC, pistes et autres unités — confirmer, enregistrer et gérer la journée.",
      caps: [
        "Voir le planning du jour et les réservations à venir.",
        "Créer, modifier ou annuler des réservations.",
        "Enregistrer les clients et libérer les unités à leur départ.",
      ],
    },
    orders: {
      title: "Commandes menu",
      description: "Suivre et traiter les commandes menu des clients et de la salle.",
      caps: [
        "Voir les commandes ouvertes et terminées.",
        "Mettre à jour le statut pendant que cuisine et bar préparent.",
        "Consulter les totaux qui alimentent les finances.",
      ],
    },
    finance: {
      title: "Finances",
      description:
        "Aperçu des revenus, grand livre des transactions, pertes et rapports — pas l’endroit pour faire tourner la cuisine ou la salle.",
      caps: [
        "Voir le chiffre d’affaires combiné menu, jeu et réservations (agrégats en lecture seule).",
        "Enregistrer des ventes rapides au comptoir et suivre les pertes.",
        "Générer des rapports 1–90 jours avec graphiques, impression et export CSV.",
        "Commandes menu et facturation jeux restent sous Opérations ; réservations sous Réservations.",
      ],
    },
    staff: {
      title: "Comptes employés",
      description: "Inviter le personnel, assigner des rôles et gérer qui accède au tableau de bord.",
      caps: [
        "Créer des connexions employés dans la limite de sièges.",
        "Assigner les permissions par rôle.",
        "Désactiver l’accès quand quelqu’un quitte l’équipe.",
      ],
    },
    resources: {
      title: "Espace jeux",
      description: "Stations, pistes, tarifs et configuration des offres pour les unités jouables.",
      caps: [
        "Créer des catégories pour PC, consoles, bowling, etc.",
        "Définir les tarifs visibles à la réservation.",
        "Gérer le nombre d’unités disponibles.",
      ],
    },
    dining: {
      title: "Plan de salle",
      description: "Tables, étages et plan de sièges pour réservations et service.",
      caps: [
        "Organiser les tables par étage ou zone.",
        "Définir la capacité pour les réservations de groupes.",
        "Aligner le plan avec la disposition réelle.",
      ],
    },
    messages: {
      title: "Messages des clients",
      description: "Chat et messages du formulaire de contact depuis votre page publique.",
      caps: [
        "Répondre au chat client en direct.",
        "Examiner les envois du formulaire de contact.",
        "Centraliser les conversations clients dans une boîte.",
      ],
    },
  },
};

export const esLocaleBlocks: LocaleBlocks = {
  subscription: {
    title: "Suscripción y funciones",
    paymentSubmitted:
      "Pago enviado. Si los módulos siguen bloqueados, espere unos segundos al webhook — luego actualice.",
    setupTrial:
      "Elija funciones para {pack} y guarde — se desbloquean las secciones correspondientes del panel. Puede cambiarlas libremente durante la prueba.",
    setupPaid:
      "Elija abajo las funciones para {pack}, guarde y luego inicie la facturación cuando esté listo. No se cobra nada hasta entonces.",
    trialHeadline: "Prueba gratuita de {days} días · quedan {left} {dayWord}",
    day: "día",
    days: "días",
    trialBody:
      "Añada/quite funciones en cualquier momento — la visibilidad se actualiza al guardar. Hasta {seats} asientos de empleados gratis con Cuentas de equipo. Tras {ends}, todo se apaga hasta que pague ({price}/mes) — sin cargo sin checkout. Sus datos permanecen.",
    trialEndsFallback: "fin de la prueba",
    trialEndedTitle: "Prueba terminada — funciones desactivadas hasta que pague",
    trialEndedBody:
      "Ajuste su plan abajo si hace falta y luego inicie la facturación por {price}/mes. Nada se cobra sin su consentimiento. Todos sus datos siguen aquí y vuelven cuando se reactivan las funciones.",
    activeTrial: "Prueba activa",
    paidActive: "Pagado · activo",
    featuresTotal: "Funciones total {price}/mes",
    staffSeats: " · Asientos de personal {used}/{limit}",
    employeeSeatsNone: " · Asientos de empleados 0/0 (comprar en Cuentas de equipo)",
    loadError: "No se pudo cargar la suscripción.",
    venueType: "Tipo de local",
    venueTypeHintTrial:
      "Gratis. Orienta las sugerencias — y con las funciones de abajo actualiza la visibilidad del panel al guardar.",
    venueTypeHintPaid:
      "Gratis. Orienta las sugerencias — los cambios de tipo/función en un plan de pago se aplican el mes siguiente.",
    venueTypeHintDefault: "Gratis. Orienta las sugerencias.",
    featuresNeeded: "Funciones que necesita",
    featuresHintTrial:
      "Añada o quite en cualquier momento durante la prueba. Guarde para actualizar la barra lateral — los datos se conservan aunque una función esté desactivada.",
    featuresHintPaid:
      "Los cambios se programan para el próximo mes de facturación. Sin reembolsos a mitad de ciclo; los datos permanecen si desactiva algo.",
    featuresHintDefault:
      "Elija por qué pagará. No se cobra nada hasta que inicie la facturación abajo.",
    suggestedBanner:
      "Sugerido para su tipo de local — guarde para desbloquear las secciones correspondientes.",
    suggested: "Sugerido",
    perMo: "/mes",
    perSeat: "/asiento",
    payToUnlockTitle: "Pagar para desbloquear módulos",
    payToUnlockBody:
      "Sus elecciones de funciones están guardadas para el checkout. Las secciones de la barra lateral permanecen ocultas hasta que el pago se complete y la suscripción vuelva a estar activa.",
    pendingTitle: "Cambios programados para el próximo mes de facturación",
    pendingBody:
      "Este período ya está pagado — sin reembolsos ni recortes a mitad de ciclo. Las nuevas funciones / asientos se aplican{when}{thenPrice}. El acceso actual se mantiene hasta entonces. Sus datos nunca se eliminan.",
    pendingOn: " el {date}",
    pendingPeriodEnd: " al final del período",
    pendingThen: " · luego {price}/mes",
    checkoutReadyTitle: "Funciones listas para el checkout",
    checkoutReadyBody:
      "Selección guardada{pricePart}. Complete el pago para desbloquear estos módulos en el panel.",
    checkoutPricePart: " · {price}/mes",
    employeeSeats: "Asientos de empleados",
    seatsHintTrial:
      "Gratis durante la prueba — máx. {max} inicios de sesión. Tras la prueba compra asientos ({price}/asiento).",
    seatsHintPaid:
      "Elija cuántos inicios de sesión comprar y luego cree cuentas en Empleados. {price} × asientos / mes.",
    trialSeats: "Prueba · {used}/{max}",
    seatErrorTrial:
      "Defina 1–{max} asientos de empleados, o desactive Cuentas de equipo.",
    seatErrorPaid:
      "Indique cuántos asientos de empleados comprar (al menos 1), o desactive Cuentas de equipo.",
    saveError: "No se pudieron guardar las funciones.",
    savedScheduled:
      "Programado para el próximo mes de facturación. El acceso actual no cambia hasta entonces.",
    savedOk: "Guardado. Visibilidad de la barra lateral actualizada — se conservaron sus datos.",
    scheduleNext: "Programar para el próximo mes",
    saveFeatures: "Guardar funciones",
    selectOne: "Seleccione al menos una función para continuar.",
    featureDetails: "Detalles de las funciones",
    billingTitle: "Facturación",
    billingBody:
      "Los pagos pasan por Lemon Squeezy (Merchant of Record) — checkout multi-divisa, IVA/impuestos gestionados por usted. Su pack + complementos: {price}/mes.",
    billingManageHint:
      "Gestione método de pago, facturas o cancelación en el portal de Lemon Squeezy. Los cambios de pack que guarde aquí se aplican en el próximo período.",
    billingNotConfigured:
      "Las claves de facturación aún no están configuradas en la API. Añada variables LEMON_SQUEEZY_* para habilitar el checkout.",
    manageBilling: "Gestionar facturación",
    addPayment: "Añadir método de pago",
    activate: "Activar suscripción",
    billingFailed: "La acción de facturación falló.",
    viewOnlyFinance:
      "Solo lectura — pida a un admin acceso de escritura a transacciones para editar registros.",
  },
  pack: {
    gaming: {
      name: "Local gaming",
      tagline: "Estaciones, reservas en mapa en vivo y facturación de juego.",
    },
    dining: {
      name: "Restaurante",
      tagline: "Mesas, reserva digital, carta y tickets de cocina.",
    },
    bar: {
      name: "Bar y lounge",
      tagline: "Carta, reservas ligeras y ventas de mostrador.",
    },
    hotel_fb: {
      name: "Hotel F&B",
      tagline: "Operaciones de restaurante más asientos para equipos hoteleros.",
    },
    mixed: {
      name: "Local mixto",
      tagline: "Zona de juegos y restauración bajo el mismo techo.",
    },
  },
  addon: {
    ops_alerts: {
      name: "Alertas ops, auditoría y reseñas",
      tagline: "Notificaciones, registro de actividad y bandeja de reseñas de invitados.",
      details:
        "Desbloquea Notificaciones, Registro de auditoría y Reseñas. Alertas de reservas, acciones del personal y valoraciones de invitados en un suite ops — filtre y gestione reseñas desde el panel.",
    },
    gaming_suite: {
      name: "Suite de zona de juegos",
      tagline: "Distribución, configuración, facturación de juego y reservas.",
      details:
        "Para locales gaming: diseñar el mapa de sala, configurar estaciones/mesas, tomar reservas de juego y gestionar la facturación / cargos de sesión desde el panel.",
    },
    menu_orders: {
      name: "Carta y pedidos de cocina",
      tagline: "Catálogo, secciones y tickets de cocina.",
      details:
        "Cree cartas de comida y bebida, gestione stock y secciones, y procese pedidos / tickets de cocina. Ideal para restaurantes, bares y cafés.",
    },
    dining_floor: {
      name: "Salón y reservas",
      tagline: "Distribución de mesas y reservas de restaurante.",
      details:
        "Diseñe salas y planos de mesas, luego tome y gestione reservas de restaurante. Funciona junto con Carta y pedidos de cocina cuando sirve comida.",
    },
    venue_presence: {
      name: "Página del local y descubrimiento",
      tagline: "Página pública del local más presencia en el directorio.",
      details:
        "Publique su local en GoSpots con una página pública dedicada y desbloquee publicidad / colocación promocionada en el directorio para que más invitados le encuentren.",
    },
    guest_chat: {
      name: "Mensajería de invitados",
      tagline: "Chat en vivo con invitados en la página de su local.",
      details:
        "Los invitados inician un chat privado estilo Uber desde su página pública, esperan a que el personal se una y luego escriben en tiempo real. El personal puede pausar, terminar, reabrir o eliminar; los invitados pueden pedir atención.",
    },
    team_accounts: {
      name: "Cuentas de equipo",
      tagline: "Asientos de empleados — precio por asiento / mes.",
      details:
        "Compre tantos asientos de empleados como necesite (desde 0). Luego cree un inicio de sesión por asiento con roles y permisos. Cada asiento es una persona.",
    },
  },
  featureGate: {
    locked: "{title} está bloqueado",
    body:
      "Este módulo no está incluido en su pack o complementos actuales. Desbloquee {feature} desde Suscripción para usarlo.",
    cta: "Ver packs y módulos",
    labels: {
      notifications: "Notificaciones",
      audit: "Registro de auditoría",
      reviews: "Reseñas",
      resource: "Planta y configuración",
      reservation: "Reservas",
      transaction: "Transacciones",
      reports: "Informes",
      menu: "Carta",
      marketing: "Marketing",
      messaging: "Mensajería de invitados",
      roles: "Roles",
      memberships: "Equipo",
      notes: "Notas de turno",
    },
  },
  guide: {
    overview: {
      title: "Resumen",
      description:
        "Instantánea en vivo de su local — ocupación, pistas de ingresos y enlaces rápidos al trabajo diario.",
      caps: [
        "Ver lo ocupado que está el local ahora mismo.",
        "Ir a reservas, pedidos o finanzas desde un solo lugar.",
        "Comprobar el estado de la suscripción y el tiempo de prueba restante.",
      ],
    },
    gallery: {
      title: "Galería",
      description:
        "Imagen de portada de marketing y fotos extra en la página pública de su local.",
      caps: [
        "Subir la portada principal usada en marketing y el perfil público.",
        "Añadir fotos de galería que los clientes ven en su página.",
        "Promocionar cualquier foto de galería a portada de marketing.",
      ],
    },
    menu: {
      title: "Carta",
      description:
        "Su carta en vivo — secciones, platos, precios, franjas de comida, stock opcional y fotos que verán los invitados.",
      caps: [
        "Crear secciones con desayuno, almuerzo, cena u horarios personalizados.",
        "Añadir platos con descripción, precio y fotos.",
        "Controlar stock por plato cuando vende cantidades limitadas.",
      ],
    },
    notes: {
      title: "Notas de turno",
      description:
        "Deje notas de relevo para la siguiente persona de servicio — título, detalles, día/hora y urgencia.",
      caps: [
        "Ver quién escribió cada nota y su rol.",
        "Marcar importancia: info, normal, importante o urgente.",
        "Archivar notas cuando ya no hagan falta.",
      ],
    },
    reviews: {
      title: "Reseñas",
      description:
        "Valoraciones y comentarios de invitados desde su página pública. Oculte o elimine lo que no deba seguir público.",
      caps: [
        "Explorar reseñas con nombre, fecha, valoración y comentario.",
        "Filtrar por publicadas u ocultas.",
        "Ocultar una reseña de la página pública o publicarla de nuevo.",
        "Eliminar spam o reseñas abusivas de forma permanente.",
      ],
    },
    notifications: {
      title: "Notificaciones",
      description:
        "Alertas sobre pruebas, suscripciones, reservas, mesas, facturación e inicios de sesión del equipo.",
      caps: [
        "Filtrar por fecha, sección y estado de lectura.",
        "Marcar leído o no leído, o marcar todo como leído.",
        "Archivar la selección o todo lo que coincida con el filtro.",
      ],
    },
    audit: {
      title: "Registro de auditoría",
      description:
        "Historial de cambios sensibles — quién hizo qué, cuándo y en qué área del panel.",
      caps: [
        "Filtrar por fecha, sección, tipo de acción o texto de búsqueda.",
        "Expandir entradas para ver detalles técnicos.",
        "Exportar el registro a CSV para cumplimiento o revisión interna.",
      ],
    },
    subscription: {
      title: "Suscripción y funciones",
      description:
        "Pague solo por las funciones que conserve. No se cobra nada sin iniciar el checkout. Desactivar una función nunca elimina sus datos.",
      caps: [
        "Prueba gratuita — añada/quite funciones en cualquier momento; la barra lateral se actualiza al guardar.",
        "Hasta 3 inicios de sesión de empleados durante la prueba si Cuentas de equipo está activo.",
        "Tras la prueba: todas las funciones quedan desactivadas hasta que pague — sin cobro automático.",
        "En un plan de pago, los cambios de funciones se aplican el próximo mes de facturación (sin reembolsos a mitad de ciclo).",
      ],
    },
    playBilling: {
      title: "Facturación de juegos",
      description:
        "Cobrar el pago de sesiones de juego — reservadas y walk-in. Las sesiones llegan aquí automáticamente al terminar.",
      caps: [
        "En curso muestra reservas y walk-ins que están jugando ahora.",
        "Pendiente de pago lista sesiones terminadas — márquelas pagadas al cobrar.",
        "Editar tiempo, importe o aplicar un descuento porcentual antes del pago.",
      ],
    },
    sessions: {
      title: "Reservas",
      description:
        "Reservas de mesas, PCs, pistas y otras unidades — confirmar, registrar llegada y gestionar el día.",
      caps: [
        "Ver el horario de hoy y las reservas próximas.",
        "Crear, editar o cancelar reservas.",
        "Registrar llegada de invitados y liberar unidades al salir.",
      ],
    },
    orders: {
      title: "Pedidos del menú",
      description: "Seguir y cumplir pedidos del menú de invitados y de la sala.",
      caps: [
        "Ver pedidos abiertos y completados.",
        "Actualizar el estado mientras cocina y barra preparan.",
        "Revisar totales que alimentan finanzas.",
      ],
    },
    finance: {
      title: "Finanzas",
      description:
        "Resumen de ingresos, libro de transacciones, pérdidas e informes — no es donde se gestiona cocina o sala.",
      caps: [
        "Ver ingresos combinados de menú, juego y reservas (totales de solo lectura).",
        "Registrar ventas rápidas de mostrador y seguir pérdidas.",
        "Generar informes de 1–90 días con gráficos, impresión y exportación CSV.",
        "Pedidos del menú y facturación de juegos quedan en Operaciones; reservas en Reservas.",
      ],
    },
    staff: {
      title: "Cuentas de empleados",
      description: "Invitar personal, asignar roles y gestionar quién accede al panel.",
      caps: [
        "Crear inicios de sesión de empleados dentro del límite de asientos.",
        "Asignar permisos por rol.",
        "Desactivar el acceso cuando alguien deja el equipo.",
      ],
    },
    resources: {
      title: "Zona de juegos",
      description: "Estaciones, pistas, tarifas y configuración de ofertas para unidades jugables.",
      caps: [
        "Crear categorías para PCs, consolas, bolos y más.",
        "Definir tarifas que ven los invitados al reservar.",
        "Gestionar cuántas unidades hay disponibles.",
      ],
    },
    dining: {
      title: "Distribución del salón",
      description: "Mesas, plantas y plano de asientos para reservas y servicio.",
      caps: [
        "Organizar mesas por planta o zona.",
        "Definir capacidad para reservas por tamaño de grupo.",
        "Mantener el plano alineado con la disposición real.",
      ],
    },
    messages: {
      title: "Mensajes de invitados",
      description: "Chat y mensajes del formulario de contacto desde la página pública de su local.",
      caps: [
        "Responder al chat en vivo de invitados.",
        "Revisar envíos del formulario de contacto.",
        "Mantener las conversaciones de invitados en una bandeja.",
      ],
    },
  },
};

export const arLocaleBlocks: LocaleBlocks = {
  subscription: {
    title: "الاشتراك والميزات",
    paymentSubmitted:
      "تم إرسال الدفع. إذا كانت الوحدات لا تزال مقفلة، انتظر بضع ثوانٍ لاستلام الـ webhook — ثم حدّث الصفحة.",
    setupTrial:
      "اختر الميزات لـ {pack} واحفظ — تُفتح أقسام لوحة التحكم المطابقة. يمكنك تغييرها بحرية أثناء الفترة التجريبية.",
    setupPaid:
      "اختر الميزات أدناه لـ {pack}، احفظ، ثم ابدأ الفوترة عندما تكون جاهزًا. لا يُخصم شيء حتى ذلك الحين.",
    trialHeadline: "تجربة مجانية لمدة {days} يومًا · متبقٍ {left} {dayWord}",
    day: "يوم",
    days: "أيام",
    trialBody:
      "أضف/أزل الميزات في أي وقت — تتحدث الرؤية عند الحفظ. حتى {seats} مقاعد موظفين مجانًا مع حسابات الفريق. بعد {ends} يُطفأ كل شيء حتى تدفع ({price}/شهر) — بلا خصم بدون إتمام الدفع. بياناتك تبقى.",
    trialEndsFallback: "انتهاء التجربة",
    trialEndedTitle: "انتهت التجربة — الميزات متوقفة حتى الدفع",
    trialEndedBody:
      "عدّل خطتك أدناه إن لزم، ثم ابدأ الفوترة بمبلغ {price}/شهر. لا يُخصم شيء دون موافقتك. كل بياناتك ما زالت هنا وتعود عند إعادة تفعيل الميزات.",
    activeTrial: "تجربة نشطة",
    paidActive: "مدفوع · نشط",
    featuresTotal: "إجمالي الميزات {price}/شهر",
    staffSeats: " · مقاعد الموظفين {used}/{limit}",
    employeeSeatsNone: " · مقاعد الموظفين 0/0 (اشترِ من حسابات الفريق)",
    loadError: "تعذر تحميل الاشتراك.",
    venueType: "نوع المكان",
    venueTypeHintTrial:
      "مجاني. يوجّه الاقتراحات — ومع الميزات أدناه يحدّث رؤية لوحة التحكم عند الحفظ.",
    venueTypeHintPaid:
      "مجاني. يوجّه الاقتراحات — تعديلات النوع/الميزات في الخطة المدفوعة تسري الشهر التالي.",
    venueTypeHintDefault: "مجاني. يوجّه الاقتراحات.",
    featuresNeeded: "الميزات التي تحتاجها",
    featuresHintTrial:
      "أضف أو أزل في أي وقت أثناء التجربة. احفظ لتحديث رؤية الشريط الجانبي — تُحفظ البيانات حتى عند إيقاف ميزة.",
    featuresHintPaid:
      "تُجدول التعديلات لشهر الفوترة التالي. بلا استرداد في منتصف الدورة؛ البيانات تبقى إذا أوقفت شيئًا.",
    featuresHintDefault:
      "اختر ما ستدفع مقابله. لا يُخصم شيء حتى تبدأ الفوترة أدناه.",
    suggestedBanner:
      "مقترح لنوع مكانك — احفظ لفتح أقسام لوحة التحكم المطابقة.",
    suggested: "مقترح",
    perMo: "/شهر",
    perSeat: "/مقعد",
    payToUnlockTitle: "ادفع لفتح الوحدات",
    payToUnlockBody:
      "اختيارات ميزاتك محفوظة للدفع. أقسام الشريط الجانبي تبقى مخفية حتى ينجح الدفع ويعود الاشتراك نشطًا.",
    pendingTitle: "تغييرات مجدولة لشهر الفوترة التالي",
    pendingBody:
      "لقد دفعت هذه الفترة بالفعل — بلا استرداد أو تخفيض في منتصف الدورة. الميزات / المقاعد الجديدة تُطبَّق{when}{thenPrice}. الوصول الحالي يبقى حتى ذلك الحين. بياناتك لا تُحذف أبدًا.",
    pendingOn: " في {date}",
    pendingPeriodEnd: " عند نهاية الفترة",
    pendingThen: " · ثم {price}/شهر",
    checkoutReadyTitle: "الميزات جاهزة للدفع",
    checkoutReadyBody:
      "الاختيار المحفوظ{pricePart}. أكمل الدفع لفتح هذه الوحدات في لوحة التحكم.",
    checkoutPricePart: " · {price}/شهر",
    employeeSeats: "مقاعد الموظفين",
    seatsHintTrial:
      "مجانًا أثناء التجربة — بحد أقصى {max} تسجيلات دخول. بعد التجربة تشتري المقاعد ({price}/مقعد).",
    seatsHintPaid:
      "اختر عدد تسجيلات الدخول للشراء، ثم أنشئ الحسابات في الموظفين. {price} × مقاعد / شهر.",
    trialSeats: "تجربة · {used}/{max}",
    seatErrorTrial:
      "عيّن 1–{max} مقاعد موظفين، أو أوقف حسابات الفريق.",
    seatErrorPaid:
      "حدد عدد مقاعد الموظفين للشراء (واحد على الأقل)، أو أوقف حسابات الفريق.",
    saveError: "تعذر حفظ الميزات.",
    savedScheduled:
      "مجدول لشهر الفوترة التالي. الوصول الحالي دون تغيير حتى ذلك الحين.",
    savedOk: "تم الحفظ. حُدّثت رؤية الشريط الجانبي — حُفظت بياناتك.",
    scheduleNext: "جدولة للشهر القادم",
    saveFeatures: "حفظ الميزات",
    selectOne: "اختر ميزة واحدة على الأقل للمتابعة.",
    featureDetails: "تفاصيل الميزات",
    billingTitle: "الفوترة",
    billingBody:
      "المدفوعات عبر Lemon Squeezy (تاجر السجل) — دفع متعدد العملات، والضريبة/ضريبة القيمة المضافة تُدار لك. حزمتك + الإضافات: {price}/شهر.",
    billingManageHint:
      "أدِر طريقة الدفع أو الفواتير أو الإلغاء في بوابة Lemon Squeezy. تغييرات الحزمة التي تحفظها هنا تسري في فترة الفوترة التالية.",
    billingNotConfigured:
      "مفاتيح الفوترة غير مضبوطة بعد في واجهة البرمجة. أضف متغيرات LEMON_SQUEEZY_* لتفعيل الدفع.",
    manageBilling: "إدارة الفوترة",
    addPayment: "إضافة طريقة دفع",
    activate: "تفعيل الاشتراك",
    billingFailed: "فشل إجراء الفوترة.",
    viewOnlyFinance:
      "عرض فقط — اطلب من المسؤول صلاحية كتابة المعاملات لتحرير السجلات.",
  },
  pack: {
    gaming: {
      name: "مكان ألعاب",
      tagline: "محطات، حجوزات على خريطة حية، وفوترة اللعب.",
    },
    dining: {
      name: "مطعم",
      tagline: "طاولات، حجز رقمي، قائمة، وتذاكر المطبخ.",
    },
    bar: {
      name: "بار ولاونج",
      tagline: "قائمة، حجوزات خفيفة، ومبيعات عند الكاونتر.",
    },
    hotel_fb: {
      name: "فندق F&B",
      tagline: "تشغيل المطعم بالإضافة إلى مقاعد لفرق الفندق.",
    },
    mixed: {
      name: "مكان مختلط",
      tagline: "أرضية ألعاب ومطعم تحت سقف واحد.",
    },
  },
  addon: {
    ops_alerts: {
      name: "تنبيهات التشغيل والتدقيق والمراجعات",
      tagline: "إشعارات، سجل النشاط، وصندوق مراجعات الضيوف.",
      details:
        "يفتح الإشعارات وسجل التدقيق والمراجعات. تنبيهات الحجوزات وإجراءات الموظفين وتقييمات الضيوف في جناح تشغيل واحد — صفِّ المراجعات وأدِرها من لوحة التحكم.",
    },
    gaming_suite: {
      name: "جناح أرضية الألعاب",
      tagline: "التخطيط والإعداد وفوترة اللعب وحجوزات الألعاب.",
      details:
        "لأماكن الألعاب: صمّم خريطة الأرضية، اضبط المحطات/الطاولات، استقبل حجوزات الألعاب، وأدر فوترة اللعب / رسوم الجلسات من لوحة التحكم.",
    },
    menu_orders: {
      name: "القائمة وطلبات المطبخ",
      tagline: "كتالوج وأقسام وتذاكر المطبخ.",
      details:
        "ابنِ قوائم طعام ومشروبات، أدِر المخزون والأقسام، وعالج طلبات القائمة / تذاكر المطبخ. مثالي للمطاعم والبارات والمقاهي.",
    },
    dining_floor: {
      name: "أرضية المطعم والحجوزات",
      tagline: "تخطيط الطاولات وحجوزات المطعم.",
      details:
        "صمّم قاعات الطعام وتخطيطات الطاولات، ثم استقبل حجوزات المطعم وأدِرها. يعمل مع القائمة وطلبات المطبخ عند تقديم الطعام.",
    },
    venue_presence: {
      name: "صفحة المكان والاكتشاف",
      tagline: "صفحة عامة للمكان بالإضافة إلى الظهور في الدليل.",
      details:
        "انشر مكانك على GoSpots بصفحة عامة مخصصة، وافتح الإعلان / الموضع المروَّج في دليل الأماكن ليجدك المزيد من الضيوف.",
    },
    guest_chat: {
      name: "مراسلة الضيوف",
      tagline: "دردشة مباشرة مع الضيوف على صفحة مكانك.",
      details:
        "يبدأ الضيوف دردشة خاصة بأسلوب أوبر من صفحتك العامة، ينتظرون انضمام الموظف، ثم يراسلون في الوقت الفعلي. يمكن للموظفين الإيقاف أو الإنهاء أو إعادة الفتح أو الحذف؛ ويمكن للضيوف طلب الانتباه.",
    },
    team_accounts: {
      name: "حسابات الفريق",
      tagline: "مقاعد الموظفين — السعر لكل مقعد / شهر.",
      details:
        "اشترِ عدد مقاعد الموظفين الذي تحتاجه (يبدأ من 0). ثم أنشئ تسجيل دخول واحدًا لكل مقعد مع الأدوار والصلاحيات. كل مقعد لشخص واحد.",
    },
  },
  featureGate: {
    locked: "{title} مقفل",
    body:
      "هذه الوحدة غير مشمولة في حزمتك أو إضافاتك الحالية. افتح {feature} من الاشتراك لاستخدامها.",
    cta: "عرض الحزم والوحدات",
    labels: {
      notifications: "الإشعارات",
      audit: "سجل التدقيق",
      reviews: "المراجعات",
      resource: "الأرضية والإعداد",
      reservation: "الحجوزات",
      transaction: "المعاملات",
      reports: "التقارير",
      menu: "القائمة",
      marketing: "التسويق",
      messaging: "مراسلة الضيوف",
      roles: "الأدوار",
      memberships: "الفريق",
      notes: "ملاحظات الوردية",
    },
  },
  guide: {
    overview: {
      title: "نظرة عامة",
      description:
        "لقطة مباشرة لمكانك — الإشغال وإشارات الإيرادات وروابط سريعة للعمل اليومي.",
      caps: [
        "معرفة مدى ازدحام المكان الآن.",
        "الانتقال إلى الحجوزات أو الطلبات أو المالية من مكان واحد.",
        "التحقق من حالة الاشتراك والوقت المتبقي للتجربة.",
      ],
    },
    gallery: {
      title: "المعرض",
      description:
        "صورة الغلاف التسويقية وصور إضافية على صفحة مكانك العامة.",
      caps: [
        "رفع الغلاف الرئيسي المستخدم في التسويق والملف العام.",
        "إضافة صور المعرض التي يتصفحها العملاء على صفحتك.",
        "ترقية أي صورة في المعرض لتكون الغلاف التسويقي.",
      ],
    },
    menu: {
      title: "القائمة",
      description:
        "قائمة مكانك الحية — أقسام وعناصر وأسعار وفترات الوجبات ومخزون اختياري وصور يراها الضيوف.",
      caps: [
        "إنشاء أقسام للإفطار والغداء والعشاء أو ساعات مخصصة.",
        "إضافة عناصر مع وصف وسعر وصور.",
        "تتبع المخزون لكل عنصر عند بيع كميات محدودة.",
      ],
    },
    notes: {
      title: "ملاحظات الوردية",
      description:
        "اترك ملاحظات تسليم لمن يليك في الخدمة — العنوان والتفاصيل واليوم/الوقت ومدى الإلحاح.",
      caps: [
        "معرفة من كتب كل ملاحظة ودوره.",
        "تعيين الأهمية: معلومة أو عادية أو مهمة أو عاجلة.",
        "أرشفة الملاحظات عندما لم تعد مطلوبة.",
      ],
    },
    reviews: {
      title: "المراجعات",
      description:
        "تقييمات وتعليقات الضيوف من صفحة مكانك العامة. أخفِ أو احذف ما لا ينبغي أن يبقى عامًا.",
      caps: [
        "تصفح المراجعات مع اسم الضيف والتاريخ والتقييم والتعليق.",
        "التصفية حسب منشور أو مخفي.",
        "إخفاء مراجعة من الصفحة العامة أو نشرها مجددًا.",
        "حذف السبام أو المراجعات المسيئة نهائيًا.",
      ],
    },
    notifications: {
      title: "الإشعارات",
      description:
        "تنبيهات عن التجارب والاشتراكات والحجوزات والطاولات والفوترة وتسجيلات دخول الفريق.",
      caps: [
        "التصفية حسب التاريخ والقسم وحالة القراءة.",
        "وضع علامة مقروء أو غير مقروء، أو وضع الكل كمقروء.",
        "أرشفة المحدد أو كل ما يطابق التصفية.",
      ],
    },
    audit: {
      title: "سجل التدقيق",
      description:
        "سجل للتغييرات الحساسة — من فعل ماذا ومتى وفي أي منطقة من لوحة التحكم.",
      caps: [
        "التصفية حسب التاريخ أو القسم أو نوع الإجراء أو نص البحث.",
        "توسيع الإدخالات لرؤية التفاصيل التقنية.",
        "تصدير السجل إلى CSV للامتثال أو المراجعة الداخلية.",
      ],
    },
    subscription: {
      title: "الاشتراك والميزات",
      description:
        "ادفع فقط مقابل الميزات التي تحتفظ بها. لا يُخصم شيء دون بدء الدفع. إيقاف ميزة لا يحذف بياناتك أبدًا.",
      caps: [
        "تجربة مجانية — أضف/أزل الميزات في أي وقت؛ يتحدث الشريط الجانبي عند الحفظ.",
        "حتى 3 تسجيلات دخول للموظفين أثناء التجربة عند تفعيل حسابات الفريق.",
        "بعد التجربة: تبقى كل الميزات متوقفة حتى تدفع — بلا خصم تلقائي.",
        "في الخطة المدفوعة تسري تغييرات الميزات في شهر الفوترة التالي (بلا استرداد في منتصف الدورة).",
      ],
    },
    playBilling: {
      title: "فوترة الألعاب",
      description:
        "تحصيل دفع جلسات اللعب — المحجوزة والزائرون دون حجز. تنتقل الجلسات إلى هنا تلقائيًا عند انتهائها.",
      caps: [
        "قيد التنفيذ يعرض الحجوزات والزائرين الذين يلعبون الآن.",
        "بانتظار الدفع يسرد الجلسات المنتهية — ضع علامة مدفوع عند التحصيل.",
        "عدّل الوقت أو المبلغ أو طبّق خصمًا نسبيًا قبل الدفع.",
      ],
    },
    sessions: {
      title: "الحجوزات",
      description:
        "حجوزات الطاولات وأجهزة الكمبيوتر والمسارات والوحدات الأخرى — تأكيد وتسجيل وصول وإدارة اليوم.",
      caps: [
        "عرض جدول اليوم والحجوزات القادمة.",
        "إنشاء الحجوزات أو تعديلها أو إلغاؤها.",
        "تسجيل وصول الضيوف وتحرير الوحدات عند المغادرة.",
      ],
    },
    orders: {
      title: "طلبات القائمة",
      description: "تتبع وتنفيذ طلبات القائمة من الضيوف والأرضية.",
      caps: [
        "عرض الطلبات المفتوحة والمكتملة.",
        "تحديث حالة الطلب أثناء تحضير المطبخ والبار.",
        "مراجعة الإجماليات التي تغذي المالية.",
      ],
    },
    finance: {
      title: "المالية",
      description:
        "نظرة عامة على الإيرادات ودفتر المعاملات والخسائر والتقارير — وليس مكان تشغيل المطبخ أو الأرضية.",
      caps: [
        "عرض الإيرادات المجمعة من القائمة واللعب والحجوزات (مجاميع للقراءة فقط).",
        "تسجيل مبيعات الكاونتر السريعة وتتبع الخسائر.",
        "تشغيل تقارير من 1–90 يومًا مع رسوم بيانية وطباعة وتصدير CSV.",
        "طلبات القائمة وفوترة اللعب تبقى تحت العمليات؛ الحجوزات تحت الحجوزات.",
      ],
    },
    staff: {
      title: "حسابات الموظفين",
      description: "دعوة الموظفين وتعيين الأدوار وإدارة من يمكنه الوصول إلى لوحة التحكم.",
      caps: [
        "إنشاء تسجيلات دخول للموظفين ضمن حد المقاعد.",
        "تعيين الصلاحيات حسب الدور.",
        "تعطيل الوصول عندما يغادر شخص الفريق.",
      ],
    },
    resources: {
      title: "إعداد الألعاب",
      description: "المحطات والمسارات والتعريفات وإعداد العروض للوحدات القابلة للعب.",
      caps: [
        "إنشاء فئات لأجهزة الكمبيوتر والكونسول والبولينغ والمزيد.",
        "تعيين التعريفات التي يراها الضيوف عند الحجز.",
        "إدارة عدد الوحدات المتاحة.",
      ],
    },
    dining: {
      title: "تخطيط المطعم",
      description: "الطاولات والطوابق وتخطيط الجلوس للحجوزات والخدمة.",
      caps: [
        "تنظيم الطاولات حسب الطابق أو المنطقة.",
        "تعيين السعة لحجوزات حجم المجموعة.",
        "إبقاء مخطط الأرضية متوافقًا مع الجلوس الفعلي.",
      ],
    },
    messages: {
      title: "رسائل الضيوف",
      description: "دردشة ورسائل نموذج الاتصال من صفحة مكانك العامة.",
      caps: [
        "الرد على دردشة الضيوف المباشرة.",
        "مراجعة إرسالات نموذج الاتصال.",
        "الإبقاء على محادثات الضيوف في صندوق وارد واحد.",
      ],
    },
  },
};
