import React from "react";
import monkeyImg from "./monkey.jpeg"; // correct path

export default function Monkey() {
  return (
    <>
      <style>{`
        .monkey-wrapper {
          width: 100%;
          margin-top: 10px;
        }

        .monkey-image {
          width: 100%;
          height: 160px;
          object-fit: cover;
          border-radius: 14px;
        }
      `}</style>

      <div className="monkey-wrapper">
        <img
          src={monkeyImg}
          alt="Monkey Forest"
          className="monkey-image"
        />
      </div>
    </>
  );
}
