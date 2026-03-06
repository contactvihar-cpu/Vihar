import React, { useState, useEffect, useRef, useCallback } from "react";
import { FaMicrophone } from "react-icons/fa";
import "./Planner.css";

/* ================= SPEECH RECOGNITION HOOK ================= */
function useSpeechToText(onResult) {
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Speech Recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      // Append spoken text to existing value
      onResult((prev) => `${prev ? `${prev} ` : ""}${transcript}`);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognitionRef.current && recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, [onResult]);

  const startListening = () => {
    try {
      if (!recognitionRef.current) {
        alert("Speech Recognition is not supported in your browser.");
        return;
      }
      recognitionRef.current.start();
    } catch (error) {
      console.error("Speech recognition start error:", error);
    }
  };

  return startListening;
}

/* ================= LINKIFY ================= */
function LinkifyText({ text }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = String(text).split(urlRegex);

  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/* ================= INPUT FIELD WITH MIC ================= */
function Input({ label, value, set, type = "text", placeholder, showMic = true }) {
  const speechToText = useSpeechToText(set);

  return (
    <div className="input-box">
      <label>{label}</label>
      <div className="input-mic-row">
        <input
          type={type}
          value={value}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
          className="small-input"
          autoComplete="off"
        />
        {showMic && (
          <button
            type="button"
            className="mic-btn"
            onClick={speechToText}
            aria-label={`Speak ${label}`}
          >
            <FaMicrophone size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ================= ITINERARY PARSER ================= */
function parseDayByDay(planText) {
  if (!planText || typeof planText !== "string") return [];

  // Matches "Day X:" at the start of a line or after a newline
  const dayHeaderRegex = /(Day\s+\d+:)/g;
  // Split by headers but keep content segments aligned
  const segments = planText.split(dayHeaderRegex).filter(Boolean);

  // segments will look like: [prelude?, "Day 1:", "content1", "Day 2:", "content2", ...]
  // Normalize to pairs of [header, content]
  const pairs = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (/^Day\s+\d+:$/.test(seg)) {
      const content = segments[i + 1] || "";
      pairs.push([seg, content.trim()]);
      i++; // skip content next iteration
    }
  }

  // If headers array is empty, fallback to a single block
  if (!pairs.length && planText.trim()) {
    return [
      {
        day: 1,
        title: "Itinerary",
        description: planText.trim(),
      },
    ];
  }

  return pairs.map(([header, content], idx) => {
    const dayNum = Number((header.match(/\d+/) || [idx + 1])[0]);
    const title = header.replace("Day ", "").replace(":", "");
    return {
      day: dayNum,
      title,
      description: content,
    };
  });
}

/* ================= MAIN PLANNER COMPONENT ================= */
export default function Planner({ user, onAuthError }) {
  const [startLocation, setStartLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [days, setDays] = useState("");
  const [interests, setInterests] = useState("");
  const [tripType, setTripType] = useState("friends");

  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [favorites, setFavorites] = useState([]);
  const [tripHistory, setTripHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const handleUnauthorized = useCallback(() => {
    setError("Session expired. Please login again.");
    if (typeof onAuthError === "function") {
      onAuthError();
    }
  }, [onAuthError]);

  /* Load Favorites */
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("favorites") || "[]");
      setFavorites(stored);
    } catch {
      setFavorites([]);
    }
  }, []);

  /* Load Trip History from backend */
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch("https://vihar-vg29.onrender.com/api/my-trips", {
          headers: { Authorization: `Bearer ${user?.token || ""}` },
        });

        if (res.ok) {
          const data = await res.json();
          const sorted = Array.isArray(data)
            ? data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            : [];
          setTripHistory(sorted);
        } else if (res.status === 401 || res.status === 403) {
          handleUnauthorized();
        } else {
          console.warn("Failed to fetch trip history");
        }
      } catch (err) {
        console.error("History fetch error:", err);
      }
    }
    if (user?.token) loadHistory();
  }, [user?.token, handleUnauthorized]);

  /* Toggle Favorite */
  function toggleFavorite(place) {
    const updated = favorites.some((f) => f.name === place.name)
      ? favorites.filter((f) => f.name !== place.name)
      : [...favorites, place];

    setFavorites(updated);
    try {
      localStorage.setItem("favorites", JSON.stringify(updated));
    } catch {}
  }

  /* Generate Plan */
  async function handleGeneratePlan() {
    if (!startLocation || !destination || !days) {
      setError("Please fill all fields");
      return;
    }

    setLoading(true);
    setError("");
    setPlan(null);

    try {
      const res = await fetch(
  "https://vihar-vg29.onrender.com/api/generate-plan",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user?.token || ""}`,
    },
    body: JSON.stringify({
      startLocation,
      destination,
      days: Number(days),
      interests: interests.split(",").map(i => i.trim()),
      tripType,
    }),
  }
);


      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          handleUnauthorized();
          setLoading(false);
          return;
        }
        setError(data?.error || "Failed to generate plan");
        setLoading(false);
        return;
      }

      setPlan(data);

      const points = [
        { name: startLocation, type: "start" },
        ...(Array.isArray(data.places) ? data.places : []).map((p) => ({
          name: p.name,
          type: "stop",
        })),
        { name: destination, type: "end" },
      ];

      try {
        localStorage.setItem("tripPoints", JSON.stringify(points));
      } catch {}

      const newRecord = {
        startLocation,
        destination,
        days,
        interests,
        tripType,
        createdAt: new Date().toISOString(),
      };

      setTripHistory((prev) => [newRecord, ...(prev || [])]);
    } catch (e) {
      console.error("Generate plan error:", e);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="planner-container">
      <h2>✈️ Travel Planner</h2>

      <div className="form-box">
        <Input
          label="Start Location"
          value={startLocation}
          set={setStartLocation}
          placeholder="Speak or type the city name"
        />
        <Input
          label="Destination"
          value={destination}
          set={setDestination}
          placeholder="Speak or type the city name"
        />
        <Input
          label="Number of Days"
          type="number"
          value={days}
          set={setDays}
          placeholder="Enter number of days"
          showMic={false}
        />
        <Input
          label="Interests (comma separated)"
          value={interests}
          set={setInterests}
          placeholder="food, temples, nature"
        />

        <label>Trip Type</label>
        <select value={tripType} onChange={(e) => setTripType(e.target.value)}>
          <option value="family">Family</option>
          <option value="friends">Friends</option>
          <option value="business">Business</option>
        </select>

        <button
          className="generate-btn"
          onClick={handleGeneratePlan}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Plan"}
        </button>

        {error && <p className="error-text">{error}</p>}
      </div>

      {favorites.length > 0 && (
        <div className="favorites-box">
          <h3>⭐ Your Favourites</h3>
          {favorites.map((place, i) => (
            <div key={i} className="favorite-item">
              <strong>{place.name}</strong>
              {place.reason && <p>{place.reason}</p>}
              <button
                className="fav-btn active"
                onClick={() => toggleFavorite(place)}
              >
                ✕ Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {plan && (
        <div className="result-box">
          <h3>📍 Suggested Places</h3>
          {Array.isArray(plan.places) && plan.places.length ? (
            plan.places.map((p, i) => (
              <div key={i} className="place-item">
                <strong>{p.name}</strong>
                <p>{p.reason}</p>
                <button
                  className={
                    favorites.some((f) => f.name === p.name)
                      ? "fav-btn active"
                      : "fav-btn"
                  }
                  onClick={() => toggleFavorite(p)}
                >
                  {favorites.some((f) => f.name === p.name) ? "★ Saved" : "☆ Save"}
                </button>
              </div>
            ))
          ) : (
            <p>No places found</p>
          )}

          <h3>🗓 Itinerary</h3>
          {plan.plan && typeof plan.plan === "string" ? (
            parseDayByDay(plan.plan).map((day, i) => (
              <div key={i} className="day-box">
                <h4>
                  Day {day.day}: {day.title}
                </h4>
                <p>
                  <LinkifyText text={day.description} />
                </p>
              </div>
            ))
          ) : Array.isArray(plan.plan?.day_by_day_itinerary) ? (
            plan.plan.day_by_day_itinerary.map((day, i) => (
              <div key={i} className="day-box">
                <h4>
                  Day {day.day}: {day.title}
                </h4>
                <p>
                  <LinkifyText text={day.description} />
                </p>
              </div>
            ))
          ) : (
            <p>No itinerary available</p>
          )}
        </div>
      )}

      {tripHistory.length > 0 && (
        <div className="history-box">
          <button
            className="history-toggle"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? "Hide Trip History ▲" : "Show Trip History ▼"}
          </button>

          {showHistory && (
            <ul>
              {tripHistory.map((t, i) => (
                <li key={i}>
                  {t.startLocation} → {t.destination} ({t.days} days)
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
