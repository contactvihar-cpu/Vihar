import React, { useEffect, useState, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  LayersControl,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

// Patch Leaflet Routing Machine to prevent errors
if (L.Routing && L.Routing.Control) {
  L.Routing.Control.prototype._clearLines = function () {
    try {
      if (this._map && this._line) {
        this._map.removeLayer(this._line);
      }
    } catch {}
  };
}

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Unsplash key
const UNSPLASH_ACCESS_KEY = "_UzLYje2Sb916Mrfss-LLo8UBBEwn8h1AjSmrGgSMCE";

// Fetch image for a place
async function fetchPlaceImage(place) {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        place
      )}&client_id=${UNSPLASH_ACCESS_KEY}&per_page=1`
    );
    const data = await res.json();
    if (data.results?.length) return data.results[0].urls.small;
  } catch {}
  return "https://via.placeholder.com/80?text=No+Img";
}

// Numbered marker icon
const createNumberedIcon = (n) =>
  L.divIcon({
    html: `
      <div style="
        background:#2A93EE;
        color:white;
        border-radius:50%;
        width:30px;
        height:30px;
        line-height:30px;
        text-align:center;
        font-weight:bold;
        border:2px solid white;
        box-shadow: 0 0 3px rgba(0,0,0,0.5);
      ">${n}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
    className: "",
  });

// Routing component
function Routing({ points }) {
  const map = useMap();
  const ref = useRef(null);

  useEffect(() => {
    if (!map || points.length < 2) return;

    if (ref.current) map.removeControl(ref.current);

    ref.current = L.Routing.control({
      waypoints: points.map((p) => L.latLng(p.lat, p.lon)),
      addWaypoints: false,
      draggableWaypoints: false,
      show: false,
      createMarker: () => null,
      lineOptions: { styles: [{ color: "#2A93EE", weight: 4 }] },
      showAlternatives: true,
      altLineOptions: {
        styles: [{ color: "gray", opacity: 0.7, weight: 4, dashArray: "5,10" }],
      },
    }).addTo(map);

    return () => ref.current && map.removeControl(ref.current);
  }, [map, points]);

  return null;
}

export default function Map() {
  const [points, setPoints] = useState([]);
  const [images, setImages] = useState({});
  const [loading, setLoading] = useState(true);

  async function geocode(place) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          place
        )}`
      );
      const data = await res.json();
      if (!data.length) return null;
      return { name: place, lat: +data[0].lat, lon: +data[0].lon };
    } catch {
      return null;
    }
  }

  useEffect(() => {
    async function load() {
      const storedPoints = JSON.parse(localStorage.getItem("tripPoints") || "[]");
      if (!storedPoints.length) return setLoading(false);

      const geoPoints = (
        await Promise.all(
          storedPoints.map(async (p) => {
            const geo = await geocode(p.name);
            return geo ? { ...p, ...geo } : null;
          })
        )
      ).filter(Boolean);

      setPoints(geoPoints);

      const imgs = await Promise.all(
        geoPoints.map((p) => fetchPlaceImage(p.name))
      );

      const map = {};
      geoPoints.forEach((p, i) => (map[p.name] = imgs[i]));
      setImages(map);

      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p>Loading map…</p>;
  if (!points.length) return <p>No valid trip points found.</p>;

  return (
    <>
      {/* ✅ TOP TEXT (ONLY ADDITION) */}
      <p
        style={{
          textAlign: "center",
          margin: "10px 0",
          fontWeight: "600",
        }}
      >
        Showing route for your generated travel plan
      </p>

      {/* Tooltip CSS */}
      <style>{`
        .leaflet-tooltip.custom-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
      `}</style>

      {/* MAP (UNCHANGED) */}
      <MapContainer
        center={[points[0].lat, points[0].lon]}
        zoom={6}
        style={{ height: "100vh", width: "100%" }}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Normal Map">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Satellite View">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Dark Mode">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <Routing points={points} />

        {points.map((p, i) => (
          <Marker
            key={i}
            position={[p.lat, p.lon]}
            icon={createNumberedIcon(i + 1)}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -70]}
              className="custom-tooltip"
            >
              <div style={{ textAlign: "center" }}>
                <img
                  src={images[p.name] || "https://via.placeholder.com/80"}
                  alt={p.name}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    objectFit: "cover",
                    marginBottom: 6,
                  }}
                />
                <div style={{ fontWeight: "bold" }}>{p.name}</div>
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </>
  );
}