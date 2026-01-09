require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");
const { OAuth2Client } = require("google-auth-library");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 5000;

/* ===================== MIDDLEWARE ===================== */
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);
app.use(express.json());

/* ===================== MONGODB ===================== */
mongoose
  .connect(process.env.MONGODB_URI, { dbName: "travelPlanner" })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

/* ===================== USER SCHEMA ===================== */
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  passwordHash: String,
  authProvider: {
    type: String,
    enum: ["local", "google"],
    default: "local",
  },
  trips: [
    {
      startLocation: String,
      destination: String,
      days: Number,
      interests: [String],
      tripType: String,
      plan: Object,
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

const User = mongoose.model("User", UserSchema);

/* ===================== OPENAI ===================== */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ===================== GOOGLE AUTH ===================== */
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ===================== JWT ===================== */
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

/* ===================== AUTH ROUTES ===================== */
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, passwordHash: hash });
    res.json({ message: "Registered" });
  } catch {
    res.status(400).json({ error: "User already exists" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, username });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/google-auth", async (req, res) => {
  try {
    const { credential } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { email, name } = ticket.getPayload();
    let user = await User.findOne({ username: email });

    if (!user) {
      user = await User.create({
        username: email,
        authProvider: "google",
      });
    }

    const token = jwt.sign(
      { id: user._id, username: email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, username: email, name });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Google login failed" });
  }
});

/* ===================== GEO UTILS ===================== */
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodePlace(place) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    place
  )}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "travel-planner-app" },
  });
  const data = await res.json();
  if (!data.length) return null;

  return {
    name: place,
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
  };
}

/* === CHECK IF PLACE IS ON ROUTE === */
function isBetweenRoute(place, start, end, buffer = 1.5) {
  const minLat = Math.min(start.lat, end.lat) - buffer;
  const maxLat = Math.max(start.lat, end.lat) + buffer;
  const minLng = Math.min(start.lng, end.lng) - buffer;
  const maxLng = Math.max(start.lng, end.lng) + buffer;

  return (
    place.lat >= minLat &&
    place.lat <= maxLat &&
    place.lng >= minLng &&
    place.lng <= maxLng
  );
}

function sortAlongRoute(places, start) {
  return places.sort(
    (a, b) =>
      getDistanceKm(start.lat, start.lng, a.lat, a.lng) -
      getDistanceKm(start.lat, start.lng, b.lat, b.lng)
  );
}

/* ===================== GENERATE PLAN ===================== */
app.post("/api/generate-plan", authenticateToken, async (req, res) => {
  const { startLocation, destination, days, interests, tripType } = req.body;

  try {
    const startGeo = await geocodePlace(startLocation);
    const endGeo = await geocodePlace(destination);

    if (!startGeo || !endGeo) {
      return res.status(400).json({
        error: "Please provide both start and destination coordinates",
      });
    }

    const prompt = `
You are a ROUTE-AWARE travel planner.

Start: ${startLocation} (${startGeo.lat}, ${startGeo.lng})
End: ${destination} (${endGeo.lat}, ${endGeo.lng})
Days: ${days}

Rules:
- Suggest places ONLY between start and destination
- DO NOT suggest cities outside route
- Avoid detours like Chennai for Tirupati→Mumbai

Return JSON ONLY:
{
  "places":[
    { "name":"", "reason":"", "lat":0, "lon":0 }
  ],
  "plan":"Day 1 to Day ${days} itinerary"
}
`;

    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const raw = ai.choices[0].message.content;
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

    let places = (parsed.places || [])
      .filter(
        (p) =>
          typeof p.lat === "number" &&
          typeof p.lon === "number" &&
          isBetweenRoute({ lat: p.lat, lng: p.lon }, startGeo, endGeo)
      )
      .map((p) => ({
        name: p.name,
        reason: p.reason,
        lat: p.lat,
        lng: p.lon,
      }));

    places = sortAlongRoute(places, startGeo);

    const finalPlan = {
      start: startGeo,
      destination: endGeo,
      places,
      plan: parsed.plan,
    };

    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        trips: {
          startLocation,
          destination,
          days,
          interests,
          tripType,
          plan: finalPlan,
        },
      },
    });

    res.json(finalPlan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate plan" });
  }
});

/* ===================== TRIPS ===================== */
app.get("/api/my-trips", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user?.trips?.reverse() || []);
});

/* ===================== START SERVER ===================== */
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});