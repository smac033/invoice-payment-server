const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
app.use(cors());
app.use(express.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

app.get("/health", (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Payment link server running on port " + port));
