// ======================== IMPORTS ============================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");
const fetch = require("node-fetch");
const { OAuth2Client } = require("google-auth-library");

// ======================== APP SETUP ==========================
const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

app.use(express.json());

// ======================== MONGODB ============================
mongoose
  .connect(process.env.MONGODB_URI, { dbName: "travelPlanner" })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ======================== USER SCHEMA ========================
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  passwordHash: String,
  authProvider: { type: String, enum: ["local", "google"], default: "local" },
  trips: [
    {
      startLocation: String,
      destination: String,
      days: Number,
      interests: [String],
      plan: Object,
      tripType: {
        type: String,
        enum: ["family", "friends", "business"],
        default: "friends",
      },
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

const User = mongoose.model("User", UserSchema);

// ======================== OPENAI =============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ======================== GOOGLE AUTH ========================
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ======================== JWT AUTH ===========================
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

// ======================== REGISTER ===========================
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const hash = await bcrypt.hash(password, 10);

    await User.create({
      username,
      passwordHash: hash,
      authProvider: "local",
    });

    res.json({ message: "User registered" });
  } catch (err) {
    res.status(400).json({ error: "User already exists" });
  }
});

// ======================== LOGIN ==============================
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });

  if (!user || user.authProvider !== "local")
    return res.status(401).json({ error: "Invalid username" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Wrong password" });

  const token = jwt.sign({ id: user._id, username }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({ token, username });
});

// ======================== GOOGLE LOGIN =======================
app.post("/api/google-auth", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Missing token" });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;

    let user = await User.findOne({ username: email });

    if (!user) {
      user = await User.create({
        username: email,
        authProvider: "google",
      });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      username: user.username,
      name: payload.name,
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ error: "Google login failed" });
  }
});

// ======================== DISTANCE CALC ======================
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ======================== GEOAPIFY GEOCODE ===================
const geoCache = {};

async function geocode(place) {
  try {
    if (geoCache[place]) return geoCache[place];

    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
      place
    )}&format=json&apiKey=${process.env.GEOAPIFY_KEY}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results || !data.results.length) return null;

    const loc = {
      lat: data.results[0].lat,
      lon: data.results[0].lon,
      state: data.results[0].state,
      city: data.results[0].city,
    };

    geoCache[place] = loc;
    return loc;
  } catch (err) {
    console.error("Geocode failed:", err);
    return null;
  }
}

// ======================== GENERATE TRIP PLAN ================
app.post("/api/generate-plan", authenticateToken, async (req, res) => {
  const { startLocation, destination, days, interests, tripType } = req.body;

  if (!startLocation || !destination || !days)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const startGeo = await geocode(startLocation);
    const destGeo = await geocode(destination);

    if (!startGeo || !destGeo)
      return res.status(400).json({ error: "Invalid locations" });

    const prompt = `
Create a ${days}-day trip from ${startLocation} to ${destination}.
Interests: ${interests?.join(", ") || "general"}
Trip Type: ${tripType}

Return JSON only:
{
 "places":[{"name":"Place","reason":"Why"}],
 "plan":"Full itinerary"
}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0].message.content;
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

    // FILTER: Only places near start or destination
    const valid = [];

    for (const p of parsed.places) {
      const geo = await geocode(p.name);
      if (!geo) continue;

      const nearStart = getDistanceKm(
        geo.lat,
        geo.lon,
        startGeo.lat,
        startGeo.lon
      );

      const nearDest = getDistanceKm(
        geo.lat,
        geo.lon,
        destGeo.lat,
        destGeo.lon
      );

      if (nearStart <= 50 || nearDest <= 50) valid.push(p);
    }

    parsed.places = valid;

    // SAVE TRIP
    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        trips: {
          startLocation,
          destination,
          days,
          interests,
          plan: parsed,
          tripType,
        },
      },
    });

    res.json(parsed);
  } catch (err) {
    console.error("Trip generation error:", err);
    res.status(500).json({ error: "Failed to generate plan" });
  }
});

// ======================== GET USER TRIPS =====================
app.get("/api/my-trips", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user.trips || []);
});

// ======================== START SERVER =======================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
