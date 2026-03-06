import React, { useState } from "react";
import "./Contact.css";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [status, setStatus] = useState(null);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);

    if (!formData.name || !formData.email || !formData.message) {
      setStatus({ error: "Please fill all fields." });
      return;
    }

    try {
      const res = await fetch("https://vihar-email.onrender.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus({ success: data.message });
        setFormData({ name: "", email: "", message: "" });
      } else {
        setStatus({ error: data.error || "Something went wrong." });
      }
    } catch {
      setStatus({ error: "Failed to send message." });
    }
  };

  return (
    <div className="contact-page">
      <div className="contact-card">
        <h2>Contact Us</h2>
        <p className="subtitle">
          Have questions, feedback, or partnership ideas? Reach out to us below:
        </p>

        <form onSubmit={handleSubmit}>
          <input
            name="name"
            type="text"
            placeholder="Your Name"
            value={formData.name}
            onChange={handleChange}
          />
          <input
            name="email"
            type="email"
            placeholder="Your Email"
            value={formData.email}
            onChange={handleChange}
          />
          <textarea
            name="message"
            placeholder="Your Message"
            rows={5}
            value={formData.message}
            onChange={handleChange}
          />
          <button type="submit">Send Message</button>
        </form>

        {status?.success && <p className="success">{status.success}</p>}
        {status?.error && <p className="error">{status.error}</p>}

        <div className="contact-info">
          <h3>Other Ways to Reach Us</h3>
          <p>Email: contactvihar@gmail.com</p>
          <p>Phone: +91 98765 43210</p>
          <p>Instagram: @smarttravelplanner</p>
        </div>
      </div>
    </div>
  );
}