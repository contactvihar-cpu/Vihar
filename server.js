require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");
const { OAuth2Client } = require("google-auth-library");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 5000;

/* ===================== CORS ===================== */
app.use(
  cors({
    origin: ["http://localhost:3000", "https://your-frontend-domain.com"],
    credentials: true,
  })
);
app.use(express.json());

/* ===================== MONGO CONNECT ===================== */
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

/* ===================== OPENAI ===================== */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ===================== GOOGLE CLIENT ===================== */
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ===================== JWT CHECK ===================== */
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
  } catch (err) {
    console.error(err);
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

    res.json({ token, username, name: username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* ===================== GOOGLE LOGIN ===================== */
app.post("/api/google-auth", async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { email, name } = ticket.getPayload();

    let user = await User.findOne({ username: email });
    if (!user)
      user = await User.create({ username: email, authProvider: "google" });

    const token = jwt.sign(
      { id: user._id, username: email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, username: email, name });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ error: "Google login failed" });
  }
});

/* ===================== GEO HELPERS ===================== */
async function geocodePlace(place) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      place
    )}&limit=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "TravelPlannerApp/1.0 (your-email@example.com)",
      },
    });
    const data = await res.json();

    console.log("Geocode:", place, data.length ? data[0] : "No results");

    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (err) {
    console.error("Geocode error:", place, err);
    return null;
  }
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ===================== GENERATE PLAN (WITH 50 KM VALIDATION) ===================== */
app.post("/api/generate-plan", authenticateToken, async (req, res) => {
  const { startLocation, destination, days, interests, tripType } = req.body;

  try {
    const startCoords = await geocodePlace(startLocation);
    const destCoords = await geocodePlace(destination);

    if (!startCoords || !destCoords)
      return res.status(400).json({ error: "Unable to geocode locations" });

    /* === AI PROMPT ENFORCING 50 KM LIMIT === */
    const prompt = `
Generate a ${days}-day trip itinerary from ${startLocation} to ${destination}.
Trip type: ${tripType}
Interests: ${interests?.join(", ")}

RULES:
- Only include places within 50 km of **start** or **destination**.
- Never suggest Bangalore, Hyderabad, Chennai, or any distant places.
- Return **pure JSON** in this format:

{
  "places": [
    {
      "name": "Place Name",
      "reason": "Why visit",
      "lat": 12.34,
      "lon": 56.78
    }
  ],
  "plan": "Day by day itinerary text"
}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0].message.content;
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

    /* === Validate AI Provided Coordinates === */
    for (let place of parsed.places) {
      if (!place.lat || !place.lon) {
        const coords = await geocodePlace(place.name);
        if (coords) {
          place.lat = coords.lat;
          place.lon = coords.lon;
        }
      }
    }

    /* === Hard Filter 50 km === */
    parsed.places = parsed.places.filter((p) => {
      const d1 = getDistanceKm(startCoords.lat, startCoords.lon, p.lat, p.lon);
      const d2 = getDistanceKm(destCoords.lat, destCoords.lon, p.lat, p.lon);

      return d1 <= 50 || d2 <= 50;
    });

    if (!parsed.places.length)
      return res.status(400).json({
        error: "No valid places found within 50 km. Try different inputs.",
      });

    /* === SAVE Trip === */
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
    console.error("Trip Generation Error:", err);
    res.status(500).json({ error: "Failed to generate trip" });
  }
});

/* ===================== GET USER TRIPS ===================== */
app.get("/api/my-trips", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user.trips.reverse());
});

/* ===================== GET SINGLE TRIP ===================== */
app.get("/api/trip/:tripId", async (req, res) => {
  const users = await User.find({ "trips._id": req.params.tripId });
  if (!users.length) return res.status(404).json({ error: "Trip not found" });

  const trip = users[0].trips.id(req.params.tripId);
  res.json(trip);
});

/* ===================== SERVER RUN ===================== */
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
