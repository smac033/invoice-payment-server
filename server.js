const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
app.use(cors());
app.use(express.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const CALENDLY_TOKEN = process.env.CALENDLY_TOKEN;
const CALENDLY_BASE = "https://api.calendly.com";

async function calendlyFetch(path, options) {
  const res = await fetch(CALENDLY_BASE + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + CALENDLY_TOKEN,
      "Content-Type": "application/json",
      ...(options && options.headers),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Calendly request failed");
  return data;
}

app.get("/calendly_upcoming", async (req, res) => {
  try {
    if (!CALENDLY_TOKEN) return res.status(400).json({ error: "CALENDLY_TOKEN is not set on the server" });
    const me = await calendlyFetch("/users/me");
    const userUri = me.resource.uri;
    const events = await calendlyFetch(
      "/scheduled_events?user=" + encodeURIComponent(userUri) +
      "&min_start_time=" + new Date().toISOString() +
      "&sort=start_time:asc&status=active&count=20"
    );
    const list = events.collection.map((ev) => ({
      name: ev.name,
      start: ev.start_time,
      end: ev.end_time,
      location: ev.location && ev.location.location ? ev.location.location : (ev.location ? ev.location.type : ""),
    }));
    res.json({ events: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/calendly_event_types", async (req, res) => {
  try {
    if (!CALENDLY_TOKEN) return res.status(400).json({ error: "CALENDLY_TOKEN is not set on the server" });
    const me = await calendlyFetch("/users/me");
    const userUri = me.resource.uri;
    const types = await calendlyFetch("/event_types?user=" + encodeURIComponent(userUri) + "&active=true");
    const list = types.collection.map((t) => ({ uri: t.uri, name: t.name, duration: t.duration }));
    res.json({ eventTypes: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/calendly_booking_link", async (req, res) => {
  try {
    if (!CALENDLY_TOKEN) return res.status(400).json({ error: "CALENDLY_TOKEN is not set on the server" });
    const { eventTypeUri } = req.body;
    if (!eventTypeUri) return res.status(400).json({ error: "eventTypeUri is required" });
    const link = await calendlyFetch("/scheduling_links", {
      method: "POST",
      body: JSON.stringify({ max_event_count: 1, owner: eventTypeUri, owner_type: "EventType" }),
    });
    res.json({ url: link.resource.booking_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/create_payment_link", async (req, res) => {
  try {
    const { name, amount, currency } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "A valid amount is required" });
    }

    const price = await stripe.prices.create({
      unit_amount: Math.round(Number(amount) * 100),
      currency: (currency || "nzd").toLowerCase(),
      product_data: { name: name || "Invoice payment" },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
    });

    res.json({ url: link.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const CAL_API_KEY = process.env.CAL_API_KEY;
const CALCOM_BASE = "https://api.cal.com/v1";

async function calcomFetch(path) {
  if (!CAL_API_KEY) throw new Error("CAL_API_KEY is not set on the server");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(CALCOM_BASE + path + sep + "apiKey=" + encodeURIComponent(CAL_API_KEY));
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Cal.com request failed");
  return data;
}

app.get("/calcom_upcoming", async (req, res) => {
  try {
    const data = await calcomFetch("/bookings?status=upcoming");
    const list = (data.bookings || []).map((b) => ({
      name: b.title,
      start: b.startTime,
      end: b.endTime,
      location: b.location || "",
    }));
    res.json({ events: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/calcom_event_types", async (req, res) => {
  try {
    const me = await calcomFetch("/me");
    const username = me.username;
    const data = await calcomFetch("/event-types");
    const list = (data.event_types || []).map((t) => ({
      uri: username + "/" + t.slug,
      name: t.title,
      duration: t.length,
    }));
    res.json({ eventTypes: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/calcom_booking_link", async (req, res) => {
  try {
    const { eventTypeUri } = req.body;
    if (!eventTypeUri) return res.status(400).json({ error: "eventTypeUri is required" });
    res.json({ url: "https://cal.com/" + eventTypeUri });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Payment link server running on port " + port));
