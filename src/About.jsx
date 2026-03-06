import "./About.css";

export default function About() {
  return (
    <div className="about-wrapper">
      <div className="about-card">
        <h2>About Smart Travel Planner</h2>

        <p>
          Smart Travel Planner is an AI-powered platform built by the
          <strong> Ignite Crew </strong>
          to simplify modern travel planning. The system generates intelligent,
          personalized itineraries based on user preferences, trip duration,
          and destinations.
        </p>

        <section>
          <h3>Our Mission</h3>
          <p>
            To make travel planning seamless, visual, and intelligent — helping
            travelers focus more on experiences and less on logistics.
          </p>
        </section>

        <section>
          <h3>What Makes It Special?</h3>
          <ul>
            <li>AI-powered day-by-day itinerary generation</li>
            <li>Interactive maps with route visualization</li>
            <li>Satellite and place-level insights</li>
            <li>Favorites and trip history management</li>
          </ul>
        </section>

        <section>
          <h3>Technology Stack</h3>
          <ul>
            <li>⚛️ React for frontend</li>
            <li>🟢 Node.js & Express backend</li>
            <li>🧠 AI-based itinerary engine</li>
            <li>🗺️ Maps & route visualization</li>
          </ul>
        </section>

        <section>
          <h3>Built For</h3>
          <p>
            Solo travelers, families, groups, and professionals looking for
            fast, reliable, and smart travel planning.
          </p>
        </section>
      </div>
    </div>
  );
}