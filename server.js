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

app.use(
  cors({
    origin: ["http://localhost:3000"], // Adjust as needed for frontend origin
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

/* ===================== JWT MIDDLEWARE ===================== */
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
    res.status(400).json({ error: "User already exists or invalid data" });
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

/* ===================== GOOGLE AUTH ===================== */
app.post("/api/google-auth", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Missing token" });

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

/* ===================== DISTANCE UTILS ===================== */
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

/* ===================== GEOCODING HELPER ===================== */
async function geocodePlace(place) {
  try {
    if (!place || typeof place !== "string") {
      throw new Error("Invalid place parameter");
    }

    // Sanitize place: trim and remove trailing dots/commas
    const sanitizedPlace = place.trim().replace(/[.,]$/, "");

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      sanitizedPlace
    )}&limit=1`;

    const res = await fetch(url, {
      headers: {
        // Replace with your app name and contact email per Nominatim usage policy
        "User-Agent": "TravelPlannerApp/1.0 (contact@gmail.com)",
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim HTTP error: ${res.status}`);
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`No results found for place "${sanitizedPlace}"`);
    }

    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch (e) {
    console.error("Geocoding error for", place, e.message || e);
    return null;
  }
}

/* ===================== GENERATE TRIP PLAN ===================== */
app.post("/api/generate-plan", authenticateToken, async (req, res) => {
  const { startLocation, destination, days, interests, tripType } = req.body;

  if (!startLocation || !destination || !days)
    return res.status(400).json({ error: "Missing fields" });

  try {
    // 1. Geocode start and destination for lat/lon
    const startCoords = await geocodePlace(startLocation);
    const destCoords = await geocodePlace(destination);

    if (!startCoords || !destCoords) {
      return res
        .status(400)
        .json({ error: "Failed to geocode start or destination" });
    }

    // 2. Prompt OpenAI
    const prompt = `
Create a ${days}-day trip from ${startLocation} to ${destination}.
Trip type: ${tripType}
Interests: ${interests?.join(", ") || "general"}

Return JSON ONLY in this format:
{
  "places": [
    {
      "name": "Place name",
      "reason": "Reason to visit",
      "lat": 12.3456,
      "lon": 78.9012
    }
  ],
  "plan": "Detailed itinerary as a string"
}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0].message.content;

    // Extract JSON substring (assumes response contains JSON)
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

    // 3. Fill missing lat/lon with geocoding
    for (let place of parsed.places) {
      if (
        typeof place.lat !== "number" ||
        typeof place.lon !== "number" ||
        isNaN(place.lat) ||
        isNaN(place.lon)
      ) {
        const coords = await geocodePlace(place.name);
        if (coords) {
          place.lat = coords.lat;
          place.lon = coords.lon;
        } else {
          console.warn(`No coords found for place: ${place.name}`);
        }
      }
    }

    // 4. Filter places within 100km of start OR destination
    parsed.places = parsed.places.filter((p) => {
      if (
        typeof p.lat !== "number" ||
        typeof p.lon !== "number" ||
        isNaN(p.lat) ||
        isNaN(p.lon)
      )
        return false;

      const distToStart = getDistanceKm(
        startCoords.lat,
        startCoords.lon,
        p.lat,
        p.lon
      );
      const distToDest = getDistanceKm(destCoords.lat, destCoords.lon, p.lat, p.lon);

      return distToStart <= 100 || distToDest <= 100;
    });

    // 5. Save filtered trip to user
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

app.get("/", (req, res) => {
  res.send("Hello! The server is running.");
});

/* ===================== GET USER TRIPS ===================== */
app.get("/api/my-trips", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user.trips.reverse());
  } catch (err) {
    console.error("Get trips error:", err);
    res.status(500).json({ error: "Failed to get trips" });
  }
});

/* ===================== GET SINGLE TRIP BY ID ===================== */
app.get("/api/trip/:tripId", async (req, res) => {
  try {
    const users = await User.find({ "trips._id": req.params.tripId });
    if (!users.length) return res.status(404).json({ error: "Trip not found" });

    const trip = users[0].trips.id(req.params.tripId);
    res.json(trip);
  } catch (err) {
    console.error("Get trip error:", err);
    res.status(500).json({ error: "Failed to get trip" });
  }
});

/* ===================== SERVER START ===================== */
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
