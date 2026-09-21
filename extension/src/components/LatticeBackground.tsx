import React from 'react';

/**
 * LatticeBackground
 * Damascus lattice background with scattered twinkling keys that perfectly
 * align with the base pattern grid.
 * - ZERO duplicates: Each twinkling key shares the exact mathematical coordinates
 *   of the repeating pattern tile below it.
 * - Smooth, gentle breathing animation (3.6s - 5.2s) with seamless fade in & out.
 */
export const LatticeBackground: React.FC = () => {
  return (
    <div className="us-lattice-container" aria-hidden="true">
      <svg focusable="false" className="us-lattice-svg">
        <defs>
          <path
            id="unblock-mark"
            d="M52.12 27.7189V24.3026C39.36 22.8808 29.2 12.7371 27.77 0H24.35C22.92 12.7371 12.76 22.8808 0 24.3026V27.7189C13.77 29.2527 24.51 40.9564 24.51 55.089V90.944H12.48V94.018H24.51V107.5648H12.48V110.6388H24.51V118.4918H27.58V55.0956C27.58 40.9498 38.32 29.2527 52.09 27.7189H52.12ZM26.06 44.1686L23.41 39.653C20.74 35.1243 16.94 31.3262 12.4 28.6668L7.88 26.0141L12.4 23.3613C16.94 20.702 20.74 16.9039 23.41 12.3751L26.06 7.8595L28.71 12.3751C31.38 16.9039 35.19 20.702 39.73 23.3613L44.25 26.0141L39.73 28.6668C35.19 31.3262 31.38 35.1243 28.71 39.653Z"
            fillRule="evenodd"
          />
          <pattern
            id="unblock-lattice-pat"
            patternUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="312.72"
            height="118.4918"
          >
            <g transform="scale(1)">
              <use href="#unblock-mark" fill="currentColor" transform="translate(0 0) translate(52.12 0) scale(-1 1)" />
              <use href="#unblock-mark" fill="currentColor" transform="translate(52.12 0) translate(0 118.4918) scale(1 -1)" />
              <use href="#unblock-mark" fill="currentColor" transform="translate(104.24 0) translate(52.12 0) scale(-1 1)" />
              <use href="#unblock-mark" fill="currentColor" transform="translate(156.36 0) translate(0 118.4918) scale(1 -1)" />
              <use href="#unblock-mark" fill="currentColor" transform="translate(208.48 0)" />
              <use href="#unblock-mark" fill="currentColor" transform="translate(260.6 0) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
            </g>
          </pattern>
        </defs>

        {/* Base lattice repeating seamlessly across 100% width and height */}
        <rect width="100%" height="100%" fill="url(#unblock-lattice-pat)" className="us-lattice-base" />

        {/* Scattered keys aligned pixel-perfectly with the underlying grid that gently flicker */}
        <g fill="currentColor" className="us-lattice-flicker-group">
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "3.6s", animationDelay: "-1.97s" }} transform="translate(364.84 118.49) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.0s", animationDelay: "-1.23s" }} transform="translate(990.28 1066.43) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.4s", animationDelay: "-4.02s" }} transform="translate(1250.88 710.95) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.8s", animationDelay: "-0.53s" }} transform="translate(1719.96 710.95) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "5.2s", animationDelay: "-3.41s" }} transform="translate(990.28 829.44) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "3.6s", animationDelay: "-3.04s" }} transform="translate(781.80 710.95) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.0s", animationDelay: "-0.46s" }} transform="translate(1198.76 473.97) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.4s", animationDelay: "-1.67s" }} transform="translate(1511.48 947.93) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.8s", animationDelay: "-0.89s" }} transform="translate(677.56 473.97) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "5.2s", animationDelay: "-5.1s" }} transform="translate(1772.08 0.00)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "3.6s", animationDelay: "-0.83s" }} transform="translate(833.92 829.44)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.0s", animationDelay: "-1.93s" }} transform="translate(729.68 355.48) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.4s", animationDelay: "-3.19s" }} transform="translate(1355.12 710.95) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.8s", animationDelay: "-2.82s" }} transform="translate(886.04 118.49) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "5.2s", animationDelay: "-0.85s" }} transform="translate(1407.24 236.98) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "3.6s", animationDelay: "-3.42s" }} transform="translate(0.00 1184.92) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.0s", animationDelay: "-2.86s" }} transform="translate(990.28 118.49) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.4s", animationDelay: "-0.91s" }} transform="translate(886.04 947.93) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.8s", animationDelay: "-0.46s" }} transform="translate(208.48 1066.43)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "5.2s", animationDelay: "-2.11s" }} transform="translate(1667.84 118.49) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "3.6s", animationDelay: "-2.12s" }} transform="translate(1042.40 473.97) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.0s", animationDelay: "-1.89s" }} transform="translate(938.16 829.44) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.4s", animationDelay: "-0.47s" }} transform="translate(260.60 710.95) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.8s", animationDelay: "-1.94s" }} transform="translate(260.60 473.97) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "5.2s", animationDelay: "-4.87s" }} transform="translate(990.28 236.98) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "3.6s", animationDelay: "-3.51s" }} transform="translate(1824.20 355.48) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.0s", animationDelay: "-0.45s" }} transform="translate(156.36 236.98) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.4s", animationDelay: "-1.77s" }} transform="translate(104.24 1184.92) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.8s", animationDelay: "-3.37s" }} transform="translate(1198.76 592.46) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "5.2s", animationDelay: "-3.57s" }} transform="translate(416.96 592.46) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "3.6s", animationDelay: "-1.47s" }} transform="translate(1563.60 710.95) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.0s", animationDelay: "-2.37s" }} transform="translate(990.28 355.48) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.4s", animationDelay: "-3.89s" }} transform="translate(938.16 1066.43) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.8s", animationDelay: "-4.68s" }} transform="translate(260.60 236.98) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "5.2s", animationDelay: "-3.97s" }} transform="translate(1772.08 473.97)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "3.6s", animationDelay: "-3.36s" }} transform="translate(1303.00 236.98) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.0s", animationDelay: "-1.18s" }} transform="translate(364.84 710.95) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.4s", animationDelay: "-0.97s" }} transform="translate(1146.64 1184.92)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.8s", animationDelay: "-3.9s" }} transform="translate(1511.48 0.00) translate(52.12 0) scale(-1 1) translate(0 118.4918) scale(1 -1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "5.2s", animationDelay: "-1.17s" }} transform="translate(1250.88 947.93) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "3.6s", animationDelay: "-1.66s" }} transform="translate(1563.60 118.49) translate(52.12 0) scale(-1 1)" />
        <use href="#unblock-mark" className="lattice-blink" style={{ animationDuration: "4.0s", animationDelay: "-0.96s" }} transform="translate(521.20 947.93)" />
        </g>
      </svg>
    </div>
  );
};
