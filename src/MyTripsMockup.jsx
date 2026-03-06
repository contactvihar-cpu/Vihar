import React from "react";
import Monkey from "./Monkey";


export default function MyTripsMockup() {
  return (
    <>
      <style>{`
        .phone-wrapper {
          width: 360px;
          animation: float 3s ease-in-out infinite;
        }

        .phone {
          width: 360px;
          height: 720px;
          background: #fff;
          border-radius: 40px;
          overflow: hidden;
          box-shadow: 0 30px 60px rgba(0,0,0,0.3);
          position: relative;
        }

        .header {
          background: #dff3ff;
          padding: 20px;
        }

        .header h2 {
          margin: 0 0 10px;
        }

        .tabs {
          display: flex;
          gap: 20px;
          font-size: 14px;
          color: #666;
        }

        .tabs span.active {
          color: #000;
          font-weight: bold;
        }

        .content {
          padding: 15px;
        }

        .tip {
          background: #f7f7f7;
          padding: 12px;
          border-radius: 12px;
          font-size: 13px;
          margin-bottom: 15px;
        }

        .trip-card {
          background: #e9efd9;
          border-radius: 18px;
          padding: 15px;
        }

        .trip-card h3 {
          margin: 0 0 8px;
        }

        .trip-card img {
          width: 100%;
          border-radius: 12px;
          margin-top: 10px;
        }

        .info {
          font-size: 13px;
          color: #444;
          margin-top: 6px;
        }

        .bottom-nav {
          position: absolute;
          bottom: 0;
          width: 100%;
          height: 60px;
          background: #fff;
          border-top: 1px solid #ddd;
          display: flex;
          justify-content: space-around;
          align-items: center;
          font-size: 13px;
        }

        @keyframes float {
          0% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0); }
        }
      `}</style>

      <div className="phone-wrapper">
        <div className="phone">

          {/* Header */}
          <div className="header">
            <h2>My Trips</h2>
            <div className="tabs">
              <span className="active">Upcoming</span>
              <span>Wishlist</span>
              <span>Recently Viewed</span>
            </div>
          </div>

          {/* Content */}
          <div className="content">
            <div className="tip">
              <strong>Tips for your trip</strong>
              <p>Make copies of important documents and keep them safe.</p>
            </div>

            <div className="trip-card">
              <h3>Tokyo</h3>
              <div className="info">📍 Tokyo Tower</div>
              <div className="info">🗓 Nov 24 – Dec 2</div>

              <Monkey />


              <div className="info">📍 Japan Jeju Island</div>
              <div className="info">👥  solo • Dec 6</div>
            </div>
          </div>

          {/* Bottom navigation */}
          <div className="bottom-nav">
            <span>Home</span>
            <span>Book</span>
            <span><b>My Trips</b></span>
            <span>Profile</span>
          </div>

        </div>
      </div>
    </>
  );
}
